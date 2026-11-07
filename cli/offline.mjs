import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { promisify } from 'node:util';
import { auditDependencies, ensureOsv } from './dependencies.mjs';

const execute = promisify(execFile);
const cache = fileURLToPath(new URL('../.sentinel-cache/offline/', import.meta.url));
const rules = fileURLToPath(
  new URL('../templates/github-workflows/rules/sentinel-security.yml', import.meta.url),
);
const expectedRules = '10fae8d4669e57777efab9c386c0cf716dbdf5d81d3073cd65e25e616db0379d';
const semgrepVersion = '1.182.0';
const gitleaksVersion = '8.30.1';
const semgrepWheels = {
  'win32-x64': [
    'e0/9b/69da1bff8b978390f3c59283f45f1b881a347185ddd598fbb751d3108379',
    'win_amd64',
    'd1cc11b4662175d62c0296c6e4944483104a9ede26ae1a3c1723abab234815ce',
  ],
  'linux-x64': [
    '62/85/2e4bd385c4cd55d3ec293a328ffb98115277fb08b8b98be5848ec035e9fd',
    'manylinux_2_34_x86_64',
    '19a82868830389c039bb71bfc0aeebb28385e5b65740120710eff050324ad14f',
  ],
  'linux-arm64': [
    'ca/24/db102993a4a8fb32addc6c2bee1311b4b4faf81e9287596c1eaddfb1aaf7',
    'manylinux_2_34_aarch64',
    'e20485948f87a7a8e5ef099bb0ef80beae8c5f53a19d55de94e89c516eb9f731',
  ],
  'darwin-x64': [
    '05/bd/62412a31140b0a339f4785d4505186ed64a5d61252b5e70b52e06827cf7f',
    'macosx_10_14_x86_64',
    '56f609a26dfba5e16428485f120f671e216ae3d3329697e8cf0075fb8a17c10a',
  ],
  'darwin-arm64': [
    '4e/6d/74dcb9ef5d7ff61918df79d6ce8e3dc2ae3d839b42cded4401e51993a7b3',
    'macosx_11_0_arm64',
    '675e69cbc71827a36eb490745d3d56c846c356b70072933c5513587a684767b0',
  ],
};
const gitleaksArchives = {
  'win32-x64': [
    'windows_x64.zip',
    'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
  ],
  'win32-arm64': [
    'windows_arm64.zip',
    'b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f',
  ],
  'linux-x64': [
    'linux_x64.tar.gz',
    '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  ],
  'linux-arm64': [
    'linux_arm64.tar.gz',
    'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  ],
  'darwin-x64': [
    'darwin_x64.tar.gz',
    'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  ],
  'darwin-arm64': [
    'darwin_arm64.tar.gz',
    'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  ],
};

function artifact(engine) {
  const key = `${process.platform}-${process.arch}`;
  if (engine === 'semgrep') {
    const data = semgrepWheels[key];
    if (!data) throw new Error('Platform Semgrep belum didukung.');
    const name = `semgrep-${semgrepVersion}-cp310.cp311.cp312.cp313.cp314.py310.py311.py312.py313.py314-none-${data[1]}.whl`;
    return {
      url: `https://files.pythonhosted.org/packages/${data[0]}/${name}`,
      sha256: data[2],
      file: path.join(cache, `${engine}-${key}-${semgrepVersion}.zip`),
    };
  }
  const data = gitleaksArchives[key];
  if (!data) throw new Error('Platform Gitleaks belum didukung.');
  const name = `gitleaks_${gitleaksVersion}_${data[0]}`;
  return {
    url: `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaksVersion}/${name}`,
    sha256: data[1],
    file: path.join(cache, name),
  };
}

async function hashFile(file, algorithm = 'sha256', encoding = 'hex') {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Cache harus file biasa.');
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}

async function download(url, file, maxBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || !response.body) throw new Error('Unduhan publik gagal.');
  let size = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      callback(size > maxBytes ? new Error('Ukuran unduhan melewati batas.') : null, chunk);
    },
  });
  await pipeline(response.body, limiter, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  return size;
}

async function prepareArtifact(engine) {
  const item = artifact(engine);
  try {
    if ((await hashFile(item.file)) === item.sha256) return;
    throw new Error('Checksum cache tidak cocok.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = await mkdtemp(path.join(cache, 'download-'));
  try {
    console.error(`Mengunduh ${engine} resmi...`);
    const file = path.join(temporary, 'archive');
    await download(item.url, file, 300 * 1024 * 1024);
    if ((await hashFile(file)) !== item.sha256) throw new Error('Checksum unduhan tidak cocok.');
    await rename(file, item.file);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function extractEngine(engine, temporary) {
  const item = artifact(engine);
  if ((await hashFile(item.file)) !== item.sha256) throw new Error('Checksum cache tidak cocok.');
  const destination = path.join(temporary, engine);
  await mkdir(destination);
  const tar =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  const archiveCommand = process.platform === 'linux' && item.file.endsWith('.zip') ? 'unzip' : tar;
  const archiveArgs =
    archiveCommand === 'unzip'
      ? ['-q', item.file, '-d', destination]
      : ['-xf', item.file, '-C', destination];
  await execute(archiveCommand, archiveArgs, {
    timeout: 60_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const executable =
    engine === 'gitleaks'
      ? path.join(destination, `gitleaks${suffix}`)
      : path.join(
          destination,
          `semgrep-${semgrepVersion}.data`,
          'purelib',
          'semgrep',
          'bin',
          `semgrep-core${suffix}`,
        );
  if (!(await lstat(executable)).isFile()) throw new Error('Executable tidak ditemukan.');
  await chmod(executable, 0o700);
  return executable;
}

export async function prepareOffline() {
  await mkdir(cache, { recursive: true });
  const statuses = [];
  for (const engine of ['semgrep', 'gitleaks', 'osv']) {
    try {
      if (engine === 'osv') await ensureOsv();
      else await prepareArtifact(engine);
      statuses.push({ engine, status: 'cached' });
    } catch {
      statuses.push({ engine, status: 'failed' });
    }
  }
  const snapshot = await mkdtemp(path.join(cache, 'db-'));
  const manifest = {
    directory: path.basename(snapshot),
    preparedAt: new Date().toISOString(),
    databases: [],
  };
  try {
    for (const ecosystem of ['npm', 'Packagist']) {
      console.error(
        `Mengunduh database OSV lengkap ${ecosystem}; tanpa daftar paket repository...`,
      );
      const metadataResponse = await fetch(
        `https://storage.googleapis.com/storage/v1/b/osv-vulnerabilities/o/${ecosystem}%2Fall.zip`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!metadataResponse.ok) throw new Error('Metadata database gagal.');
      const metadata = await metadataResponse.json();
      if (
        !/^\d+$/.test(metadata.generation) ||
        Number(metadata.size) > 1024 * 1024 * 1024 ||
        !metadata.md5Hash
      )
        throw new Error('Metadata database tidak valid.');
      const directory = path.join(snapshot, 'osv-scalibr', ecosystem);
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, 'all.zip');
      const size = await download(
        `https://storage.googleapis.com/osv-vulnerabilities/${ecosystem}/all.zip?generation=${metadata.generation}`,
        file,
        1024 * 1024 * 1024,
      );
      if (
        size !== Number(metadata.size) ||
        (await hashFile(file, 'md5', 'base64')) !== metadata.md5Hash
      )
        throw new Error('Integritas database gagal.');
      manifest.databases.push({
        ecosystem,
        size,
        sha256: await hashFile(file),
        generation: metadata.generation,
        updated: metadata.updated,
      });
    }
    const temporary = path.join(snapshot, 'manifest.json');
    await writeFile(temporary, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path.join(cache, 'database.json'));
    statuses.push({ engine: 'database', status: 'cached', preparedAt: manifest.preparedAt });
  } catch {
    await rm(snapshot, { recursive: true, force: true });
    statuses.push({ engine: 'database', status: 'failed' });
  }
  return statuses;
}

export async function verifyOfflineDatabase() {
  const manifest = JSON.parse(await readFile(path.join(cache, 'database.json'), 'utf8'));
  if (
    !/^db-[A-Za-z0-9]+$/.test(manifest.directory) ||
    !Array.isArray(manifest.databases) ||
    manifest.databases.length !== 2
  )
    throw new Error('Manifest database tidak valid.');
  const directory = path.join(cache, manifest.directory);
  for (const ecosystem of ['npm', 'Packagist']) {
    const entry = manifest.databases.find((item) => item.ecosystem === ecosystem);
    const file = path.join(directory, 'osv-scalibr', ecosystem, 'all.zip');
    if (!entry || (await hashFile(file)) !== entry.sha256)
      throw new Error('Checksum database tidak cocok.');
  }
  return { directory, preparedAt: manifest.preparedAt, databases: manifest.databases };
}

function safeFinding(engine, rawPath, line, ruleId, root) {
  if (
    typeof rawPath !== 'string' ||
    typeof ruleId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(ruleId) ||
    !Number.isSafeInteger(line) ||
    line < 1
  )
    throw new Error('Temuan engine tidak valid.');
  const file = path.relative(root, path.resolve(root, rawPath)).replaceAll('\\', '/');
  if (!file || file.startsWith('../') || path.isAbsolute(file) || /[\p{Cc}\p{Cf}]/u.test(file))
    throw new Error('Path temuan tidak valid.');
  return {
    engine,
    file,
    line,
    ruleId,
    evidence: 'review',
    message:
      engine === 'gitleaks'
        ? 'Indikasi secret; nilai tidak disertakan. Verifikasi dan rotasi jika aktif.'
        : 'Pola Semgrep terdeteksi; tinjau aliran input dan konteks kode.',
  };
}

export function parseOfflineFindings(engine, raw, root) {
  const data = JSON.parse(raw);
  const entries = engine === 'gitleaks' ? data : data.results;
  if (!Array.isArray(entries) || entries.length > 10_000)
    throw new Error('Output engine tidak valid.');
  const findings = entries.map((item) =>
    engine === 'gitleaks'
      ? safeFinding(engine, item.File, item.StartLine, item.RuleID, root)
      : safeFinding(engine, item.path, item.start?.line, item.check_id, root),
  );
  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file, 'en') ||
      a.line - b.line ||
      a.ruleId.localeCompare(b.ruleId, 'en'),
  );
  if (engine === 'semgrep' && data.errors !== undefined && !Array.isArray(data.errors))
    throw new Error('Daftar error Semgrep tidak valid.');
  return {
    findings,
    errors: engine === 'semgrep' && Array.isArray(data.errors) ? data.errors.length : 0,
  };
}

function gitleaksConfig(skippedWorktrees) {
  const paths = [
    String.raw`(^|[/\\])(\.git|\.sentinel-cache|node_modules|vendor|dist|build|coverage|\.next|\.output)([/\\]|$)`,
    ...skippedWorktrees.map((directory) => {
      const separator = process.platform === 'win32' ? String.raw`[/\\]` : '/';
      const literalPath = directory
        .split(path.sep)
        .map((part) => part.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'))
        .join(separator);
      return `^${literalPath}(${separator}|$)`;
    }),
  ];
  return `title="Sentinel offline"\n[extend]\nuseDefault=true\n[[allowlists]]\npaths=${JSON.stringify(paths)}\n`;
}

export async function runOfflineSourceEngine(engine, root, files, skippedWorktrees = []) {
  const version = engine === 'semgrep' ? semgrepVersion : gitleaksVersion;
  const base = { engine, version, findings: [] };
  if (engine === 'semgrep' && !files.length)
    return { ...base, status: 'skipped', reason: 'Tidak ada file source yang didukung.' };
  await mkdir(cache, { recursive: true });
  const temporary = await mkdtemp(path.join(cache, 'scan-'));
  try {
    const executable = await extractEngine(engine, temporary);
    const env = { ...process.env, SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0' };
    delete env.SEMGREP_APP_TOKEN;
    const options = {
      cwd: temporary,
      env,
      timeout: 180_000,
      maxBuffer: 12 * 1024 * 1024,
      encoding: 'utf8',
      windowsHide: true,
    };
    if (engine === 'gitleaks') {
      const config = path.join(temporary, 'gitleaks.toml');
      await writeFile(config, gitleaksConfig(skippedWorktrees), { flag: 'wx' });
      const { stdout } = await execute(
        executable,
        [
          'dir',
          '--config',
          config,
          '--gitleaks-ignore-path',
          temporary,
          '--ignore-gitleaks-allow',
          '--redact=100',
          '--report-format=json',
          '--report-path=-',
          '--exit-code=0',
          '--no-banner',
          '--no-color',
          '--log-level=error',
          '--max-target-megabytes=1',
          '--timeout=120',
          root,
        ],
        options,
      );
      return {
        ...base,
        ...parseOfflineFindings(engine, stdout, root),
        status: 'success',
        scope: 'working-tree; no Git history; files <=1 MiB; dependency/build folders excluded',
      };
    }
    if ((await hashFile(rules)) !== expectedRules) throw new Error('Ruleset Semgrep tidak cocok.');
    const targetsFile = path.join(temporary, 'semgrep-targets.json');
    const findings = [];
    let errors = 0;
    const started = Date.now();
    for (const language of ['php', 'javascript', 'typescript']) {
      const selected = files.filter((originalFile) => {
        const file = originalFile.toLowerCase();
        return language === 'php'
          ? file.endsWith('.php')
          : language === 'typescript'
            ? /\.(ts|tsx|mts|cts)$/.test(file)
            : /\.(js|jsx|mjs|cjs)$/.test(file);
      });
      for (let offset = 0; offset < selected.length; offset += 20) {
        if (Date.now() - started > 180_000) throw new Error('Timeout Semgrep.');
        const targets = selected.slice(offset, offset + 20).map((file) => [
          'CodeTarget',
          {
            path: { fpath: file, ppath: `/${path.relative(root, file).split(path.sep).join('/')}` },
            analyzer: language,
            products: ['sast'],
          },
        ]);
        await writeFile(targetsFile, JSON.stringify(['Targets', targets]), { mode: 0o600 });
        const { stdout } = await execute(
          executable,
          [
            '-rules',
            rules,
            '-targets',
            targetsFile,
            '-j',
            '1',
            '-json_nodots',
            '-timeout',
            '5',
            '-max_memory',
            '1024',
          ],
          { ...options, timeout: Math.max(1000, 180_000 - (Date.now() - started)) },
        );
        const parsed = parseOfflineFindings(engine, stdout, root);
        findings.push(...parsed.findings);
        if (findings.length > 10_000) throw new Error('Batas temuan Semgrep terlampaui.');
        errors += parsed.errors;
      }
    }
    return {
      ...base,
      findings,
      status: errors ? 'failed' : 'success',
      errors,
      rulesetDigest: expectedRules,
      reason: errors ? 'Sebagian file tidak berhasil dianalisis Semgrep.' : undefined,
    };
  } catch {
    return {
      ...base,
      status: 'failed',
      reason:
        engine === 'semgrep'
          ? 'Semgrep tidak dapat berjalan. Periksa runtime native (socketpair di Windows), cache, atau ruleset. Jangan anggap source lolos.'
          : 'Gitleaks gagal; periksa cache, runtime, atau batas scan. Jangan anggap tidak ada secret.',
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function auditOfflineDependencies(root, lockfiles) {
  if (!lockfiles.length)
    return { status: 'skipped', reason: 'Lockfile yang didukung tidak ditemukan.', findings: [] };
  try {
    const database = await verifyOfflineDatabase();
    const result = await auditDependencies(root, lockfiles, {
      offlineDatabase: database.directory,
    });
    return {
      ...result,
      networkMode: 'offline',
      databasePreparedAt: database.preparedAt,
      databases: database.databases,
    };
  } catch {
    return {
      status: 'failed',
      reason:
        'Database offline belum tersedia atau checksum gagal. Jalankan prepare-offline tanpa target repository terlebih dahulu.',
      findings: [],
    };
  }
}
