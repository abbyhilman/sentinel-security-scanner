import type { DetectionFinding } from '@sentinel/contracts';
import {
  createFailedResult,
  createFinding,
  finalizeResult,
  isRecord,
  parseArrayEntries,
  parseJsonInput,
  type AdapterParseResult,
  type ParserContext,
} from './common';
import { normalizeRepositoryPath, sanitizeText, uniqueStrings } from './sanitize';

interface OsvFindingInput {
  package: { ecosystem: string; name: string; version?: string };
  filePath?: string;
  vulnerability: Record<string, unknown>;
}

function osvSeverity(value: unknown): DetectionFinding['severity'] {
  if (typeof value !== 'string') return 'unknown';
  switch (value.toLowerCase()) {
    case 'critical':
    case 'high':
    case 'medium':
    case 'low':
    case 'info':
      return value.toLowerCase() as DetectionFinding['severity'];
    default:
      return 'unknown';
  }
}

function collectReferences(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((reference) =>
    isRecord(reference) && typeof reference.url === 'string' ? [reference.url] : [],
  );
}

function flattenOsvResults(results: unknown[]): {
  entries: OsvFindingInput[];
  malformedCount: number;
} {
  const entries: OsvFindingInput[] = [];
  let malformedCount = 0;

  for (const result of results) {
    if (!isRecord(result) || !Array.isArray(result.packages)) {
      malformedCount += 1;
      continue;
    }
    const source = isRecord(result.source) ? result.source : {};
    const filePath = typeof source.path === 'string' ? source.path : undefined;
    for (const packageResult of result.packages) {
      if (!isRecord(packageResult) || !isRecord(packageResult.package)) {
        malformedCount += 1;
        continue;
      }
      const rawPackage = packageResult.package;
      if (typeof rawPackage.name !== 'string' || typeof rawPackage.ecosystem !== 'string') {
        malformedCount += 1;
        continue;
      }
      const vulnerabilities = Array.isArray(packageResult.vulnerabilities)
        ? packageResult.vulnerabilities
        : [];
      if (
        packageResult.vulnerabilities !== undefined &&
        !Array.isArray(packageResult.vulnerabilities)
      ) {
        malformedCount += 1;
        continue;
      }
      for (const vulnerability of vulnerabilities) {
        if (!isRecord(vulnerability) || typeof vulnerability.id !== 'string') {
          malformedCount += 1;
          continue;
        }
        entries.push({
          package: {
            name: rawPackage.name,
            ecosystem: rawPackage.ecosystem,
            ...(typeof rawPackage.version === 'string' ? { version: rawPackage.version } : {}),
          },
          filePath,
          vulnerability,
        });
      }
    }
  }
  return { entries, malformedCount };
}

export async function parseOsvJson(
  input: unknown,
  context: ParserContext = {},
): Promise<AdapterParseResult> {
  const parsed = parseJsonInput(input);
  if (parsed.malformed || !isRecord(parsed.value) || !Array.isArray(parsed.value.results)) {
    return createFailedResult(
      'osv',
      context,
      'Output OSV-Scanner bukan JSON yang valid atau tidak memiliki results.',
    );
  }

  const flattened = flattenOsvResults(parsed.value.results);
  const base = await parseArrayEntries('osv', flattened.entries, context, async (entry) => {
    if (!isRecord(entry.vulnerability)) return undefined;
    const vulnerability = entry.vulnerability;
    const id = sanitizeText(vulnerability.id, 120, 'OSV-UNKNOWN');
    const aliases = uniqueStrings(
      [id, ...(Array.isArray(vulnerability.aliases) ? vulnerability.aliases : [])],
      100,
    );
    const databaseSpecific = isRecord(vulnerability.database_specific)
      ? vulnerability.database_specific
      : {};
    const summary = sanitizeText(vulnerability.summary, 500, id);
    const details = sanitizeText(vulnerability.details, 4_000, summary);
    const path = normalizeRepositoryPath(entry.filePath, context.checkoutRoot);
    const packageName = sanitizeText(entry.package.name, 256, 'unknown-package');
    const ecosystem = sanitizeText(entry.package.ecosystem, 80, 'unknown');
    const finding = await createFinding(
      {
        scanner: 'osv',
        fingerprintParts: [
          'sca',
          ecosystem.toLowerCase(),
          packageName.toLowerCase(),
          path ?? 'unknown-path',
          ...aliases.map((alias) => alias.toLowerCase()).sort(),
        ],
        ruleId: id,
        category: 'sca',
        severity: osvSeverity(databaseSpecific.severity),
        evidenceStatus: 'potentially_affected',
        title: summary,
        messageRedacted: details,
        filePath: entry.filePath,
        package: {
          ecosystem,
          name: packageName,
          ...(entry.package.version ? { version: entry.package.version } : {}),
        },
        advisoryIds: aliases,
        references: collectReferences(vulnerability.references),
      },
      context,
    );
    return finding ? [finding] : undefined;
  });

  if (flattened.malformedCount === 0) return base;
  return finalizeResult(
    'osv',
    base.findings,
    context,
    [
      ...base.warnings,
      `${flattened.malformedCount} bagian output OSV-Scanner tidak cocok dengan kontrak.`,
    ],
    context.status === 'timed_out' ? 'timed_out' : 'failed',
  );
}
