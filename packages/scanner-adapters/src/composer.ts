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
import { sanitizeText, uniqueStrings } from './sanitize';

interface ComposerFindingInput {
  packageName: string;
  advisory: Record<string, unknown>;
}

function composerSeverity(value: unknown): DetectionFinding['severity'] {
  if (typeof value !== 'string') return 'unknown';
  switch (value.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
    case 'moderate':
      return 'medium';
    case 'low':
      return 'low';
    case 'info':
      return 'info';
    default:
      return 'unknown';
  }
}

function sourceIdentifiers(value: unknown): unknown[] {
  const sources = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  return sources.flatMap((source) => {
    if (!isRecord(source)) return [];
    return typeof source.remoteId === 'string' ? [source.remoteId] : [];
  });
}

function flattenAdvisories(value: Record<string, unknown>): {
  entries: ComposerFindingInput[];
  malformedCount: number;
} {
  const advisories = isRecord(value.advisories) ? value.advisories : undefined;
  if (!advisories) return { entries: [], malformedCount: 1 };

  const entries: ComposerFindingInput[] = [];
  let malformedCount = 0;
  for (const [packageName, packageAdvisories] of Object.entries(advisories)) {
    if (!Array.isArray(packageAdvisories)) {
      malformedCount += 1;
      continue;
    }
    for (const advisory of packageAdvisories) {
      if (!isRecord(advisory)) {
        malformedCount += 1;
        continue;
      }
      entries.push({ packageName, advisory });
    }
  }
  return { entries, malformedCount };
}

export async function parseComposerAuditJson(
  input: unknown,
  context: ParserContext = {},
): Promise<AdapterParseResult> {
  const parsed = parseJsonInput(input);
  if (parsed.malformed || !isRecord(parsed.value)) {
    return createFailedResult(
      'composer',
      context,
      'Output Composer Audit bukan object JSON yang valid.',
    );
  }

  const flattened = flattenAdvisories(parsed.value);
  if (flattened.malformedCount > 0 && !isRecord(parsed.value.advisories)) {
    return createFailedResult(
      'composer',
      context,
      'Output Composer Audit tidak memiliki advisories.',
    );
  }

  const base = await parseArrayEntries('composer', flattened.entries, context, async (entry) => {
    const advisory = entry.advisory;
    const packageName = sanitizeText(
      advisory.packageName ?? entry.packageName,
      256,
      'unknown-package',
    );
    const ids = uniqueStrings([
      advisory.advisoryId,
      advisory.cve,
      ...sourceIdentifiers(advisory.sources),
    ]);
    const advisoryId = ids[0];
    const ruleId = advisoryId ?? `composer-audit:${packageName}`;
    const title = sanitizeText(advisory.title, 500, `Advisory dependensi untuk ${packageName}`);
    const affectedVersions = sanitizeText(advisory.affectedVersions, 1_000);
    const messageRedacted = affectedVersions
      ? `${title}. Rentang terdampak: ${affectedVersions}`
      : title;
    const references = [advisory.link];
    const finding = await createFinding(
      {
        scanner: 'composer',
        fingerprintParts: [
          'sca',
          'packagist'.toLowerCase(),
          packageName.toLowerCase(),
          ...(ids.length > 0
            ? ids.map((id) => id.toLowerCase()).sort()
            : [ruleId.toLowerCase(), title.toLowerCase()]),
        ],
        ruleId,
        category: 'sca',
        severity: composerSeverity(advisory.severity),
        evidenceStatus: 'potentially_affected',
        title,
        messageRedacted,
        package: { ecosystem: 'Packagist', name: packageName },
        advisoryIds: ids,
        references,
      },
      context,
    );
    return finding ? [finding] : undefined;
  });

  if (flattened.malformedCount === 0) return base;
  return finalizeResult(
    'composer',
    base.findings,
    context,
    [
      ...base.warnings,
      `${flattened.malformedCount} bagian output Composer Audit tidak cocok dengan kontrak.`,
    ],
    context.status === 'timed_out' ? 'timed_out' : 'failed',
  );
}
