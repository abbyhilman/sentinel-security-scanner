import { describe, expect, it } from 'vitest';
import { detectionFindingSchema, reportEnvelopeSchema, scannerExecutionSchema } from './scanner';

const coverage = {
  languages: ['typescript'],
  frameworkHints: [],
  projects: [],
  applicableScanners: ['gitleaks'],
  skippedScanners: [
    { scanner: 'semgrep', reason: 'Tidak ditemukan file sumber yang didukung.' },
    { scanner: 'osv', reason: 'Lockfile tidak ditemukan.' },
    { scanner: 'composer', reason: 'composer.lock tidak ditemukan.' },
  ],
  missingLockfiles: [],
  warnings: [],
};

const finding = {
  scanner: 'gitleaks',
  scannerSources: ['gitleaks'],
  fingerprint: 'a'.repeat(64),
  ruleId: 'generic-api-key',
  category: 'secret',
  severity: 'unknown',
  evidenceStatus: 'detected',
  title: 'Pola secret terdeteksi',
  messageRedacted: 'Nilai secret tidak disertakan.',
  filePath: 'src/config.ts',
  lineStart: 12,
};

describe('scanner contracts', () => {
  it('rejects absolute and traversing file paths', () => {
    expect(
      detectionFindingSchema.safeParse({ ...finding, filePath: 'C:/agent/_work/repo/file.ts' })
        .success,
    ).toBe(false);
    expect(
      detectionFindingSchema.safeParse({ ...finding, filePath: 'src/../secrets.ts' }).success,
    ).toBe(false);
  });

  it('rejects untrusted reference hosts and non-HTTPS URLs', () => {
    expect(
      detectionFindingSchema.safeParse({
        ...finding,
        references: ['https://attacker.example/report'],
      }).success,
    ).toBe(false);
    expect(
      detectionFindingSchema.safeParse({
        ...finding,
        references: ['http://github.com/advisories/GHSA-test'],
      }).success,
    ).toBe(false);
  });

  it('requires ruleset provenance when the license gate is approved', () => {
    expect(
      scannerExecutionSchema.safeParse({
        scanner: 'semgrep',
        toolVersion: '1.0.0',
        status: 'success',
        durationMs: 10,
        findingsCount: 0,
        licenseGate: 'approved',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown report versions and duplicate scanner executions', () => {
    const report = {
      schemaVersion: 1,
      repository: { id: 1, fullName: 'owner/repo' },
      github: {
        runId: 100,
        runAttempt: 1,
        sha: 'a'.repeat(40),
        ref: 'refs/heads/main',
        workflowRef: 'owner/repo/.github/workflows/sentinel.yml@refs/heads/main',
      },
      summary: {
        status: 'completed',
        startedAt: '2026-10-28T00:00:00Z',
        completedAt: '2026-10-28T00:01:00Z',
      },
      scannerExecutions: [
        {
          scanner: 'gitleaks',
          toolVersion: '8.0.0',
          status: 'success',
          durationMs: 10,
          findingsCount: 1,
        },
      ],
      findings: [finding],
      coverage,
    };
    expect(reportEnvelopeSchema.safeParse({ ...report, schemaVersion: 2 }).success).toBe(false);
    expect(
      reportEnvelopeSchema.safeParse({
        ...report,
        scannerExecutions: [...report.scannerExecutions, ...report.scannerExecutions],
      }).success,
    ).toBe(false);
    expect(
      reportEnvelopeSchema.safeParse({
        ...report,
        findings: [{ ...finding, scannerSources: ['gitleaks', 'composer'] }],
      }).success,
    ).toBe(false);
    expect(
      reportEnvelopeSchema.safeParse({
        ...report,
        coverage: {
          ...coverage,
          skippedScanners: [
            ...coverage.skippedScanners,
            { scanner: 'gitleaks', reason: 'Duplikat.' },
          ],
        },
      }).success,
    ).toBe(false);
    expect(reportEnvelopeSchema.safeParse(report).success).toBe(true);
  });
});
