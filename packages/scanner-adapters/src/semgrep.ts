import type { DetectionFinding } from '@sentinel/contracts';
import {
  createFailedResult,
  createFinding,
  isRecord,
  parseArrayEntries,
  parseJsonInput,
  type AdapterParseResult,
  type ParserContext,
} from './common';
import { normalizeRepositoryPath, sanitizeText } from './sanitize';

function semgrepSeverity(value: unknown): DetectionFinding['severity'] {
  if (typeof value !== 'string') return 'unknown';
  switch (value.toUpperCase()) {
    case 'ERROR':
      return 'high';
    case 'WARNING':
      return 'medium';
    case 'INFO':
      return 'info';
    default:
      return 'unknown';
  }
}

function safeReferences(value: unknown): unknown[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value : [];
}

export async function parseSemgrepJson(
  input: unknown,
  context: ParserContext = {},
): Promise<AdapterParseResult> {
  const parsed = parseJsonInput(input);
  if (parsed.malformed || !isRecord(parsed.value) || !Array.isArray(parsed.value.results)) {
    return createFailedResult(
      'semgrep',
      context,
      'Output Semgrep bukan JSON yang valid atau tidak memiliki results.',
    );
  }

  return parseArrayEntries('semgrep', parsed.value.results, context, async (entry) => {
    if (!isRecord(entry) || typeof entry.check_id !== 'string' || typeof entry.path !== 'string') {
      return undefined;
    }
    const extra = isRecord(entry.extra) ? entry.extra : {};
    const metadata = isRecord(extra.metadata) ? extra.metadata : {};
    const start = isRecord(entry.start) ? entry.start : {};
    const lineStart = typeof start.line === 'number' ? start.line : undefined;
    const ruleId = sanitizeText(entry.check_id, 255, 'semgrep-unknown-rule');
    const message = sanitizeText(
      extra.message,
      4_000,
      'Semgrep mendeteksi pola yang perlu ditinjau.',
    );
    const title = sanitizeText(metadata.name, 500, ruleId);
    const path = normalizeRepositoryPath(entry.path, context.checkoutRoot);
    const finding = await createFinding(
      {
        scanner: 'semgrep',
        fingerprintParts: ['semgrep', ruleId, path ?? 'unknown-path', String(lineStart ?? 0)],
        ruleId,
        category: 'sast',
        severity: semgrepSeverity(extra.severity),
        evidenceStatus: 'detected',
        title,
        messageRedacted: message,
        filePath: entry.path,
        lineStart,
        references: safeReferences(metadata.references),
      },
      context,
    );
    return finding ? [finding] : undefined;
  });
}
