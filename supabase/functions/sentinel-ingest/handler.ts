import {
  reportEnvelopeSchema,
  type ReportEnvelope,
} from '../../../packages/contracts/src/scanner.ts';
import { OidcTokenError, OidcUnavailableError, type GitHubOidcClaims } from './oidc.ts';

const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?\s*$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const sensitiveValuePatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/giu,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/gu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
  /((?:password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*)(?:Bearer\s+)?([^\s,;]{1,})/giu,
];

const identityOrPathKeys = new Set([
  'repository',
  'fullName',
  'id',
  'runId',
  'runAttempt',
  'sha',
  'ref',
  'workflowRef',
  'workflow_ref',
  'fingerprint',
  'scanner',
  'scannerSources',
  'advisoryIds',
  'filePath',
  'projectPath',
  'manifestPath',
  'lockfiles',
  'references',
]);

export interface IngestIdentityClaims {
  readonly issuer: string;
  readonly audience: string;
  readonly repositoryId: string;
  readonly repository: string;
  readonly workflowRef: string;
  readonly runId: string;
  readonly runAttempt: string;
  readonly sha: string;
  readonly ref: string;
  readonly eventName: 'push' | 'workflow_dispatch';
}

export interface IngestCommand {
  readonly report: Omit<ReportEnvelope, 'pairingNonce'>;
  readonly pairingNonceHash: string | null;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly oidcClaimDigest: string;
  readonly claims: IngestIdentityClaims;
}

export type IngestOutcome =
  | { readonly ok: true; readonly scanId: string; readonly replayed: boolean }
  | {
      readonly ok: false;
      readonly code:
        | 'pairing_required'
        | 'pairing_invalid'
        | 'repository_mismatch'
        | 'workflow_not_allowed'
        | 'idempotency_conflict'
        | 'rate_limited'
        | 'invalid_report';
    };

export interface IngestHandlerDependencies {
  readonly verifyToken: (token: string) => Promise<GitHubOidcClaims>;
  readonly persist: (command: IngestCommand) => Promise<IngestOutcome>;
}

export class UnsafeReportError extends Error {
  constructor() {
    super('The report contains sensitive data in a field that cannot be redacted safely.');
    this.name = 'UnsafeReportError';
  }
}

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function redactText(value: string): string {
  return value
    .replace(sensitiveValuePatterns[0]!, '[REDACTED PRIVATE KEY]')
    .replace(sensitiveValuePatterns[1]!, '[REDACTED]')
    .replace(sensitiveValuePatterns[2]!, '[REDACTED]')
    .replace(sensitiveValuePatterns[3]!, '$1[REDACTED]');
}

function redactReportValues(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    const redacted = redactText(value);
    if (redacted !== value && key && identityOrPathKeys.has(key)) throw new UnsafeReportError();
    return redacted;
  }
  if (Array.isArray(value)) return value.map((item) => redactReportValues(item, key));
  if (typeof value !== 'object' || value === null) return value;

  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = redactReportValues(childValue, childKey);
  }
  return result;
}

