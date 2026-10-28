import { describe, expect, it } from 'vitest';
import { detectRepositoryCoverage } from '../src/coverage';
import { parseComposerAuditJson, parseOsvJson } from '../src';
import { deduplicateAdvisoryFindings, deriveReportStatus } from '../src/report';
import { finalizeResult } from '../src/common';

describe('coverage and report behavior', () => {
  it('detects nested Node and Composer projects independent of file ordering', () => {
    const coverage = detectRepositoryCoverage([
      { path: 'services/api/pnpm-lock.yaml' },
      {
        path: 'services/api/package.json',
        content: JSON.stringify({ dependencies: { next: '1.0.0', express: '1.0.0' } }),
      },
      { path: 'legacy/composer.lock' },
      {
        path: 'legacy/composer.json',
        content: JSON.stringify({ require: { 'laravel/framework': '^1.0' } }),
      },
      { path: 'legacy/public/index.php' },
      { path: 'services/api/src/main.ts' },
      { path: 'services/api/src/main.ts' },
      {
        path: 'worker/package.json',
        content: JSON.stringify({ dependencies: { express: '^1.0' } }),
      },
    ]);

    expect(coverage.projects).toHaveLength(3);
    expect(coverage.languages).toEqual(['javascript', 'php', 'typescript']);
    expect(coverage.frameworkHints).toEqual(['Express', 'Laravel', 'Next.js']);
    expect(coverage.applicableScanners).toEqual(['gitleaks', 'semgrep', 'osv', 'composer']);
    expect(coverage.missingLockfiles).toMatchObject([
      { projectPath: 'worker', ecosystem: 'node', manifestPath: 'worker/package.json' },
    ]);
  });

  it('reports expected skips and never calls an empty scan complete', () => {
    const coverage = detectRepositoryCoverage([{ path: 'README.md' }]);
    const executions = [
      finalizeResult('gitleaks', [], { status: 'success' }).execution,
      ...coverage.skippedScanners.map(
        ({ scanner, reason }) =>
          finalizeResult(scanner, [], { status: 'skipped', skipReason: reason }).execution,
      ),
    ];
    expect(deriveReportStatus(executions, coverage)).toBe('completed');
    expect(deriveReportStatus([], { ...coverage, applicableScanners: [] })).toBe('failed');
    expect(deriveReportStatus(executions.slice(0, 1), coverage)).toBe('partial');
    expect(finalizeResult('composer', [], { status: 'skipped' }).execution.status).toBe('failed');
  });

  it('derives partial and failed when applicable scanner execution fails', () => {
    const coverage = detectRepositoryCoverage([{ path: 'src/app.ts' }]);
    const executions = [
      finalizeResult('gitleaks', [], { status: 'failed', error: 'synthetic failure' }).execution,
      finalizeResult('semgrep', [], { status: 'failed', error: 'synthetic failure' }).execution,
      ...coverage.skippedScanners.map(
        ({ scanner, reason }) =>
          finalizeResult(scanner, [], { status: 'skipped', skipReason: reason }).execution,
      ),
    ];
    expect(deriveReportStatus(executions, coverage)).toBe('failed');
    const mixed = [
      finalizeResult('gitleaks', [], { status: 'success' }).execution,
      finalizeResult('semgrep', [], { status: 'timed_out', error: 'synthetic timeout' }).execution,
      ...coverage.skippedScanners
        .filter(({ scanner }) => scanner !== 'semgrep')
        .map(
          ({ scanner, reason }) =>
            finalizeResult(scanner, [], { status: 'skipped', skipReason: reason }).execution,
        ),
    ];
    expect(deriveReportStatus(mixed, coverage)).toBe('partial');
  });

  it('deduplicates shared OSV and Composer aliases but preserves source provenance', async () => {
    const osv = await parseOsvJson({
      results: [
        {
          source: { path: 'composer.lock' },
          packages: [
            {
              package: {
                name: 'sentinel-fixture/demo-lib',
                version: '1.0.0',
                ecosystem: 'Packagist',
              },
              vulnerabilities: [
                {
                  id: 'SENTINEL-TEST-ADVISORY-0001',
                  aliases: ['SENTINEL-TEST-ALIAS-0001'],
                  summary: 'Synthetic OSV advisory',
                  database_specific: { severity: 'high' },
                },
              ],
            },
          ],
        },
      ],
    });
    const composer = await parseComposerAuditJson({
      advisories: {
        'sentinel-fixture/demo-lib': [
          {
            advisoryId: 'SENTINEL-TEST-ALIAS-0001',
            title: 'Synthetic Composer advisory',
            severity: 'low',
          },
        ],
      },
    });

    const merged = deduplicateAdvisoryFindings([...osv.findings, ...composer.findings]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      scanner: 'osv',
      scannerSources: ['osv', 'composer'],
      severity: 'unknown',
      evidenceStatus: 'potentially_affected',
    });
  });

  it('keeps same advisory occurrences in distinct lockfile paths separate', async () => {
    const osv = await parseOsvJson({
      results: ['packages/a/composer.lock', 'packages/b/composer.lock'].map((path) => ({
        source: { path },
        packages: [
          {
            package: {
              name: 'sentinel-fixture/demo-lib',
              version: '1.0.0',
              ecosystem: 'Packagist',
            },
            vulnerabilities: [{ id: 'SENTINEL-TEST-ADVISORY-0001', summary: 'Synthetic advisory' }],
          },
        ],
      })),
    });
    const composer = await parseComposerAuditJson({
      advisories: {
        'sentinel-fixture/demo-lib': [
          { advisoryId: 'SENTINEL-TEST-ADVISORY-0001', title: 'Composer advisory' },
        ],
      },
    });
    expect(deduplicateAdvisoryFindings([...osv.findings, ...composer.findings])).toHaveLength(3);
    expect(new Set(osv.findings.map(({ fingerprint }) => fingerprint)).size).toBe(2);
  });
});
