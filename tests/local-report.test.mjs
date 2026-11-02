import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { auditDependencies, parseDependencyOutput } from '../cli/dependencies.mjs';
import { renderReport } from '../cli/report.mjs';

const root = path.resolve('fixture');

test('unreadable lockfiles fail before engine download and do not expose raw errors', async () => {
  const result = await auditDependencies(root, [path.join(root, 'missing-package-lock.json')]);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.findings, []);
  assert.doesNotMatch(result.reason, /missing-package-lock|ENOENT/);
});
function output(vulnerabilities) {
  return JSON.stringify({
    results: [
      {
        source: { path: path.join(root, 'package-lock.json') },
        packages: [
          { package: { name: 'demo', ecosystem: 'npm', version: '2.0.0' }, vulnerabilities },
        ],
      },
    ],
  });
}

test('fix candidates match package and ecosystem, exclude old endpoints and retain advisory provenance', () => {
  const advisory = {
    id: 'GHSA-test-0001',
    affected: [
      {
        package: { name: 'demo', ecosystem: 'npm' },
        ranges: [
          {
            type: 'SEMVER',
            events: [
              { introduced: '0' },
              { fixed: '1.0.0' },
              { introduced: '2.0.0' },
              { fixed: '2.0.1' },
              { fixed: '3.0.0' },
            ],
          },
        ],
      },
      {
        package: { name: 'other', ecosystem: 'npm' },
        ranges: [{ type: 'SEMVER', events: [{ fixed: '9.0.0' }] }],
      },
      {
        package: { name: 'demo', ecosystem: 'Packagist' },
        ranges: [{ type: 'ECOSYSTEM', events: [{ fixed: '8.0.0' }] }],
      },
    ],
  };
  const result = parseDependencyOutput(output([advisory]), root);
  assert.equal(result.packageCount, 1);
  assert.deepEqual(result.findings[0].fixedVersions, ['2.0.1', '3.0.0']);
  assert.equal(result.findings[0].reference, 'https://osv.dev/vulnerability/GHSA-test-0001');
  assert.equal(result.findings[0].file, 'package-lock.json');
});

test('unknown fixes remain unknown; malformed engine output and external paths are rejected', () => {
  const result = parseDependencyOutput(output([{ id: 'GHSA-test-0002', affected: [] }]), root);
  assert.deepEqual(result.findings[0].fixedVersions, []);
  assert.throws(() => parseDependencyOutput('{}', root));
  assert.throws(() => parseDependencyOutput('invalid', root));
  assert.throws(() => parseDependencyOutput(output([{ id: '\x1b[2J', affected: [] }]), root));
  assert.throws(() => parseDependencyOutput(output([]), path.join(root, 'nested')));
});

test('local npm packages are excluded from advisory coverage instead of counted as checked', () => {
  const data = JSON.parse(output([]));
  data.results[0].packages[0].package.purl = 'pkg:npm/demo@2.0.0?source=LOCAL';
  const result = parseDependencyOutput(JSON.stringify(data), root);
  assert.equal(result.packageCount, 0);
  assert.equal(result.skippedLocalPackages, 1);
});

const report = {
  findings: [
    {
      file: 'src/very-long-folder-name/'.repeat(3) + 'app.js',
      line: 10,
      ruleId: 'sentinel.quick.node-dynamic-evaluation',
    },
  ],
  scannedFiles: 3,
  skippedDirectories: 1,
  skippedLinks: 0,
  skippedLargeFiles: 0,
  dependencyAudit: { status: 'not_requested', findings: [] },
};

test('terminal report wraps tables and shows summary, prevention and honest dependency coverage', () => {
  const result = renderReport(report, 80);
  assert.match(result, /Lokasi file:baris/);
  assert.match(result, /RINGKASAN AKHIR/);
  assert.match(result, /JSON.parse/);
  assert.match(result, /Paket dan versi perbaikan belum dapat ditentukan/);
  assert.match(result, /Semgrep.*BELUM DIJALANKAN/);
  for (const line of result
    .split('\n')
    .filter((line) => line.startsWith('|') || line.startsWith('+')))
    assert.ok(line.length <= 80, line);
  assert.equal(
    renderReport({
      ...report,
      findings: [{ ...report.findings[0], file: 'bad\x1b[2J\nfile.js' }],
    }).includes('\x1b'),
    false,
  );
});

test('zero findings and dependency failures never imply a complete successful audit', () => {
  const result = renderReport({
    ...report,
    findings: [],
    dependencyAudit: { status: 'failed', findings: [] },
  });
  assert.match(result, /SEBAGIAN GAGAL/);
  assert.match(result, /Tidak ada temuan bukan bukti aman/);
  const fixed = renderReport({
    ...report,
    dependencyAudit: {
      status: 'success',
      packageCount: 1,
      findings: parseDependencyOutput(output([{ id: 'GHSA-test-0003', affected: [] }]), root)
        .findings,
    },
  });
  assert.match(fixed, /Belum diketahui/);
  assert.match(fixed, /bukan jaminan versi aman/);
});
