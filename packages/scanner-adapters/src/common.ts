import {
  detectionFindingSchema,
  scannerExecutionSchema,
  type DetectionFinding,
  type EvidenceStatus,
  type FindingCategory,
  type FindingSeverity,
  type ScannerExecution,
  type ScannerName,
  type ScannerStatus,
} from '@sentinel/contracts';
import {
  normalizeRepositoryPath,
  sanitizeReferenceUrl,
  sanitizeText,
  sha256Hex,
  uniqueStrings,
} from './sanitize';

export interface ParserContext {
  toolVersion?: string;
  durationMs?: number;
  checkoutRoot?: string;
  status?: ScannerStatus;
  skipReason?: string;
  error?: string;
  rulesetVersion?: string;
  rulesetDigest?: string;
  rulesetSource?: string;
  licenseGate?: 'approved' | 'blocked' | 'unknown';
}

export interface AdapterParseResult {
  scanner: ScannerName;
  execution: ScannerExecution;
  findings: DetectionFinding[];
  warnings: string[];
}

export interface FindingInput {
  scanner: ScannerName;
  scannerSources?: ScannerName[];
  fingerprintParts: readonly string[];
  ruleId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  evidenceStatus: EvidenceStatus;
  title: string;
  messageRedacted: string;
  filePath?: unknown;
  lineStart?: unknown;
  package?: { ecosystem: string; name: string; version?: string };
  advisoryIds?: readonly unknown[];
  references?: readonly unknown[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonInput(input: unknown): { value: unknown; malformed: boolean } {
  if (typeof input !== 'string') return { value: input, malformed: false };
  try {
    return { value: JSON.parse(input) as unknown, malformed: false };
  } catch {
    return { value: undefined, malformed: true };
  }
}

export async function createFinding(
  input: FindingInput,
  context: ParserContext,
): Promise<DetectionFinding | null> {
  const primaryScanner = input.scanner;
  const scannerSources = [...new Set(input.scannerSources ?? [primaryScanner])];
  const fingerprintSeed = JSON.stringify(['sentinel-finding-v1', ...input.fingerprintParts]);
  const rawPackage = input.package;
  const candidate = {
    scanner: primaryScanner,
    scannerSources,
    fingerprint: await sha256Hex(fingerprintSeed),
    ruleId: sanitizeText(input.ruleId, 255, 'unknown-rule'),
    category: input.category,
    severity: input.severity,
    evidenceStatus: input.evidenceStatus,
    title: sanitizeText(input.title, 500, 'Scanner finding'),
    messageRedacted: sanitizeText(
      input.messageRedacted,
      4_000,
      'Evidence details are unavailable.',
    ),
    filePath: normalizeRepositoryPath(input.filePath, context.checkoutRoot),
    lineStart:
      typeof input.lineStart === 'number' &&
      Number.isInteger(input.lineStart) &&
      input.lineStart > 0
        ? input.lineStart
        : undefined,
    package: rawPackage
      ? {
          ecosystem: sanitizeText(rawPackage.ecosystem, 80, 'unknown'),
          name: sanitizeText(rawPackage.name, 256, 'unknown-package'),
          ...(rawPackage.version ? { version: sanitizeText(rawPackage.version, 128) } : {}),
        }
      : undefined,
    advisoryIds: input.advisoryIds ? uniqueStrings(input.advisoryIds) : undefined,
    references: input.references
      ? [
          ...new Set(
            input.references
              .map(sanitizeReferenceUrl)
              .filter((item): item is string => Boolean(item)),
          ),
        ].slice(0, 100)
      : undefined,
  };

  const parsed = detectionFindingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function createFailedResult(
  scanner: ScannerName,
  context: ParserContext,
  message: string,
): AdapterParseResult {
  const status: ScannerStatus = context.status === 'timed_out' ? 'timed_out' : 'failed';
  return finalizeResult(scanner, [], context, [message], status);
}

export function finalizeResult(
  scanner: ScannerName,
  findings: DetectionFinding[],
  context: ParserContext,
  warnings: string[] = [],
  forcedStatus?: ScannerStatus,
): AdapterParseResult {
  const requestedStatus = forcedStatus ?? context.status ?? 'success';
  const requestedSkipReason = sanitizeText(context.skipReason, 500);
  const invalidSkip =
    requestedStatus === 'skipped' && (findings.length > 0 || !requestedSkipReason);
  const status = invalidSkip ? 'failed' : requestedStatus;
  const safeSkipReason = status === 'skipped' ? requestedSkipReason : undefined;
  const safeError =
    status === 'failed' || status === 'timed_out'
      ? sanitizeText(
          context.error ??
            warnings[0] ??
            (invalidSkip ? 'Status skip tidak valid atau tidak memiliki alasan.' : undefined),
          4_000,
          'Output scanner tidak dapat diproses.',
        )
      : undefined;
  const executionCandidate = {
    scanner,
    toolVersion: sanitizeText(context.toolVersion, 100, 'unknown'),
    status,
    durationMs:
      typeof context.durationMs === 'number' && Number.isFinite(context.durationMs)
        ? Math.max(0, Math.min(Math.trunc(context.durationMs), 86_400_000))
        : 0,
    findingsCount: findings.length,
    ...(safeSkipReason ? { skipReason: safeSkipReason } : {}),
    ...(safeError ? { sanitizedError: safeError } : {}),
    ...(context.rulesetVersion
      ? { rulesetVersion: sanitizeText(context.rulesetVersion, 200) }
      : {}),
    ...(context.rulesetDigest ? { rulesetDigest: context.rulesetDigest.toLowerCase() } : {}),
    ...(context.rulesetSource ? { rulesetSource: sanitizeText(context.rulesetSource, 500) } : {}),
    licenseGate: context.licenseGate ?? 'unknown',
  };
  const parsedExecution = scannerExecutionSchema.safeParse(executionCandidate);
  const execution = parsedExecution.success
    ? parsedExecution.data
    : scannerExecutionSchema.parse({
        scanner,
        toolVersion: sanitizeText(context.toolVersion, 100, 'unknown'),
        status: 'failed',
        durationMs: 0,
        findingsCount: findings.length,
        sanitizedError: 'Scanner provenance metadata is invalid.',
      });

  return {
    scanner,
    execution,
    findings,
    warnings: warnings.map((warning) =>
      sanitizeText(warning, 500, 'Some scanner output was omitted.'),
    ),
  };
}

export async function parseArrayEntries<T>(
  scanner: ScannerName,
  entries: T[],
  context: ParserContext,
  parseEntry: (entry: T) => Promise<DetectionFinding[] | undefined>,
): Promise<AdapterParseResult> {
  const findings: DetectionFinding[] = [];
  let malformedEntries = 0;
  for (const entry of entries) {
    try {
      const parsed = await parseEntry(entry);
      if (parsed === undefined) malformedEntries += 1;
      else findings.push(...parsed);
    } catch {
      malformedEntries += 1;
    }
  }
  const warnings =
    malformedEntries > 0
      ? [
          `${malformedEntries} entri output scanner tidak cocok dengan kontrak dan tidak disertakan.`,
        ]
      : [];
  const forcedStatus: ScannerStatus | undefined =
    context.status === 'timed_out' ? 'timed_out' : malformedEntries > 0 ? 'failed' : undefined;
  return finalizeResult(scanner, findings, context, warnings, forcedStatus);
}

export async function createFingerprint(parts: readonly string[]): Promise<string> {
  return sha256Hex(JSON.stringify(['sentinel-finding-v1', ...parts]));
}
