import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectRepositoryCoverage,
  deduplicateAdvisoryFindings,
  deriveReportStatus,
  parseComposerAuditJson,
  parseGitleaksJson,
  parseOsvJson,
  parseSemgrepJson,
} from './index.ts';
import {
  reportCoverageSchema,
  reportEnvelopeSchema,
  scannerExecutionSchema,
} from '@sentinel/contracts';

const scannerNames = ['semgrep', 'osv', 'gitleaks', 'composer'];
const toolVersions = {
  semgrep: '1.182.0',
  osv: '2.7.0',
  gitleaks: '8.30.1',
  composer: '2.10.3',
};
const images = {
  semgrep: 'semgrep/semgrep:1.182.0',
  osv: 'ghcr.io/google/osv-scanner:v2.7.0',
  gitleaks:
    'ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:b109bc5f8f76a38196a3e413704fc5b9e3c32360bce4e4b603bd6f45b3721dbb',
  composer: 'composer:2.10.3',
};
const approvedRulesVersion = '1.0.0';
const approvedRulesDigest = '10fae8d4669e57777efab9c386c0cf716dbdf5d81d3073cd65e25e616db0379d';
const rulesSource =
  'https://github.com/abbyhilman/sentinel-security-scanner/blob/master/templates/github-workflows/rules/sentinel-security.yml';
const maxProcessOutputBytes = 8 * 1024 * 1024;
const maxArtifactBytes = 4 * 1024 * 1024;
const maxTrackedFiles = 100_000;
const maxManifestsRead = 2_000;
const maxManifestBytes = 16 * 1024 * 1024;
const maxComposerProjects = 5;
const maxFindings = 250;
const maxFindingReferences = 5;
const maxAdvisoryIds = 20;
const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const runtimeRoot = path.resolve(runtimeDirectory);

function nowIso() {
  return new Date().toISOString();
}

function withinDirectory(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  );
}

function getRunMetadata() {
  const repositoryId = Number(process.env.GITHUB_REPOSITORY_ID);
  const runId = Number(process.env.GITHUB_RUN_ID);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  const repository = process.env.GITHUB_REPOSITORY || '';
  const sha = process.env.GITHUB_SHA || '';
  const ref = process.env.GITHUB_REF || '';
  const workflowRef = process.env.GITHUB_WORKFLOW_REF || '';
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const defaultBranch = process.env.SENTINEL_DEFAULT_BRANCH || '';

  if (
    !Number.isSafeInteger(repositoryId) ||
    repositoryId < 1 ||
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(sha) ||
    !workflowRef ||
    !defaultBranch ||
    !['push', 'workflow_dispatch'].includes(eventName) ||
    ref !== 'refs/heads/' + defaultBranch
  ) {
    throw new Error(
      'Workflow identity is incomplete or outside the allowed default-branch events.',
    );
  }

  return {
    repository: { id: repositoryId, fullName: repository },
    github: { runId, runAttempt, sha, ref, workflowRef },
  };
}

function stopContainer(containerName) {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    let timer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    try {
      child = spawn('docker', ['kill', containerName], {
        stdio: 'ignore',
        shell: false,
      });
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish();
      }, 5_000);
      timer.unref();
      child.once('close', finish);
      child.once('error', finish);
    } catch {
      finish();
    }
  });
}

function runProcess(command, args, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const outputLimit = options.outputLimit ?? maxProcessOutputBytes;

  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let spawnFailed = false;
    let terminationRequested = false;
    let containerStopPromise;
    let byteCount = 0;
    const chunks = [];

    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceKill);
      resolve({
        exitCode,
        timedOut,
        overflow,
        spawnFailed,
        stdout: Buffer.concat(chunks).toString('utf8'),
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    };

    let timeout;
    let forceKill;
    const waitAndFinish = (exitCode) => {
      Promise.resolve(containerStopPromise).then(() => finish(exitCode));
    };
    const terminate = () => {
      if (terminationRequested) return;
      terminationRequested = true;
      if (options.containerName) {
        containerStopPromise = stopContainer(options.containerName);
      }
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 3_000);
      forceKill.unref();
    };
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: false,
      });
    } catch {
      spawnFailed = true;
      finish(null);
      return;
    }

    timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timeout.unref();

    child.stdout.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > outputLimit) {
        overflow = true;
        terminate();
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => {
      spawnFailed = true;
      waitAndFinish(null);
    });
    child.once('close', (code) => waitAndFinish(code));
  });
}

