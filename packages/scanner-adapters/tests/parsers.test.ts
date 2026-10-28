import { describe, expect, it } from 'vitest';
import composerAuditFixture from '../../../fixtures/expected-findings/composer-audit.json';
import gitleaksFixture from '../../../fixtures/expected-findings/gitleaks.json';
import osvFixture from '../../../fixtures/expected-findings/osv.json';
import semgrepFixture from '../../../fixtures/expected-findings/semgrep.json';
import { parseComposerAuditJson, parseGitleaksJson, parseOsvJson, parseSemgrepJson } from '../src';

describe('scanner JSON adapters', () => {
  it('normalizes Semgrep severity and redacts synthetic secret-like message data', async () => {
    const result = await parseSemgrepJson(semgrepFixture, { toolVersion: '1.2.3' });

    expect(result.execution.status).toBe('success');
    expect(result.findings[0]).toMatchObject({
      scanner: 'semgrep',
      category: 'sast',
      severity: 'medium',
      filePath: 'fixtures/php/positive.php',
      lineStart: 4,
      references: ['https://semgrep.dev/rules/SENTINEL-TEST-0001'],
    });
    expect(JSON.stringify(result)).not.toContain('TEST_ONLY_DO_NOT_USE_synthetic_value');
  });

  it('fails closed on malformed Semgrep output', async () => {
    const result = await parseSemgrepJson('{bad json');
    expect(result.execution.status).toBe('failed');
    expect(result.findings).toEqual([]);
  });

  it('normalizes OSV package advisory identifiers and provenance', async () => {
    const result = await parseOsvJson(osvFixture);

    expect(result.execution.status).toBe('success');
    expect(result.findings[0]).toMatchObject({
      scanner: 'osv',
      category: 'sca',
      severity: 'high',
      evidenceStatus: 'potentially_affected',
      package: { ecosystem: 'Packagist', name: 'sentinel-fixture/demo-lib', version: '1.0.0' },
      advisoryIds: ['SENTINEL-TEST-ADVISORY-0001', 'SENTINEL-TEST-ALIAS-0001'],
    });
  });

  it('ignores Gitleaks secret-bearing fields completely', async () => {
    const secret = gitleaksFixture[0]?.Secret ?? '';
    const result = await parseGitleaksJson(gitleaksFixture);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      category: 'secret',
      evidenceStatus: 'detected',
      severity: 'unknown',
      messageRedacted:
        'Nilai secret tidak disertakan. Rotasi credential jika nilainya pernah digunakan.',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('normalizes Composer Audit advisories without fabricating installed versions', async () => {
    const result = await parseComposerAuditJson(composerAuditFixture);

    expect(result.findings[0]).toMatchObject({
      scanner: 'composer',
      category: 'sca',
      severity: 'low',
      package: { ecosystem: 'Packagist', name: 'sentinel-fixture/demo-lib' },
      references: ['https://github.com/advisories/SENTINEL-TEST-ALIAS-0001'],
    });
    expect(result.findings[0]?.package?.version).toBeUndefined();
  });

  it('marks malformed scanner entries failed while preserving valid evidence', async () => {
    const result = await parseGitleaksJson([
      { RuleID: 'valid', File: 'config.env', StartLine: 1 },
      { RuleID: 'malformed', File: '../outside.env', StartLine: -1 },
    ]);
    expect(result.execution.status).toBe('failed');
    expect(result.findings).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });
});
