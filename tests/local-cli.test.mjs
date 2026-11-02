import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repository, 'sentinel.mjs');
const cliCwd = path.dirname(repository);

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: cliCwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

async function inTempDirectory(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'sentinel-cli-test-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('help, unknown command, and invalid target use stable exit codes', () => {
  assert.equal(run('--help').status, 0);
  assert.match(run('--help').stdout, /node sentinel\.mjs scan/);
  assert.equal(run('unknown').status, 2);
  assert.equal(run('scan', path.join(repository, 'missing-folder')).status, 2);
  assert.equal(run('scan', cli).status, 2);
});

test('Node fixture produces one finding and sanitized report', async () => {
  await inTempDirectory(async (directory) => {
    const output = path.join(directory, 'report.json');
    const result = run('scan', path.join(repository, 'fixtures', 'node'), '--output', output);
    assert.equal(result.status, 1);
    const reportText = await readFile(output, 'utf8');
    const report = JSON.parse(reportText);
    assert.equal(report.mode, 'local-quick');
    assert.equal(report.coverage, 'limited');
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].file, 'positive.js');
    assert.equal(report.findings[0].line, 3);
    assert.doesNotMatch(reportText, /req\.query\.expression/);
    assert.equal(
      run('scan', path.join(repository, 'fixtures', 'node'), '--output', output).status,
      2,
    );
  });
});

test('PHP fixture flags raw SQL and clean fixture exits zero', () => {
  const php = run('scan', path.join(repository, 'fixtures', 'php'));
  assert.equal(php.status, 1);
  assert.match(php.stdout, /positive\.php:6/);
  const clean = run('scan', path.join(repository, 'fixtures', 'node', 'missing-lock'));
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /Tidak ada temuan bukan bukti aman/);
});

test('output excludes source secrets, dependencies, symlinks, and large files', async (t) => {
  await inTempDirectory(async (directory) => {
    await writeFile(path.join(directory, 'app.js'), 'eval("TEST_ONLY_DO_NOT_USE_SECRET")\n');
    await mkdir(path.join(directory, 'node_modules'));
    await writeFile(path.join(directory, 'node_modules', 'bad.js'), 'eval("ignored")\n');
    await mkdir(path.join(directory, '.sentinel-cache'));
    await writeFile(path.join(directory, '.sentinel-cache', 'cached.js'), 'eval("ignored")\n');
    await mkdir(path.join(directory, 'tmp', '.output'), { recursive: true });
    await writeFile(path.join(directory, 'tmp', '.output', 'generated.js'), 'eval("ignored")\n');
    await writeFile(path.join(directory, 'large.js'), 'x'.repeat(1024 * 1024 + 1));
    try {
      await symlink(path.join(directory, 'app.js'), path.join(directory, 'linked.js'));
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
      t.diagnostic('Windows symlink creation unavailable; remaining assertions still run.');
    }
    const output = path.join(directory, 'report.json');
    const result = run('scan', directory, '--output', output);
    assert.equal(result.status, 1);
    const reportText = await readFile(output, 'utf8');
    const report = JSON.parse(reportText);
    assert.equal(report.findings.length, 1);
    assert.equal(report.skippedLargeFiles, 1);
    assert.doesNotMatch(reportText + result.stdout, /TEST_ONLY_DO_NOT_USE_SECRET|ignored/);
  });
});

test('extra positional path is rejected', () => {
  assert.equal(run('scan', '.', path.join(repository, 'fixtures', 'node')).status, 2);
  assert.equal(run('scan', '--output').status, 2);
  assert.equal(run('scan', '--output', '--help').status, 2);
});

test('regex exec is not reported as a shell command', async () => {
  await inTempDirectory(async (directory) => {
    await writeFile(path.join(directory, 'regular-expression.js'), '/token/.exec(value);\n');
    await writeFile(path.join(directory, 'shell.js'), 'child_process.exec(command);\n');
    const result = run('scan', directory);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /shell\.js:1/);
    assert.doesNotMatch(result.stdout, /regular-expression\.js/);
    assert.match(result.stdout, /1 temuan/);
  });
});
