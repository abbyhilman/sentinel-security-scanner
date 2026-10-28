import type {
  DetectionFinding,
  ReportCoverage,
  ScannerExecution,
  ScannerName,
} from '@sentinel/contracts';

const allScanners: readonly ScannerName[] = ['semgrep', 'osv', 'gitleaks', 'composer'];

export function deriveReportStatus(
  executions: readonly ScannerExecution[],
  coverage: ReportCoverage,
): 'completed' | 'partial' | 'failed' {
  if (coverage.applicableScanners.length === 0) return 'failed';

  const byScanner = new Map(executions.map((execution) => [execution.scanner, execution]));
  const expectedSkips = new Set(coverage.skippedScanners.map((item) => item.scanner));
  let failedApplicableCount = 0;
  let successfulApplicableCount = 0;
  let incomplete = false;

  for (const scanner of allScanners) {
    const execution = byScanner.get(scanner);
    if (!execution) {
      incomplete = true;
      continue;
    }

    const applicable = coverage.applicableScanners.includes(scanner);
    if (applicable) {
      if (execution.status === 'success') successfulApplicableCount += 1;
      else if (execution.status === 'failed' || execution.status === 'timed_out')
        failedApplicableCount += 1;
      else incomplete = true;
      continue;
    }

    if (expectedSkips.has(scanner) && execution.status === 'skipped' && execution.skipReason)
      continue;
    incomplete = true;
  }

  if (incomplete) return 'partial';
  if (
    failedApplicableCount === coverage.applicableScanners.length &&
    successfulApplicableCount === 0
  ) {
    return 'failed';
  }
  return failedApplicableCount > 0 ? 'partial' : 'completed';
}

function sharesAdvisory(left: DetectionFinding, right: DetectionFinding): boolean {
  const leftIds = new Set((left.advisoryIds ?? []).map((id) => id.toLowerCase()));
  return (right.advisoryIds ?? []).some((id) => leftIds.has(id.toLowerCase()));
}

function compatiblePackage(left: DetectionFinding, right: DetectionFinding): boolean {
  if (!left.package || !right.package) return false;
  if (
    left.package.ecosystem.toLowerCase() !== right.package.ecosystem.toLowerCase() ||
    left.package.name.toLowerCase() !== right.package.name.toLowerCase()
  ) {
    return false;
  }
  if (
    left.package.version &&
    right.package.version &&
    left.package.version !== right.package.version
  )
    return false;
  return !left.filePath || !right.filePath || left.filePath === right.filePath;
}

function canMergeAdvisories(left: DetectionFinding, right: DetectionFinding): boolean {
  return (
    left.category === 'sca' &&
    right.category === 'sca' &&
    compatiblePackage(left, right) &&
    sharesAdvisory(left, right)
  );
}

function mergeFindings(left: DetectionFinding, right: DetectionFinding): DetectionFinding {
  const primary = left.scanner === 'osv' ? left : right.scanner === 'osv' ? right : left;
  const other = primary === left ? right : left;
  const sourceOrder: readonly ScannerName[] = ['osv', 'composer', 'semgrep', 'gitleaks'];
  const scannerSources = [...new Set([...left.scannerSources, ...right.scannerSources])].sort(
    (first, second) => sourceOrder.indexOf(first) - sourceOrder.indexOf(second),
  );
  return {
    ...primary,
    scannerSources,
    severity: left.severity === right.severity ? left.severity : 'unknown',
    evidenceStatus:
      left.evidenceStatus === right.evidenceStatus
        ? left.evidenceStatus
        : left.evidenceStatus === 'unknown' || right.evidenceStatus === 'unknown'
          ? 'unknown'
          : 'potentially_affected',
    package: {
      ...primary.package!,
      ...(!primary.package?.version && other.package?.version
        ? { version: other.package.version }
        : {}),
    },
    advisoryIds: [
      ...new Map(
        [...(left.advisoryIds ?? []), ...(right.advisoryIds ?? [])].map((id) => [
          id.toLowerCase(),
          id,
        ]),
      ).values(),
    ].slice(0, 100),
    references: [...new Set([...(left.references ?? []), ...(right.references ?? [])])].slice(
      0,
      100,
    ),
  };
}

/**
 * Combine duplicate package/advisory records while retaining scanner provenance.
 * Findings in different packages, versions, or known lockfile paths remain separate.
 */
export function deduplicateAdvisoryFindings(
  findings: readonly DetectionFinding[],
): DetectionFinding[] {
  const result: DetectionFinding[] = [];
  for (const finding of findings) {
    const matchingIndexes = result
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => canMergeAdvisories(candidate, finding));
    if (matchingIndexes.length === 1) {
      const { index, candidate } = matchingIndexes[0]!;
      result[index] = mergeFindings(candidate, finding);
    } else {
      result.push(finding);
    }
  }
  return result;
}
