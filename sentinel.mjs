#!/usr/bin/env node
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditDependencies, lockfileNames } from './cli/dependencies.mjs';
import { guidance, renderReport } from './cli/report.mjs';

const ignoredDirectories = new Set([
  '.git',
  '.sentinel-cache',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  '.next',
  '.output',
]);
const maxFiles = 10_000;
const maxFileBytes = 1024 * 1024;
const rules = [
  {
    id: 'sentinel.quick.php-dynamic-execution',
    extensions: new Set(['.php']),
    pattern: /\b(?:eval|shell_exec|exec|system)\s*\(/gu,
    message: 'Periksa pemanggilan eksekusi dinamis PHP.',
  },
  {
    id: 'sentinel.quick.php-raw-sql-query',
    extensions: new Set(['.php']),
    pattern: /\bmysqli_query\s*\(/gu,
    message: 'Periksa query SQL mentah dan pastikan input diparameterkan.',
  },
  {
    id: 'sentinel.quick.node-dynamic-evaluation',
    extensions: new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']),
    pattern: /\b(?:eval\s*\(|new\s+Function\s*\()/gu,
    message: 'Periksa evaluasi kode dinamis.',
  },
  {
    id: 'sentinel.quick.node-shell-command',
    extensions: new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']),
    pattern: /(?<![.\w])(?:child_process\.)?exec(?:Sync)?\s*\((?!\?:)/gu,
    message: 'Periksa konstruksi perintah shell.',
  },
];

function usage() {
  console.log(
    'Sentinel CLI lokal\n\n  node sentinel.mjs scan [folder] [--dependencies] [--output report.json]\n  node sentinel.mjs --help\n\n--dependencies: unduh OSV resmi ke cache dan audit lockfile melalui internet.\nIdentitas dan versi paket dikirim ke layanan advisory OSV.\nExit code: 0 tidak ada temuan, 1 ada temuan, 2 gagal (termasuk audit dependency gagal).',
  );
}

function argumentsForScan(args) {
  let target;
  let output;
  let dependencies = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--output' && args[index + 1] && !args[index + 1].startsWith('-') && !output)
      output = args[++index];
    else if (value === '--dependencies' && !dependencies) dependencies = true;
    else if (!value.startsWith('-') && target === undefined) target = value;
    else throw new Error('Argumen tidak dikenal. Jalankan node sentinel.mjs --help.');
  }
  return {
    target: path.resolve(target ?? '.'),
    output: output && path.resolve(output),
    dependencies,
  };
}

async function collectFiles(root) {
  const files = [];
  const lockfiles = [];
  const stack = [root];
  let skipped = 0;
  let skippedDirectories = 0;
  while (stack.length) {
    const directory = stack.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        skipped++;
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) stack.push(fullPath);
        else skippedDirectories++;
      } else if (entry.isFile() && lockfileNames.has(entry.name)) {
        lockfiles.push(fullPath);
      } else if (
        entry.isFile() &&
        rules.some((rule) => rule.extensions.has(path.extname(entry.name).toLowerCase()))
      ) {
        if (files.length >= maxFiles)
          throw new Error('Batas 10.000 file tercapai; scan dihentikan.');
        files.push(fullPath);
      }
    }
  }
  return { files: files.sort(), lockfiles: lockfiles.sort(), skipped, skippedDirectories };
}

async function scan(root, output, dependencies) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error('Target harus folder lokal biasa.');
  const { files, lockfiles, skipped: skippedLinks, skippedDirectories } = await collectFiles(root);
  const findings = [];
  let skippedLargeFiles = 0;
  for (const file of files) {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxFileBytes) {
      skippedLargeFiles++;
      continue;
    }
    const content = await readFile(file, 'utf8');
    const extension = path.extname(file).toLowerCase();
    for (const rule of rules) {
      if (!rule.extensions.has(extension)) continue;
      for (const match of content.matchAll(rule.pattern)) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          ruleId: rule.id,
          file: path.relative(root, file).replaceAll('\\', '/'),
          line,
          severity: 'review',
          message: rule.message,
        });
        if (findings.length >= 1000)
          throw new Error('Batas 1.000 temuan tercapai; scan dihentikan.');
      }
    }
  }
  if (dependencies) console.error('Audit dependency OSV sedang berjalan...');
  const dependencyAudit = dependencies
    ? await auditDependencies(root, lockfiles)
    : {
        status: 'not_requested',
        reason: 'Audit dependency tidak diminta.',
        findings: [],
      };
  const report = {
    schemaVersion: 1,
    mode: 'local-quick',
    coverage: 'limited',
    scannedFiles: files.length - skippedLargeFiles,
    skippedLargeFiles,
    skippedLinks,
    skippedDirectories,
    findings,
    guidance: Object.fromEntries(
      [...new Set(findings.map((finding) => finding.ruleId))].map((id) => [id, guidance[id]]),
    ),
    dependencyAudit,
    notice:
      'Cakupan terbatas; Semgrep, Gitleaks, dan Composer Audit belum dijalankan. Status OSV tercatat pada dependencyAudit. Tidak ada temuan bukan bukti aman.',
  };
  if (output)
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(renderReport({ ...report, output }));
  process.exitCode =
    dependencyAudit.status === 'failed'
      ? 2
      : findings.length || dependencyAudit.findings.length
        ? 1
        : 0;
}

const [command, ...args] = process.argv.slice(2);
if (command === '--help' || command === '-h' || command === undefined) usage();
else if (command === 'scan') {
  try {
    const { target, output, dependencies } = argumentsForScan(args);
    await scan(target, output, dependencies);
  } catch (error) {
    console.error(
      'Sentinel gagal:',
      error instanceof Error ? error.message : 'kesalahan tidak dikenal',
    );
    process.exitCode = 2;
  }
} else {
  usage();
  process.exitCode = 2;
}
