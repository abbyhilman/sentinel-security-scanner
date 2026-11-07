import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dependencyUpdates } from '../cli/dependency-updates.mjs';
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

test('offline update plans follow npm importers and the installed versions of nested dependencies', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sentinel-updates-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lockfile = path.join(directory, 'package-lock.json');
  const manifest = path.join(directory, 'package.json');
  const rootManifest = {
    dependencies: { diagram: '^1.0.0', parser: '^8.0.0' },
    devDependencies: { utility: '^3.0.0' },
  };
  const lock = JSON.stringify({
    packages: {
      '': rootManifest,
      'node_modules/diagram': { version: '1.2.0', dependencies: { math: '^0.16.0' } },
      'node_modules/math': { version: '0.16.3' },
      'node_modules/parser': { version: '8.1.0', dependencies: { utility: '^2.0.0' } },
      'node_modules/parser/node_modules/utility': { version: '2.0.1' },
      'node_modules/utility': { version: '3.0.1' },
      'apps/admin': { dependencies: { ui: '^2.0.0' } },
      'node_modules/ui': { version: '2.1.0' },
    },
  });
  await writeFile(lockfile, lock);
  await writeFile(manifest, JSON.stringify(rootManifest));
  const npmFinding = { file: 'package-lock.json', ecosystem: 'npm', advisoryId: 'GHSA-test-0001' };
  const findings = [
    { ...npmFinding, package: 'math', version: '0.16.3', fixedVersions: ['0.18.2'] },
    { ...npmFinding, package: 'utility', version: '2.0.1', fixedVersions: ['2.0.2'] },
    { ...npmFinding, package: 'utility', version: '3.0.1', fixedVersions: ['3.0.2'] },
    { ...npmFinding, package: 'ui', version: '2.1.0', fixedVersions: ['2.2.0'] },
  ];
  const [math, nested, direct, workspace] = await dependencyUpdates(
    directory,
    [lockfile],
    findings,
  );
  assert.equal(math.kind, 'transitive');
  assert.deepEqual(math.parents, [
    { package: 'diagram', range: '^0.16.0', outsideRange: ['0.18.2'] },
  ]);
  assert.equal(nested.kind, 'transitive');
  assert.deepEqual(nested.parents, [{ package: 'parser', range: '^2.0.0' }]);
  assert.equal(nested.updateCommand, undefined);
  assert.equal(direct.kind, 'direct');
  assert.match(direct.updateCommand, /^npm install utility@3\.0\.2 --save-dev --save-exact/);
  assert.equal(workspace.declarations[0].manifest, 'apps/admin/package.json');
  assert.equal(workspace.updateCommand, undefined);
  assert.equal(await readFile(lockfile, 'utf8'), lock);
  assert.equal(await readFile(manifest, 'utf8'), JSON.stringify(rootManifest));
  const terminal = renderReport({
    ...report,
    dependencyAudit: {
      status: 'success',
      findings: findings.map((finding) => ({
        ...finding,
        severity: 'low',
        reference: 'https://osv.dev/',
      })),
      updates: [math, nested, direct, workspace],
    },
  });
  assert.match(terminal, /LANGKAH UPDATE MANUAL/);
  assert.match(terminal, /Induk: diagram \(\^0\.16\.0\)/);
  assert.match(terminal, /Di luar rentang induk: 0\.18\.2/);
  assert.match(terminal, /npm explain math/);
  assert.match(terminal, /GHSA-test-0001: 0\.18\.2/);
});

test('Composer uses its parent data and pnpm and Yarn label uncertain workspace declarations', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sentinel-updates-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'php'));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ dependencies: { demo: '^1.0.0' } }),
  );
  await writeFile(
    path.join(directory, 'php/composer.json'),
    JSON.stringify({ require: { 'test/parent': '^1.0' } }),
  );
  const lockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'php/composer.lock'].map((file) =>
    path.join(directory, file),
  );
  await writeFile(
    lockfiles[2],
    JSON.stringify({
      packages: [
        {
          name: 'test/parent',
          require: { 'test/child': 'https://user:secret@example.invalid/repo' },
        },
      ],
    }),
  );
  const finding = {
    ecosystem: 'npm',
    package: 'demo',
    version: '1.0.0',
    advisoryId: 'GHSA-test-0001',
    fixedVersions: [],
  };
  const updates = await dependencyUpdates(directory, lockfiles, [
    { ...finding, file: 'pnpm-lock.yaml' },
    { ...finding, file: 'pnpm-lock.yaml', advisoryId: 'GHSA-test-0002', fixedVersions: ['1.0.1'] },
    { ...finding, file: 'yarn.lock', package: 'unsafe;command' },
    { ...finding, file: 'php/composer.lock', ecosystem: 'Packagist', package: 'test/child' },
    {
      ...finding,
      file: 'php/composer.lock',
      ecosystem: 'Packagist',
      package: 'test/parent',
      fixedVersions: ['1.0.1'],
    },
  ]);
  const [pnpm, yarn, composerChild, composerParent] = updates;
  assert.equal(updates.length, 4);
  assert.equal(pnpm.kind, 'declared');
  assert.equal(pnpm.advisories.length, 2);
  assert.deepEqual(pnpm.commands, ['pnpm why --recursive demo']);
  assert.equal(pnpm.updateCommand, undefined);
  assert.equal(yarn.kind, 'unknown');
  assert.deepEqual(yarn.commands, []);
  assert.deepEqual(composerChild.parents, [{ package: 'test/parent', range: null }]);
  assert.deepEqual(composerChild.commands, ['composer why --tree --locked test/child']);
  assert.match(composerChild.steps[0], /changelog/);
  assert.match(composerParent.updateCommand, /^composer require test\/parent:1\.0\.1/);
  assert.doesNotMatch(JSON.stringify(updates), /example\.invalid|user:secret/);
});

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
