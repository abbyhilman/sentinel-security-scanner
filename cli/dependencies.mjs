import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { dependencyUpdates } from './dependency-updates.mjs';

const execute = promisify(execFile);
export const osvVersion = '2.7.0';
const digests = {
  'win32-x64': '9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438',
  'win32-arm64': '3e630381c1f1fd3c9c4d447e6ff2ef6c737083371722773db8337eead0f97962',
  'linux-x64': '160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b',
  'linux-arm64': '4061ef4c021ed3c47f203b818f337e351336cc5cd67c0274fc36bd1dfc728dd7',
  'darwin-x64': 'e82c5df7ab0a42dff29a1cd0660711447b56b4c0483ff66ad8634df10fd81a45',
  'darwin-arm64': 'd4926ef8da134332543be276dff157e4c170f99ad91fc48e89448a8816bdf70b',
};
export const lockfileNames = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'composer.lock',
]);

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function ensureOsv({ offline = false } = {}) {
  const key = `${process.platform}-${process.arch}`;
  const expected = digests[key];
  if (!expected) throw new Error('Platform OSV belum didukung.');
  const cache = fileURLToPath(
    new URL(`../.sentinel-cache/osv/${osvVersion}/${key}/`, import.meta.url),
  );
  await mkdir(cache, { recursive: true });
  const executable = path.join(
    cache,
    process.platform === 'win32' ? 'osv-scanner.exe' : 'osv-scanner',
  );
  try {
    const info = await lstat(executable);
    if (!info.isFile() || info.isSymbolicLink() || (await digest(executable)) !== expected)
      throw new Error('Checksum cache OSV tidak cocok. Hapus cache engine ini lalu coba lagi.');
    return executable;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (offline) throw new Error('Cache OSV belum disiapkan.');
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const architecture = process.arch === 'x64' ? 'amd64' : 'arm64';
  const asset = `osv-scanner_${platform}_${architecture}${process.platform === 'win32' ? '.exe' : ''}`;
  const temporary = await mkdtemp(path.join(cache, 'download-'));
  try {
    console.error(`Mengunduh OSV-Scanner ${osvVersion} dari rilis resmi GitHub...`);
    const response = await fetch(
      `https://github.com/google/osv-scanner/releases/download/v${osvVersion}/${asset}`,
      {
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!response.ok || !response.body) throw new Error('Unduhan OSV gagal.');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 256 * 1024 * 1024) throw new Error('Ukuran unduhan OSV melewati batas.');
      chunks.push(chunk);
    }
    const downloaded = path.join(temporary, 'engine');
    await writeFile(downloaded, Buffer.concat(chunks), { flag: 'wx', mode: 0o700 });
    if ((await digest(downloaded)) !== expected)
      throw new Error('Checksum unduhan OSV tidak cocok.');
    await chmod(downloaded, 0o700);
    await rename(downloaded, executable);
    return executable;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function text(value, limit = 256) {
  if (typeof value !== 'string' || !value || value.length > limit || /[\p{Cc}\p{Cf}]/u.test(value))
    throw new Error('Metadata advisory OSV tidak valid.');
  return value;
}

function release(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value)
    ? value.split('.').map(BigInt)
    : undefined;
}

function newer(candidate, current) {
  const a = release(candidate);
  const b = release(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return false;
}

export function parseDependencyOutput(raw, root) {
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.results)) throw new Error('Output OSV tidak valid.');
  const findings = [];
  let packageCount = 0;
  let skippedLocalPackages = 0;
  for (const result of data.results) {
    const relative = path.relative(root, text(result.source?.path, 4096)).replaceAll('\\', '/');
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative))
      throw new Error('Path lockfile OSV berada di luar target.');
    if (!Array.isArray(result.packages)) throw new Error('Daftar paket OSV tidak valid.');
    for (const entry of result.packages) {
      const name = text(entry.package?.name);
      const ecosystem = text(entry.package?.ecosystem);
      const version = text(entry.package?.version);
      if (!['npm', 'Packagist'].includes(ecosystem)) continue;
      if (/[?&]source=LOCAL(?:&|$)/.test(entry.package.purl ?? '')) {
        skippedLocalPackages++;
        continue;
      }
      packageCount++;
      if (!Array.isArray(entry.vulnerabilities ?? [])) throw new Error('Advisory OSV tidak valid.');
      for (const advisory of entry.vulnerabilities ?? []) {
        const id = text(advisory.id, 120);
        if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('ID advisory tidak valid.');
        if (!Array.isArray(advisory.affected)) throw new Error('Rentang advisory tidak valid.');
        const fixedVersions = new Set();
        for (const affected of advisory.affected) {
          if (affected.package?.name !== name || affected.package?.ecosystem !== ecosystem)
            continue;
          for (const range of affected.ranges ?? []) {
            if (!['SEMVER', 'ECOSYSTEM'].includes(range.type)) continue;
            for (const event of range.events ?? []) {
              if (event.fixed && newer(event.fixed, version)) fixedVersions.add(text(event.fixed));
            }
          }
        }
        const severity = String(advisory.database_specific?.severity ?? 'unknown').toLowerCase();
        findings.push({
          file: relative,
          package: name,
          ecosystem,
          version,
          advisoryId: id,
          severity: ['critical', 'high', 'medium', 'moderate', 'low'].includes(severity)
            ? severity
            : 'unknown',
          fixedVersions: [...fixedVersions].sort((a, b) =>
            newer(a, b) ? 1 : newer(b, a) ? -1 : 0,
          ),
          reference: `https://osv.dev/vulnerability/${id}`,
        });
      }
    }
  }
  return { packageCount, skippedLocalPackages, findings };
}

