import { describe, expect, it, vi } from 'vitest';
import {
  createIdempotencyKey,
  createIngestHandler,
  type IngestCommand,
  type IngestOutcome,
} from '../../../supabase/functions/sentinel-ingest/handler.ts';
import {
  createGitHubOidcVerifier,
  GITHUB_OIDC_ISSUER,
  GITHUB_OIDC_JWKS_URL,
  OidcTokenError,
} from '../../../supabase/functions/sentinel-ingest/oidc.ts';

const NOW = Date.parse('2026-10-28T02:00:00.000Z');
const AUDIENCE = 'https://example.supabase.co/functions/v1/sentinel-ingest';
const REPOSITORY = 'abbyhilman/sentinel-security-scanner';
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/sentinel-scan.yml@refs/heads/main`;
const PAIRING_NONCE = 'fixture_pairing_nonce_123456789';

interface SigningFixture {
  readonly privateKey: CryptoKey;
  readonly publicJwk: JsonWebKey & { readonly kid: string };
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    toArrayBuffer(new TextEncoder().encode(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function createSigningFixture(): Promise<SigningFixture> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exportedJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicJwk = {
    ...exportedJwk,
    kid: 'sentinel-local-test-key',
    alg: 'RS256',
    use: 'sig',
  };
  return { privateKey: keyPair.privateKey, publicJwk };
}

async function makeToken(
  fixture: SigningFixture,
  options: {
    readonly audience?: string;
    readonly exp?: number;
    readonly issuer?: string;
    readonly repositoryId?: string;
    readonly workflowRef?: string;
    readonly sha?: string;
    readonly eventName?: string;
    readonly algorithm?: string;
  } = {},
): Promise<string> {
  const header = base64UrlJson({
    alg: options.algorithm ?? 'RS256',
    kid: 'sentinel-local-test-key',
    typ: 'JWT',
  });
  const payload = base64UrlJson({
    iss: options.issuer ?? GITHUB_OIDC_ISSUER,
    aud: options.audience ?? AUDIENCE,
    exp: options.exp ?? Math.floor(NOW / 1_000) + 300,
    iat: Math.floor(NOW / 1_000) - 30,
    nbf: Math.floor(NOW / 1_000) - 30,
    repository_id: options.repositoryId ?? '123456789',
    repository: REPOSITORY,
    workflow_ref: options.workflowRef ?? WORKFLOW_REF,
    run_id: '987654321',
    run_attempt: '1',
    sha: options.sha ?? 'a'.repeat(40),
    ref: 'refs/heads/main',
    event_name: options.eventName ?? 'workflow_dispatch',
    sub: 'repo:legacy-format-is-not-trusted',
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    fixture.privateKey,
    toArrayBuffer(new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function verifierFor(fixture: SigningFixture, audience = AUDIENCE) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe(GITHUB_OIDC_JWKS_URL);
    return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' },
    });
  });
  const verify = createGitHubOidcVerifier({ audience, fetcher, now: () => NOW });
  return { verify, fetcher };
}

function makeReport(options: { readonly secretMessage?: string; readonly sha?: string } = {}) {
  return {
    schemaVersion: 1,
    repository: { id: 123456789, fullName: REPOSITORY },
    github: {
      runId: 987654321,
      runAttempt: 1,
      sha: options.sha ?? 'a'.repeat(40),
      ref: 'refs/heads/main',
      workflowRef: WORKFLOW_REF,
    },
    pairingNonce: PAIRING_NONCE,
    summary: {
      status: 'completed',
      startedAt: '2026-10-28T01:59:00.000Z',
      completedAt: '2026-10-28T02:00:00.000Z',
    },
    scannerExecutions: [
      {
        scanner: 'gitleaks',
        toolVersion: '8.30.1',
        status: 'success',
        durationMs: 100,
        findingsCount: options.secretMessage ? 1 : 0,
        licenseGate: 'unknown',
      },
    ],
    findings: options.secretMessage
      ? [
          {
            scanner: 'gitleaks',
            scannerSources: ['gitleaks'],
            fingerprint: 'b'.repeat(64),
            ruleId: 'generic-api-key',
            category: 'secret',
            severity: 'unknown',
            evidenceStatus: 'detected',
            title: 'Credential detected',
            messageRedacted: options.secretMessage,
            filePath: 'src/config.ts',
            lineStart: 8,
          },
        ]
      : [],
    coverage: {
      languages: ['typescript'],
      frameworkHints: [],
      projects: [],
      applicableScanners: ['gitleaks'],
      skippedScanners: [],
      missingLockfiles: [],
      warnings: [],
    },
  };
}

async function requestFor(
  token: string,
  body: string,
  idempotencyKey?: string,
  contentLength?: string,
): Promise<Request> {
  const key = idempotencyKey ?? (await createIdempotencyKey('123456789', '987654321', '1'));
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'idempotency-key': key,
  });
  if (contentLength) headers.set('content-length', contentLength);
  return new Request('https://sentinel.test/functions/v1/sentinel-ingest', {
    method: 'POST',
    headers,
    body,
  });
}

async function readResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe('GitHub OIDC verifier for sentinel-ingest', () => {
  it('verifies a local RS256 signature using the fixed GitHub JWKS endpoint', async () => {
    const fixture = await createSigningFixture();
    const { verify, fetcher } = verifierFor(fixture);
    const token = await makeToken(fixture);

    const claims = await verify(token);

    expect(claims.repository_id).toBe('123456789');
    expect(claims.workflow_ref).toBe(WORKFLOW_REF);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects wrong audience, expired tokens, and non-RS256 algorithms', async () => {
    const fixture = await createSigningFixture();
    const { verify } = verifierFor(fixture);
    await expect(
      makeToken(fixture, { audience: 'sentinel-ingest' }).then(verify),
    ).rejects.toBeInstanceOf(OidcTokenError);
    await expect(
      makeToken(fixture, { exp: Math.floor(NOW / 1_000) - 60 }).then(verify),
    ).rejects.toBeInstanceOf(OidcTokenError);
    await expect(makeToken(fixture, { algorithm: 'HS256' }).then(verify)).rejects.toBeInstanceOf(
      OidcTokenError,
    );
  });

  it('rejects a forged signature without returning claim details', async () => {
    const fixture = await createSigningFixture();
    const { verify } = verifierFor(fixture);
    const validToken = await makeToken(fixture);
    const parts = validToken.split('.');
    parts[2] = base64Url(new Uint8Array(256).fill(0));

    await expect(verify(parts.join('.'))).rejects.toBeInstanceOf(OidcTokenError);
  });
});

describe('sentinel-ingest HTTP handler', () => {
  it('rejects a repository mismatch before any database RPC', async () => {
    const fixture = await createSigningFixture();
    const { verify } = verifierFor(fixture);
    const token = await makeToken(fixture);
    const persist = vi.fn(async (): Promise<IngestOutcome> => ({
      ok: true,
      scanId: '00000000-0000-4000-8000-000000000001',
      replayed: false,
    }));
    const handle = createIngestHandler({ verifyToken: verify, persist });
    const body = JSON.stringify(makeReport({ sha: 'c'.repeat(40) }));

    const result = await readResponse(await handle(await requestFor(token, body)));

    expect(result.status).toBe(403);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects oversized reports before token verification or RPC', async () => {
    const verifyToken = vi.fn();
    const persist = vi.fn();
    const handle = createIngestHandler({ verifyToken, persist });
    const result = await readResponse(
      await handle(await requestFor('ignored', '{}', undefined, String(4 * 1024 * 1024 + 1))),
    );

    expect(result.status).toBe(413);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('hashes the one-time nonce, redacts a secret, and never passes the bearer token to persistence', async () => {
    const fixture = await createSigningFixture();
    const { verify } = verifierFor(fixture);
    const token = await makeToken(fixture);
    const secret = 'ghp_123456789012345678901234';
    let savedCommand: IngestCommand | undefined;
    const persist = vi.fn(async (command: IngestCommand): Promise<IngestOutcome> => {
      savedCommand = command;
      return {
        ok: true,
        scanId: '00000000-0000-4000-8000-000000000001',
        replayed: false,
      };
    });
    const handle = createIngestHandler({ verifyToken: verify, persist });
    const body = JSON.stringify(makeReport({ secretMessage: `token=${secret}` }));

    const result = await readResponse(await handle(await requestFor(token, body)));

    expect(result.status).toBe(201);
    expect(savedCommand?.pairingNonceHash).toBe(await sha256Hex(PAIRING_NONCE));
    expect(JSON.stringify(savedCommand?.report)).not.toContain(PAIRING_NONCE);
    expect(JSON.stringify(savedCommand?.report)).not.toContain(secret);
    expect(JSON.stringify(savedCommand)).not.toContain(token);
  });

  it('returns the RPC replay/conflict outcomes with stable run-tuple idempotency', async () => {
    const fixture = await createSigningFixture();
    const { verify } = verifierFor(fixture);
    const token = await makeToken(fixture);
    const outcomes: IngestOutcome[] = [
      { ok: true, scanId: '00000000-0000-4000-8000-000000000001', replayed: false },
      { ok: true, scanId: '00000000-0000-4000-8000-000000000001', replayed: true },
      { ok: false, code: 'idempotency_conflict' },
    ];
    const persist = vi.fn(async () => outcomes.shift()!);
    const handle = createIngestHandler({ verifyToken: verify, persist });
    const originalBody = JSON.stringify(makeReport());
    const key = await createIdempotencyKey('123456789', '987654321', '1');

    const first = await readResponse(await handle(await requestFor(token, originalBody, key)));
    const second = await readResponse(await handle(await requestFor(token, originalBody, key)));
    const changedBody = JSON.stringify({ ...makeReport(), pairingNonce: `${PAIRING_NONCE}x` });
    const third = await readResponse(await handle(await requestFor(token, changedBody, key)));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(third.status).toBe(409);
    expect(persist).toHaveBeenCalledTimes(3);
  });

  it('rejects sensitive evidence paths that cannot be redacted without changing provenance', async () => {
    const fixture = await createSigningFixture();
    const { verify } = verifierFor(fixture);
    const token = await makeToken(fixture);
    const persist = vi.fn();
    const handle = createIngestHandler({ verifyToken: verify, persist });
    const report = makeReport({ secretMessage: 'safe text' });
    report.findings[0]!.filePath = `src/${'ghp_123456789012345678901234'}.ts`;

    const result = await readResponse(
      await handle(await requestFor(token, JSON.stringify(report))),
    );

    expect(result.status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });
});