function dockerInvocation(scanner, network, command, options = {}) {
  const runId = process.env.GITHUB_RUN_ID || 'run';
  const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
  const suffix = options.suffix ? '-' + options.suffix : '';
  const containerName = 'sentinel-' + scanner + '-' + runId + '-' + attempt + suffix;
  const args = [
    'run',
    '--rm',
    '--pull=missing',
    '--init',
    '--name',
    containerName,
    '--network=' + network,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=128',
    '--memory=' + (options.memory || '1g'),
    '--cpus=' + (options.cpus || '2'),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=512m',
    '--env',
    'HOME=/tmp',
    '--mount',
    'type=bind,src=' + workspace + ',dst=/src,readonly',
    '--mount',
    'type=bind,src=' + runtimeRoot + ',dst=/sentinel,readonly',
  ];
  if (options.outputDirectory) {
    args.push('--mount', 'type=bind,src=' + options.outputDirectory + ',dst=/out');
  }
  if (options.workdir) args.push('--workdir', options.workdir);
  if (scanner === 'composer') args.push('--env', 'COMPOSER_HOME=/tmp/composer');
  args.push(images[scanner], ...command);
  return { containerName, args };
}

async function trackedFiles() {
  const listing = await runProcess('git', ['ls-files', '-z'], {
    cwd: workspace,
    timeoutMs: 30_000,
    outputLimit: 32 * 1024 * 1024,
  });
  if (listing.spawnFailed || listing.timedOut || listing.overflow || listing.exitCode !== 0) {
    throw new Error(
      'Tracked repository files could not be enumerated within the configured limit.',
    );
  }

  const paths = listing.stdout.split('\0').filter(Boolean);
  if (paths.length > maxTrackedFiles) {
    throw new Error('Tracked repository file count exceeds the coverage inventory limit.');
  }

  const descriptors = paths.map((filePath) => ({ path: filePath }));
  const workspaceRealPath = await realpath(workspace);
  let manifestCount = 0;
  let manifestBytesRead = 0;
  let incompleteManifestInventory = false;
  for (const descriptor of descriptors) {
    const basename = descriptor.path.split('/').at(-1)?.toLowerCase();
    if (basename !== 'composer.json' && basename !== 'package.json') continue;
    if (manifestCount >= maxManifestsRead) {
      incompleteManifestInventory = true;
      continue;
    }
    manifestCount += 1;

    try {
      const fullPath = path.resolve(workspaceRealPath, descriptor.path);
      if (!withinDirectory(workspaceRealPath, fullPath)) {
        incompleteManifestInventory = true;
        continue;
      }
      const actualPath = await realpath(fullPath);
      if (!withinDirectory(workspaceRealPath, actualPath)) {
        incompleteManifestInventory = true;
        continue;
      }
      const details = await stat(actualPath);
      if (!details.isFile() || details.size > 1024 * 1024) {
        incompleteManifestInventory = true;
        continue;
      }
      if (manifestBytesRead + details.size > maxManifestBytes) {
        incompleteManifestInventory = true;
        continue;
      }
      descriptor.content = await readFile(actualPath, 'utf8');
      manifestBytesRead += details.size;
    } catch {
      incompleteManifestInventory = true;
    }
  }

  return {
    files: descriptors,
    warnings: incompleteManifestInventory
      ? [
          'Sebagian manifest tidak dibaca karena batas inventory; framework hints dapat tidak lengkap.',
        ]
      : [],
  };
}

