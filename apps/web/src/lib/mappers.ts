import type { FindingApiRecord, Repository, ScanRun } from '@sentinel/contracts';
import type {
  EngineRunFixture,
  FindingFixture,
  RepositoryFixture,
  ScanFixture,
} from '../fixtures/mock/types';

const scannerLabels: Record<string, string> = {
  semgrep: 'Semgrep Community Edition',
  osv: 'OSV-Scanner',
  gitleaks: 'Gitleaks CLI',
  composer: 'Composer Audit',
};

const categoryLabels: Record<string, string> = {
  sast: 'Analisis kode',
  secret: 'Indikasi secret',
  sca: 'Dependensi',
  unknown: 'Kategori tidak diketahui',
};

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Belum tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum tersedia';
  return `${new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(date)} WIB`;
}

function splitRepository(fullName: string) {
  const [owner = 'unknown', ...nameParts] = fullName.split('/');
  return { owner, name: nameParts.join('/') || fullName };
}

export function mapRepository(repository: Repository): RepositoryFixture {
  const { owner, name } = splitRepository(repository.fullName);
  return {
    id: repository.id,
    owner,
    name,
    fullName: repository.fullName,
    visibility: repository.visibility,
    status: repository.status === 'pending_pairing' ? 'pending' : repository.status,
    primaryStack: 'Belum dilaporkan',
    defaultBranch: repository.defaultBranch,
    lastScanId: repository.lastRun?.id,
    lastCommit: repository.lastRun?.commitSha.slice(0, 7),
    lastRunAt: repository.lastRun
      ? formatDate(repository.lastRun.completedAt ?? repository.lastRun.createdAt)
      : undefined,
  };
}

function mapEngine(engine: NonNullable<ScanRun['engines']>[number]): EngineRunFixture {
  const id = engine.scanner === 'composer' ? 'composer-audit' : engine.scanner;
  const status = engine.status === 'success' ? 'completed' : engine.status;
  const detail =
    engine.status === 'failed'
      ? (engine.errorRedacted ?? 'Engine melaporkan kegagalan.')
      : engine.status === 'skipped'
        ? (engine.skipReason ?? 'Engine tidak berlaku untuk repository ini.')
        : engine.status === 'timed_out'
          ? 'Engine melewati batas waktu.'
          : 'Engine menyelesaikan pemeriksaan.';
  return {
    id,
    label: scannerLabels[engine.scanner] ?? engine.scanner,
    status,
    version: engine.version,
    detail,
    findingCount: engine.findingsCount,
    elapsedMs: engine.elapsedMs,
    errorRedacted: engine.errorRedacted,
  };
}

export function mapScan(run: ScanRun): ScanFixture {
  const started = run.startedAt ? new Date(run.startedAt).getTime() : Number.NaN;
  const completed = run.completedAt ? new Date(run.completedAt).getTime() : Number.NaN;
  const elapsedSeconds =
    Number.isFinite(started) && Number.isFinite(completed)
      ? Math.max(0, Math.round((completed - started) / 1000))
      : null;
  const duration =
    elapsedSeconds === null
      ? 'Tidak tersedia'
      : `${Math.floor(elapsedSeconds / 60)} mnt ${String(elapsedSeconds % 60).padStart(2, '0')} dtk`;
  return {
    id: run.id,
    repositoryId: run.repositoryId,
    repositoryFullName: run.repositoryFullName,
    status: run.status,
    commit: run.commitSha,
    branch: run.ref.replace(/^refs\/heads\//u, ''),
    runNumber: run.githubRunId,
    githubRunId: run.githubRunId,
    attempt: run.runAttempt,
    startedAt: formatDate(run.startedAt ?? run.createdAt),
    duration,
    engines: (run.engines ?? []).map(mapEngine),
    workflowRef: run.workflowRef,
    coverage: run.coverage,
    completedAt: run.completedAt,
  };
}

export function mapFinding(finding: FindingApiRecord): FindingFixture {
  const evidence = finding.evidence[0];
  const excerpt = evidence?.redactedExcerpt?.split(/\r?\n/u).filter(Boolean) ?? [];
  const advisory = finding.advisories[0];
  return {
    id: finding.id,
    repositoryId: finding.repositoryId,
    repositoryFullName: finding.repositoryFullName,
    scanId: finding.scanId,
    severity: finding.severity,
    title: finding.title,
    category: categoryLabels[finding.category] ?? finding.category,
    detector: scannerLabels[finding.scanner] ?? finding.scanner,
    ruleId: finding.ruleId,
    path: evidence?.filePath ?? 'Lokasi tidak tersedia',
    line: evidence?.lineStart ?? 0,
    evidenceStatus: excerpt.length ? 'sanitized' : 'metadata_only',
    confidence:
      finding.evidenceStatus === 'potentially_affected'
        ? 'potential'
        : finding.evidenceStatus === 'unknown'
          ? 'unknown'
          : 'needs_review',
    triage: finding.triage,
    lastDetected: formatDate(finding.createdAt),
    advisory: advisory ? (advisory.title ?? advisory.sourceAdvisoryId) : undefined,
    excerpt,
    history: [],
    commitSha: finding.commitSha,
    sourceUrl: finding.sourceUrl,
    createdAt: finding.createdAt,
  };
}
