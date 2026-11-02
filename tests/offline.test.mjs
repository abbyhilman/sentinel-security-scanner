import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseOfflineFindings } from '../cli/offline.mjs';
import { renderReport } from '../cli/report.mjs';
import { ensureOsv } from '../cli/dependencies.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repository, 'fixtures', 'node');

test('offline OSV cache access never falls back to a download', async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = () => {
    requested = true;
    throw new Error('Network forbidden');
  };
  try {
    try {
      await ensureOsv({ offline: true });
    } catch {
      /* A missing cache is expected on clean CI. */
    }
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('offline and online dependency modes cannot be combined, and prepare accepts no repository', () => {
  for (const args of [
    ['scan', root, '--offline', '--dependencies'],
    ['scan', root, '--offline', '--offline'],
    ['prepare-offline', root],
  ]) {
    const result = spawnSync(process.execPath, [path.join(repository, 'sentinel.mjs'), ...args], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout + result.stderr, /Mengunduh/);
  }
});

test('Gitleaks normalization drops secret, matched lines and descriptions from output', () => {
  const raw = [
    {
      File: 'positive.js',
      StartLine: 3,
      RuleID: 'github-pat',
      Secret: 'DUMMY_SECRET_NOT_REAL',
      Match: 'raw source DUMMY_SECRET_NOT_REAL',
      Description: 'DUMMY_SECRET_NOT_REAL',
    },
  ];
  const result = parseOfflineFindings('gitleaks', JSON.stringify(raw), root);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].file, 'positive.js');
  assert.doesNotMatch(JSON.stringify(result), /DUMMY_SECRET_NOT_REAL|raw source/);
  assert.throws(() => parseOfflineFindings('gitleaks', '{}', root));
  assert.throws(() =>
    parseOfflineFindings('gitleaks', JSON.stringify([{ ...raw[0], File: '../outside.js' }]), root),
  );
  assert.throws(() =>
    parseOfflineFindings('gitleaks', JSON.stringify([{ ...raw[0], RuleID: 'bad\nvalue' }]), root),
  );
});

test('Semgrep normalization drops source and metavariables, retains engine errors as partial failure', () => {
  const result = parseOfflineFindings(
    'semgrep',
    JSON.stringify({
      results: [
        {
          path: path.join(root, 'positive.js'),
          start: { line: 3 },
          check_id: 'sentinel.node.dynamic-code-evaluation',
          extra: { lines: 'DUMMY_SOURCE', metavars: { value: 'DUMMY_SECRET' } },
        },
      ],
      errors: [{ message: 'PRIVATE_DIAGNOSTIC' }],
    }),
    root,
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.errors, 1);
  assert.doesNotMatch(JSON.stringify(result), /DUMMY_SOURCE|DUMMY_SECRET|PRIVATE_DIAGNOSTIC/);
  const rendered = renderReport({
    findings: [],
    scannedFiles: 2,
    skippedDirectories: 0,
    skippedLargeFiles: 0,
    skippedLinks: 0,
    networkMode: 'offline',
    dependencyAudit: { status: 'skipped', findings: [] },
    sourceEngines: [
      { engine: 'semgrep', version: '1.182.0', status: 'failed', findings: result.findings },
    ],
  });
  assert.match(rendered, /Mode OFFLINE/);
  assert.match(rendered, /SEBAGIAN GAGAL/);
  assert.match(rendered, /FAILED/);
  assert.doesNotMatch(rendered, /Tambahkan --dependencies/);
});