function makeExecution(scanner, status, options = {}) {
  const candidate = {
    scanner,
    toolVersion: toolVersions[scanner],
    status,
    durationMs: Math.min(Math.max(0, Math.trunc(options.durationMs || 0)), 86_400_000),
    findingsCount: Math.max(0, Math.trunc(options.findingsCount || 0)),
    licenseGate: options.licenseGate || 'unknown',
    ...(options.skipReason ? { skipReason: options.skipReason } : {}),
    ...(options.error ? { sanitizedError: options.error } : {}),
    ...(options.rulesetVersion ? { rulesetVersion: options.rulesetVersion } : {}),
    ...(options.rulesetDigest ? { rulesetDigest: options.rulesetDigest } : {}),
    ...(options.rulesetSource ? { rulesetSource: options.rulesetSource } : {}),
  };
  return scannerExecutionSchema.parse(candidate);
}

function failedResult(scanner, message, options = {}) {
  return {
    execution: makeExecution(scanner, 'failed', { ...options, error: message }),
    findings: [],
  };
}

function skippedResult(scanner, reason) {
  return { execution: makeExecution(scanner, 'skipped', { skipReason: reason }), findings: [] };
}

function replaceExecution(execution, status, error) {
  const { sanitizedError, ...remaining } = execution;
  return scannerExecutionSchema.parse({
    ...remaining,
    status,
    ...(status === 'failed' || status === 'timed_out'
      ? { sanitizedError: error || sanitizedError || 'Scanner tidak menyelesaikan pemeriksaan.' }
      : {}),
  });
}

async function parseProcessResult(scanner, parser, processResult, options = {}) {
  if (processResult.overflow || processResult.spawnFailed) {
    return failedResult(
      scanner,
      processResult.overflow
        ? 'Output scanner melebihi batas yang ditetapkan.'
        : 'Scanner tidak dapat dijalankan pada runner.',
      { durationMs: processResult.durationMs, ...options },
    );
  }

  const parsed = await parser(processResult.stdout, {
    checkoutRoot: '/src',
    toolVersion: toolVersions[scanner],
    durationMs: processResult.durationMs,
    ...(options.rulesetVersion ? { rulesetVersion: options.rulesetVersion } : {}),
    ...(options.rulesetDigest ? { rulesetDigest: options.rulesetDigest } : {}),
    ...(options.rulesetSource ? { rulesetSource: options.rulesetSource } : {}),
    ...(options.licenseGate ? { licenseGate: options.licenseGate } : {}),
  });

  if (processResult.timedOut) {
    return {
      ...parsed,
      execution: replaceExecution(
        parsed.execution,
        'timed_out',
        'Scanner melewati batas waktu yang ditetapkan.',
      ),
    };
  }

  const acceptedExit =
    processResult.exitCode === 0 ||
    (processResult.exitCode === 1 &&
      parsed.execution.status === 'success' &&
      parsed.findings.length > 0);
  if (!acceptedExit || parsed.execution.status !== 'success') {
    return {
      ...parsed,
      execution: replaceExecution(
        parsed.execution,
        'failed',
        parsed.execution.sanitizedError ||
          'Scanner berhenti dengan status yang tidak dapat dianggap sebagai hasil lengkap.',
      ),
    };
  }
  return parsed;
}

async function verifyRules() {
  try {
    const rulePath = path.join(runtimeRoot, 'rules', 'sentinel-security.yml');
    const manifestPath = path.join(runtimeRoot, 'rules', 'manifest.json');
    const contents = await readFile(rulePath);
    const digest = createHash('sha256').update(contents).digest('hex');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const approved =
      digest === approvedRulesDigest &&
      manifest.schemaVersion === 1 &&
      manifest.version === approvedRulesVersion &&
      manifest.license === 'MIT' &&
      manifest.licenseGate === 'approved' &&
      manifest.rulesFile === 'sentinel-security.yml' &&
      manifest.rulesSha256 === approvedRulesDigest;
    return { digest, approved };
  } catch {
    return { digest: undefined, approved: false };
  }
}

