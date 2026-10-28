import {
  createFailedResult,
  createFinding,
  parseArrayEntries,
  parseJsonInput,
  isRecord,
  type AdapterParseResult,
  type ParserContext,
} from './common';
import { normalizeRepositoryPath, sanitizeText } from './sanitize';

export async function parseGitleaksJson(
  input: unknown,
  context: ParserContext = {},
): Promise<AdapterParseResult> {
  const parsed = parseJsonInput(input);
  if (parsed.malformed || !Array.isArray(parsed.value)) {
    return createFailedResult('gitleaks', context, 'Output Gitleaks bukan array JSON yang valid.');
  }

  return parseArrayEntries('gitleaks', parsed.value, context, async (entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.RuleID !== 'string' ||
      typeof entry.File !== 'string' ||
      typeof entry.StartLine !== 'number' ||
      !Number.isInteger(entry.StartLine) ||
      entry.StartLine < 1
    ) {
      return undefined;
    }

    // Match, Secret, and Line are intentionally never read from untrusted CLI output.
    const ruleId = sanitizeText(entry.RuleID, 255, 'gitleaks-unknown-rule');
    const filePath = normalizeRepositoryPath(entry.File, context.checkoutRoot);
    const finding = await createFinding(
      {
        scanner: 'gitleaks',
        fingerprintParts: ['gitleaks', ruleId, filePath ?? 'unknown-path', String(entry.StartLine)],
        ruleId,
        category: 'secret',
        severity: 'unknown',
        evidenceStatus: 'detected',
        title: `Pola secret terdeteksi (${ruleId})`,
        messageRedacted:
          'Nilai secret tidak disertakan. Rotasi credential jika nilainya pernah digunakan.',
        filePath: entry.File,
        lineStart: entry.StartLine,
      },
      context,
    );
    return finding ? [finding] : undefined;
  });
}