export async function auditDependencies(root, lockfiles, { offlineDatabase } = {}) {
  if (!lockfiles.length)
    return { status: 'skipped', reason: 'Lockfile yang didukung tidak ditemukan.', findings: [] };
  if (lockfiles.length > 100)
    return { status: 'failed', reason: 'Batas 100 lockfile terlampaui.', findings: [] };
  const base = { engine: 'OSV-Scanner', version: osvVersion, findings: [] };
  try {
    for (const lockfile of lockfiles) {
      const info = await lstat(lockfile);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 20 * 1024 * 1024)
        throw new Error('Lockfile tidak valid atau lebih dari 20 MiB.');
    }
    const executable = await ensureOsv({ offline: Boolean(offlineDatabase) });
    const temporary = await mkdtemp(path.join(path.dirname(executable), 'scan-'));
    try {
      const config = path.join(temporary, 'osv-scanner.toml');
      await writeFile(config, '', { flag: 'wx', mode: 0o600 });
      const args = [
        'scan',
        'source',
        '--format=json',
        '--all-packages',
        '--no-resolve',
        '--no-call-analysis=go',
        '--no-call-analysis=rust',
        `--config=${config}`,
        ...(offlineDatabase ? ['--offline'] : []),
        ...lockfiles.flatMap((file) => ['--lockfile', file]),
      ];
      let stdout;
      try {
        ({ stdout } = await execute(executable, args, {
          cwd: temporary,
          timeout: 120_000,
          maxBuffer: 12 * 1024 * 1024,
          encoding: 'utf8',
          windowsHide: true,
          env: {
            ...process.env,
            ...(offlineDatabase
              ? {
                  OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: offlineDatabase,
                  OSV_SCALIBR_LOCAL_DB_CACHE_DIRECTORY: offlineDatabase,
                }
              : {}),
          },
        }));
      } catch (error) {
        if (error.code !== 1 || error.killed || error.signal) throw error;
        stdout = error.stdout;
      }
      const parsed = parseDependencyOutput(stdout, root);
      if (parsed.packageCount === 0)
        return {
          ...base,
          status: 'skipped',
          ...parsed,
          reason:
            'Tidak ada versi paket yang berhasil diperiksa. Paket lokal atau npm tanpa resolved dapat dilewati OSV.',
        };
      return {
        ...base,
        ...parsed,
        status: 'success',
        checkedAt: new Date().toISOString(),
        lockfileCount: lockfiles.length,
        networkMode: offlineDatabase ? 'offline' : 'online',
        ...(offlineDatabase
          ? { updates: await dependencyUpdates(root, lockfiles, parsed.findings) }
          : {}),
      };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } catch {
    return {
      ...base,
      status: 'failed',
      reason: offlineDatabase
        ? 'Audit dependency offline gagal (cache, checksum, timeout, atau output engine). Tidak ada fallback jaringan atau kesimpulan aman.'
        : 'Audit dependency gagal (unduhan, checksum, jaringan, timeout, atau output engine). Tidak ada kesimpulan aman.',
    };
  }
}