async function runSemgrep(coverage) {
  if (!coverage.applicableScanners.includes('semgrep')) {
    return skippedResult('semgrep', 'Tidak ditemukan file PHP, JavaScript, atau TypeScript.');
  }

  const rules = await verifyRules();
  const ruleOptions = {
    rulesetSource: rulesSource,
    licenseGate: rules.approved ? 'approved' : 'blocked',
    ...(rules.digest ? { rulesetVersion: approvedRulesVersion, rulesetDigest: rules.digest } : {}),
  };
  if (!rules.approved) {
    return failedResult(
      'semgrep',
      'Digest atau manifest rules Semgrep tidak cocok dengan ruleset yang disetujui.',
      ruleOptions,
    );
  }

  const invocation = dockerInvocation(
    'semgrep',
    'none',
    ['scan', '--config=/sentinel/rules/sentinel-security.yml', '--metrics=off', '--json', '/src'],
    { memory: '2g' },
  );
  const result = await runProcess('docker', invocation.args, {
    cwd: workspace,
    timeoutMs: 8 * 60 * 1000,
    containerName: invocation.containerName,
  });
  return parseProcessResult('semgrep', parseSemgrepJson, result, ruleOptions);
}

async function runOsv(coverage) {
  if (!coverage.applicableScanners.includes('osv')) {
    return skippedResult('osv', 'Tidak ditemukan lockfile dependency yang didukung.');
  }
  const invocation = dockerInvocation('osv', 'bridge', [
    'scan',
    'source',
    '--recursive',
    '--format=json',
    '/src',
  ]);
  const result = await runProcess('docker', invocation.args, {
    cwd: workspace,
    timeoutMs: 12 * 60 * 1000,
    containerName: invocation.containerName,
  });
  return parseProcessResult('osv', parseOsvJson, result);
}