async function readBoundedBody(request: Request): Promise<Uint8Array | Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) return response(400, { error: 'invalid_content_length' });
    if (Number(contentLength) > MAX_REPORT_BYTES)
      return response(413, { error: 'payload_too_large' });
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REPORT_BYTES) {
        await reader.cancel();
        return response(413, { error: 'payload_too_large' });
      }
      chunks.push(value);
    }
  } catch {
    return response(400, { error: 'invalid_body' });
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createIdempotencyKey(
  repositoryId: string,
  runId: string,
  runAttempt: string,
): Promise<string> {
  return sha256Hex(`sentinel:v1:${repositoryId}:${runId}:${runAttempt}`);
}

function claimIdentity(claims: GitHubOidcClaims): IngestIdentityClaims {
  return {
    issuer: claims.iss,
    audience: claims.aud,
    repositoryId: claims.repository_id,
    repository: claims.repository,
    workflowRef: claims.workflow_ref,
    runId: claims.run_id,
    runAttempt: claims.run_attempt,
    sha: claims.sha.toLowerCase(),
    ref: claims.ref,
    eventName: claims.event_name,
  };
}

function identitiesMatch(report: ReportEnvelope, claims: IngestIdentityClaims): boolean {
  return (
    Number.isSafeInteger(Number(claims.repositoryId)) &&
    Number.isSafeInteger(Number(claims.runId)) &&
    report.repository.id === Number(claims.repositoryId) &&
    report.repository.fullName.toLowerCase() === claims.repository.toLowerCase() &&
    report.github.runId === Number(claims.runId) &&
    report.github.runAttempt === Number(claims.runAttempt) &&
    report.github.sha.toLowerCase() === claims.sha &&
    report.github.ref === claims.ref &&
    report.github.workflowRef === claims.workflowRef
  );
}

function claimDigestInput(claims: IngestIdentityClaims): string {
  return JSON.stringify({
    issuer: claims.issuer,
    audience: claims.audience,
    repositoryId: claims.repositoryId,
    repository: claims.repository,
    workflowRef: claims.workflowRef,
    runId: claims.runId,
    runAttempt: claims.runAttempt,
    sha: claims.sha,
    ref: claims.ref,
    eventName: claims.eventName,
  });
}

function ensureEvidencePaths(report: ReportEnvelope): ReportEnvelope {
  const findings = report.findings.map((finding) => {
    if (finding.filePath) return finding;
    if (finding.category !== 'sca' || !finding.package) throw new UnsafeReportError();

    const packageEcosystem = finding.package.ecosystem.toLowerCase();
    const targetEcosystem = ['composer', 'packagist', 'packagist.org'].includes(packageEcosystem)
      ? 'composer'
      : ['npm', 'node', 'npm-package'].includes(packageEcosystem)
        ? 'node'
        : undefined;
    if (!targetEcosystem) throw new UnsafeReportError();

    const lockfiles = [
      ...new Set(
        report.coverage.projects
          .filter((project) => project.ecosystem === targetEcosystem)
          .flatMap((project) => project.lockfiles),
      ),
    ];
    if (lockfiles.length !== 1) throw new UnsafeReportError();
    return { ...finding, filePath: lockfiles[0] };
  });
  return { ...report, findings };
}

function resultForPersistedOutcome(outcome: IngestOutcome): Response {
  if (outcome.ok) {
    return response(outcome.replayed ? 200 : 201, {
      ok: true,
      scanId: outcome.scanId,
      replayed: outcome.replayed,
    });
  }

  switch (outcome.code) {
    case 'pairing_required':
      return response(403, { error: outcome.code });
    case 'pairing_invalid':
    case 'repository_mismatch':
    case 'workflow_not_allowed':
      return response(403, { error: outcome.code });
    case 'idempotency_conflict':
      return response(409, { error: outcome.code });
    case 'rate_limited':
      return response(429, { error: outcome.code });
    case 'invalid_report':
      return response(400, { error: outcome.code });
  }
}

export function createIngestHandler(dependencies: IngestHandlerDependencies) {
  return async function handleIngest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return response(405, { error: 'method_not_allowed' });
    }
    if (!CONTENT_TYPE_PATTERN.test(request.headers.get('content-type') ?? '')) {
      return response(415, { error: 'unsupported_media_type' });
    }

    const bodyResult = await readBoundedBody(request);
    if (bodyResult instanceof Response) return bodyResult;
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyResult));
    } catch {
      return response(400, { error: 'invalid_json' });
    }

    const validatedReport = reportEnvelopeSchema.safeParse(parsedBody);
    if (!validatedReport.success) return response(400, { error: 'invalid_report' });

    const authorization = request.headers.get('authorization') ?? '';
    const bearerMatch = /^Bearer\s+([A-Za-z0-9_.-]{1,16384})$/iu.exec(authorization);
    if (!bearerMatch) return response(401, { error: 'unauthorized' });
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    if (!SHA256_PATTERN.test(idempotencyKey))
      return response(400, { error: 'invalid_idempotency_key' });

    let claims: GitHubOidcClaims;
    try {
      claims = await dependencies.verifyToken(bearerMatch[1]!);
    } catch (error) {
      if (error instanceof OidcUnavailableError)
        return response(503, { error: 'identity_provider_unavailable' });
      if (error instanceof OidcTokenError) return response(401, { error: 'unauthorized' });
      return response(503, { error: 'identity_provider_unavailable' });
    }

    const identity = claimIdentity(claims);
    if (!identitiesMatch(validatedReport.data, identity)) {
      return response(403, { error: 'repository_mismatch' });
    }
    const expectedIdempotencyKey = await createIdempotencyKey(
      identity.repositoryId,
      identity.runId,
      identity.runAttempt,
    );
    if (idempotencyKey !== expectedIdempotencyKey) {
      return response(400, { error: 'invalid_idempotency_key' });
    }

    let sanitizedReport: ReportEnvelope;
    try {
      sanitizedReport = ensureEvidencePaths(
        reportEnvelopeSchema.parse(redactReportValues(validatedReport.data)),
      );
    } catch (error) {
      if (error instanceof UnsafeReportError) return response(400, { error: 'unsafe_report' });
      return response(400, { error: 'invalid_report' });
    }

    const payloadHash = await sha256Hex(bodyResult);
    const oidcClaimDigest = await sha256Hex(claimDigestInput(identity));
    const pairingNonceHash = sanitizedReport.pairingNonce
      ? await sha256Hex(sanitizedReport.pairingNonce)
      : null;
    const reportWithoutNonce: ReportEnvelope = { ...sanitizedReport };
    delete reportWithoutNonce.pairingNonce;

    try {
      const outcome = await dependencies.persist({
        report: reportWithoutNonce,
        pairingNonceHash,
        idempotencyKey,
        payloadHash,
        oidcClaimDigest,
        claims: identity,
      });
      return resultForPersistedOutcome(outcome);
    } catch {
      return response(503, { error: 'ingestion_temporarily_unavailable' });
    }
  };
}