async function runGitleaks() {
  let outputDirectory;
  try {
    outputDirectory = await mkdtemp(
      path.join(process.env.RUNNER_TEMP || tmpdir(), 'sentinel-gitleaks-'),
    );
    const invocation = dockerInvocation(
      'gitleaks',
      'none',
      [
        'dir',
        '--config=/sentinel/gitleaks.toml',
        '--report-format=json',
        '--report-path=/out/gitleaks.json',
        '--redact=100',
        '--exit-code=0',
        '--no-banner',
        '--max-target-megabytes=10',
        '--timeout=180',
        '/src',
      ],
      { outputDirectory },
    );
    const processResult = await runProcess('docker', invocation.args, {
      cwd: workspace,
      timeoutMs: 5 * 60 * 1000,
      outputLimit: 1024 * 1024,
      containerName: invocation.containerName,
    });
    let rawJson = '';
    let rawReport;
    try {
      const rawPath = path.join(outputDirectory, 'gitleaks.json');
      rawReport = await open(
        rawPath,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
      );
      const details = await rawReport.stat();
      if (details.isFile() && details.size <= maxProcessOutputBytes) {
        rawJson = await rawReport.readFile('utf8');
      } else {
        processResult.overflow = true;
      }
    } catch {
      // A missing report is parsed as malformed output and records a failed engine.
    } finally {
      await rawReport?.close().catch(() => {});
    }
    return await parseProcessResult('gitleaks', parseGitleaksJson, {
      ...processResult,
      stdout: rawJson,
    });
  } catch {
    return failedResult('gitleaks', 'Gitleaks tidak dapat menyiapkan laporan yang dibatasi.');
  } finally {
    if (outputDirectory)
      await rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function runComposer(coverage) {
  const projects = coverage.projects
    .filter((project) => project.ecosystem === 'composer' && project.lockfiles.length > 0)
    .map((project) => {
      const lockfilePath =
        project.projectPath === '.' ? 'composer.lock' : `${project.projectPath}/composer.lock`;
      return project.lockfiles.includes(lockfilePath)
        ? { projectPath: project.projectPath, lockfilePath }
        : undefined;
    })
    .filter((project) => project !== undefined);
  if (projects.length === 0) {
    return coverage.projects.some(
      (project) => project.ecosystem === 'composer' && project.lockfiles.length > 0,
    )
      ? failedResult('composer', 'Path composer.lock untuk proyek tidak dapat dipastikan.')
      : skippedResult('composer', 'composer.lock tidak ditemukan.');
  }
  if (projects.length > maxComposerProjects) {
    return failedResult(
      'composer',
      'Jumlah proyek Composer melebihi batas pemindaian per workflow.',
    );
  }

  const findings = [];
  let durationMs = 0;
  let failure;
  let timedOut = false;
  let overflow = false;
  let spawnFailed = false;
  for (let index = 0; index < projects.length; index += 1) {
    const { projectPath, lockfilePath } = projects[index];
    const workdir =
      projectPath === '.' ? '/src' : path.posix.join('/src', ...projectPath.split('/'));
    const invocation = dockerInvocation(
      'composer',
      'bridge',
      [
        '--no-plugins',
        '--no-scripts',
        '--no-interaction',
        'audit',
        '--locked',
        '--format=json',
        '--abandoned=ignore',
      ],
      { workdir, suffix: String(index + 1) },
    );
    const processResult = await runProcess('docker', invocation.args, {
      cwd: workspace,
      timeoutMs: 2 * 60 * 1000,
      containerName: invocation.containerName,
    });
    durationMs += processResult.durationMs;
    timedOut ||= processResult.timedOut;
    overflow ||= processResult.overflow;
    spawnFailed ||= processResult.spawnFailed;

    const parsed = await parseComposerAuditJson(processResult.stdout, {
      checkoutRoot: '/src',
      toolVersion: toolVersions.composer,
      durationMs: processResult.durationMs,
    });
    findings.push(...parsed.findings.map((finding) => ({ ...finding, filePath: lockfilePath })));
    if (
      parsed.execution.status !== 'success' ||
      processResult.overflow ||
      processResult.spawnFailed ||
      (!processResult.timedOut &&
        processResult.exitCode !== 0 &&
        !(processResult.exitCode === 1 && parsed.findings.length > 0))
    ) {
      failure ||= parsed.execution.sanitizedError || 'Audit Composer tidak selesai dengan valid.';
    }
  }

  const status = timedOut ? 'timed_out' : overflow || spawnFailed || failure ? 'failed' : 'success';
  const execution = makeExecution('composer', status, {
    durationMs,
    findingsCount: findings.length,
    ...(status === 'failed'
      ? {
          error: overflow
            ? 'Output audit Composer melebihi batas.'
            : failure || 'Audit Composer gagal.',
        }
      : {}),
    ...(status === 'timed_out'
      ? { error: 'Audit Composer melewati batas waktu yang ditetapkan.' }
      : {}),
  });
  return { execution, findings };
}

function fallbackCoverage(message) {
  return reportCoverageSchema.parse({
    languages: [],
    frameworkHints: [],
    projects: [],
    applicableScanners: scannerNames,
    skippedScanners: [],
    missingLockfiles: [],
    warnings: [message],
  });
}

function fallbackReport(metadata, startedAt, message) {
  const coverage = fallbackCoverage(message);
  const scannerExecutions = scannerNames.map((scanner) =>
    makeExecution(scanner, 'failed', { error: message }),
  );
  const completedAt = nowIso();
  return reportEnvelopeSchema.parse({
    schemaVersion: 1,
    ...metadata,
    summary: {
      status: deriveReportStatus(scannerExecutions, coverage),
      startedAt,
      completedAt,
    },
    scannerExecutions,
    findings: [],
    coverage,
  });
}

function capResults(results, coverage) {
  const allFindings = deduplicateAdvisoryFindings(results.flatMap((result) => result.findings));
  const severityOrder = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
    unknown: 5,
  };
  const ordered = [...allFindings].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.fingerprint.localeCompare(right.fingerprint),
  );
  const findings = ordered.slice(0, maxFindings).map((finding) => ({
    ...finding,
    ...(finding.references
      ? { references: finding.references.slice(0, maxFindingReferences) }
      : {}),
    ...(finding.advisoryIds ? { advisoryIds: finding.advisoryIds.slice(0, maxAdvisoryIds) } : {}),
  }));
  const omitted = ordered.slice(maxFindings);
  const truncatedScanners = new Set(omitted.flatMap((finding) => finding.scannerSources));
  const scannerExecutions = results.map((result) => {
    const execution = result.execution;
    if (!truncatedScanners.has(execution.scanner)) return execution;
    return replaceExecution(
      execution,
      execution.status === 'timed_out' ? 'timed_out' : 'failed',
      execution.status === 'timed_out'
        ? execution.sanitizedError
        : 'Sebagian temuan melewati batas artifact dan tidak disertakan.',
    );
  });

  const safeCoverage = reportCoverageSchema.parse({
    ...coverage,
    warnings: [
      ...coverage.warnings,
      ...(omitted.length > 0
        ? [
            'Sebagian finding tidak disertakan karena batas artifact; engine terkait berstatus gagal.',
          ]
        : []),
    ].slice(0, 100),
  });
  return { scannerExecutions, findings, coverage: safeCoverage };
}

async function writeReport(report) {
  const outputPath =
    process.env.SENTINEL_REPORT_PATH ||
    path.join(process.env.RUNNER_TEMP || tmpdir(), 'sentinel', 'report.json');
  const outputDirectory = path.dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true });
  const json = JSON.stringify(report, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > maxArtifactBytes) {
    const compact = fallbackReport(
      { repository: report.repository, github: report.github },
      report.summary.startedAt,
      'Laporan tersanitasi melewati batas ukuran artifact 4 MiB; hasil engine ditandai gagal.',
    );
    await writeFileBounded(outputPath, compact);
    return compact;
  }
  await writeFileBounded(outputPath, report);
  return report;
}

async function writeFileBounded(outputPath, report) {
  const json = JSON.stringify(report, null, 2) + '\n';
  await writeFile(outputPath, json, { encoding: 'utf8', mode: 0o600 });
}

async function main() {
  const metadata = getRunMetadata();
  const startedAt = nowIso();
  let inventory;
  let coverage;
  try {
    inventory = await trackedFiles();
    coverage = detectRepositoryCoverage(inventory.files);
    if (inventory.warnings.length > 0) {
      coverage = reportCoverageSchema.parse({
        ...coverage,
        warnings: [...coverage.warnings, ...inventory.warnings].slice(0, 100),
      });
    }
  } catch {
    const report = fallbackReport(
      metadata,
      startedAt,
      'Repository coverage tidak dapat dihitung dalam batas inventory yang ditetapkan.',
    );
    await writeReport(report);
    console.log('Sentinel sanitized report saved; repository inventory was incomplete.');
    return;
  }

  const results = [];
  for (const scanner of scannerNames) {
    try {
      if (scanner === 'semgrep') results.push(await runSemgrep(coverage));
      else if (scanner === 'osv') results.push(await runOsv(coverage));
      else if (scanner === 'gitleaks') results.push(await runGitleaks());
      else results.push(await runComposer(coverage));
    } catch {
      results.push(failedResult(scanner, 'Scanner gagal pada batas isolasi runner.'));
    }
  }

  const capped = capResults(results, coverage);
  const completedAt = nowIso();
  const report = reportEnvelopeSchema.parse({
    schemaVersion: 1,
    ...metadata,
    summary: {
      status: deriveReportStatus(capped.scannerExecutions, capped.coverage),
      startedAt,
      completedAt,
    },
    scannerExecutions: capped.scannerExecutions,
    findings: capped.findings,
    coverage: capped.coverage,
  });
  const saved = await writeReport(report);
  const statusLine = saved.scannerExecutions
    .map((execution) => execution.scanner + '=' + execution.status)
    .join(', ');
  console.log('Sentinel sanitized report saved (' + saved.summary.status + '): ' + statusLine);
}

main().catch(() => {
  console.error('Sentinel runner could not create a sanitized report.');
  process.exitCode = 1;
});
