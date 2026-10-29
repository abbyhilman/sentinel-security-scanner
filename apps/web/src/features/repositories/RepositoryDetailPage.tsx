import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  LockKeyhole,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useCallback, useEffect, useState } from 'react';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { usePreviewState } from '../../components/PreviewContext';
import { Button, Callout, PageHeader, Panel, StatusPill } from '../../components/ui';
import { getFindingsForRepository, getRepository, getScan } from '../../fixtures/mock/data';
import type { RepositoryFixture } from '../../fixtures/mock/types';
import { useAuth } from '../../components/AuthContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { useApiQuery } from '../../lib/useApiQuery';
import { apiPost } from '../../lib/api';
import {
  dataResponseSchema,
  findingApiSchema,
  pagedResponseSchema,
  pairingResponseSchema,
  repositorySchema,
  scanRunSchema,
} from '@sentinel/contracts';
import { formatDate, mapRepository, mapScan } from '../../lib/mappers';
import { clearPairing, keepPairing, readPairing } from '../../lib/pairing';
import { publicEnv } from '../../lib/supabase';
import type { PairingResponse } from '@sentinel/contracts';
import { useWorkspace } from '../../components/WorkspaceContext';
import { apiGet } from '../../lib/api';
import { useApiPages } from '../../lib/useApiQuery';

type NewRepositoryLocationState = {
  owner?: string;
  name?: string;
  defaultBranch?: string;
  pairingError?: boolean;
} | null;

function getRepositoryFromRoute(id: string | undefined, locationState: NewRepositoryLocationState) {
  if (id === 'new-pending') {
    const repository: RepositoryFixture = {
      id: 'new-pending',
      owner: locationState?.owner ?? 'contoh-org',
      name: locationState?.name ?? 'new-repo',
      visibility: 'private',
      status: 'pending',
      primaryStack: 'Belum terdeteksi',
      defaultBranch: locationState?.defaultBranch ?? 'main',
    };
    return repository;
  }
  return id ? getRepository(id) : undefined;
}

function SetupStep({
  number,
  title,
  description,
  status,
  children,
}: {
  number: string;
  title: string;
  description: string;
  status?: 'active' | 'done';
  children?: ReactNode;
}) {
  return (
    <div className={`setup-step ${status === 'active' ? 'setup-step-active' : ''}`}>
      <div className={`setup-step-number ${status === 'done' ? 'setup-number-done' : ''}`}>
        {status === 'done' ? <Check size={15} aria-hidden="true" /> : number}
      </div>
      <div className="setup-step-content">
        <h3>{title}</h3>
        <p>{description}</p>
        {children}
      </div>
    </div>
  );
}

function PendingRepository({ repository }: { repository: RepositoryFixture }) {
  return (
    <>
      <Callout tone="warning" className="state-callout">
        <strong>Workflow belum terhubung</strong>
        <span>
          Repositori masih menunggu bukti identitas workflow. Mendaftarkan nama repo tidak mengubah
          status verifikasi.
        </span>
      </Callout>

      <div className="repository-detail-grid">
        <Panel className="setup-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PENYIAPAN PEMILIK</p>
              <h2>Hubungkan workflow milikmu</h2>
              <p className="panel-subtitle">Lakukan langkah ini di repositori yang kamu kelola.</p>
            </div>
            <span className="step-count">0 dari 3</span>
          </div>
          <div className="setup-steps">
            <SetupStep
              number="1"
              title="Pastikan repositori benar"
              description={`Konfirmasi ${repository.owner}/${repository.name} adalah repositori yang kamu kelola.`}
              status="active"
            />
            <SetupStep
              number="2"
              title="Pasang workflow yang ditinjau"
              description="Workflow dijalankan oleh GitHub Actions di repositori ini. Sentinel tidak memasangnya secara otomatis dan tidak menjalankan build atau test proyek."
            >
              <div className="workflow-placeholder">
                <div className="workflow-placeholder-heading">
                  <TerminalSquare size={16} aria-hidden="true" />
                  <strong>Template workflow</strong>
                  <span>Belum tersedia di pratinjau</span>
                </div>
                <p>
                  Instruksi dan file YAML akan ditampilkan setelah workflow melewati review
                  keamanan.
                </p>
                <Button size="small" disabled title="Template belum tersedia di pratinjau">
                  <Copy size={14} aria-hidden="true" /> Salin instruksi
                </Button>
              </div>
            </SetupStep>
            <SetupStep
              number="3"
              title="Jalankan dan verifikasi"
              description="Identity workflow dan pairing nonce harus cocok sebelum repositori ditandai terverifikasi. Hasil scan tetap merupakan laporan workflow, bukan verifikasi independen."
            />
          </div>
          <div className="setup-footer">
            <Button disabled title="Tindakan tersedia setelah workflow dipasang">
              <Clock3 size={15} aria-hidden="true" /> Menunggu pemasangan workflow
            </Button>
            <span>Belum ada scan yang dijalankan.</span>
          </div>
        </Panel>

        <Panel className="repository-context-panel">
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">DETAIL REPOSITORI</p>
              <h2>Informasi sumber</h2>
            </div>
            <LockKeyhole size={18} aria-hidden="true" />
          </div>
          <dl className="detail-list">
            <div>
              <dt>Repositori</dt>
              <dd>
                <code>
                  {repository.owner}/{repository.name}
                </code>
              </dd>
            </div>
            <div>
              <dt>Visibilitas</dt>
              <dd>Privat · contoh</dd>
            </div>
            <div>
              <dt>Branch utama</dt>
              <dd>
                <GitBranch size={14} aria-hidden="true" /> {repository.defaultBranch}
              </dd>
            </div>
            <div>
              <dt>Stack</dt>
              <dd>{repository.primaryStack}</dd>
            </div>
            <div>
              <dt>Status identitas</dt>
              <dd>
                <StatusPill status="pending" />
              </dd>
            </div>
          </dl>
          <Callout tone="info" className="compact-callout">
            <strong>Kontrol repositori</strong>
            <span>
              Verifikasi memakai identitas workflow GitHub dan pairing yang terikat ke repositori
              ini.
            </span>
          </Callout>
        </Panel>
      </div>
    </>
  );
}

function VerifiedRepository({ repository }: { repository: RepositoryFixture }) {
  const scan = repository.lastScanId ? getScan(repository.lastScanId) : undefined;
  const findings = getFindingsForRepository(repository.id);
  return (
    <>
      <Callout tone="success" className="state-callout">
        <strong>Identitas workflow terverifikasi</strong>
        <span>
          Ini hanya menyatakan identitas workflow cocok. Isi laporan tetap berasal dari workflow
          repo dan tidak diverifikasi secara independen.
        </span>
      </Callout>
      <div className="repository-detail-grid verified-detail-grid">
        <Panel>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">AKTIVITAS PEMERIKSAAN</p>
              <h2>Scan terbaru</h2>
            </div>
            {scan && <StatusPill status={scan.status} />}
          </div>
          {scan ? (
            <Link className="featured-scan-card" to={`/scans/${scan.id}`}>
              <div className="featured-scan-icon">
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div>
                <strong>{scan.runNumber}</strong>
                <span>
                  <GitCommitHorizontal size={13} aria-hidden="true" /> {scan.commit} ·{' '}
                  {scan.startedAt}
                </span>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <p className="muted-copy">Belum ada laporan scan.</p>
          )}
          <div className="repo-detail-links">
            {scan && (
              <Link className="text-link" to={`/scans/${scan.id}`}>
                Buka detail scan
              </Link>
            )}
            <Link className="text-link" to="/findings">
              Lihat temuan ({findings.length})
            </Link>
          </div>
        </Panel>
        <Panel>
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">IDENTITAS</p>
              <h2>Workflow terpasang</h2>
            </div>
            <ShieldCheck size={18} className="success-icon" aria-hidden="true" />
          </div>
          <dl className="detail-list">
            <div>
              <dt>Branch utama</dt>
              <dd>
                <GitBranch size={14} aria-hidden="true" /> {repository.defaultBranch}
              </dd>
            </div>
            <div>
              <dt>Commit terakhir</dt>
              <dd>
                <code>{repository.lastCommit}</code>
              </dd>
            </div>
            <div>
              <dt>Waktu laporan</dt>
              <dd>{repository.lastRunAt}</dd>
            </div>
          </dl>
          <Callout tone="info" className="compact-callout">
            <span>Provenance CI membuktikan identitas job, bukan kebenaran hasil scan.</span>
          </Callout>
        </Panel>
      </div>
    </>
  );
}

function LiveVerifiedRepository({ repository }: { repository: RepositoryFixture }) {
  const runsPath = `/v1/repositories/${encodeURIComponent(repository.id)}/runs?limit=1`;
  const loadRuns = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${runsPath}&cursor=${encodeURIComponent(cursor)}` : runsPath,
        pagedResponseSchema(scanRunSchema),
      ),
    [runsPath],
  );
  const runs = useApiPages(repository.id, loadRuns);
  const latestRun = runs.data[0];
  const runQuery = useApiQuery(
    latestRun?.id ?? null,
    latestRun ? `/v1/runs/${encodeURIComponent(latestRun.id)}` : '',
    dataResponseSchema(scanRunSchema),
  );
  const findingsPath = latestRun
    ? `/v1/runs/${encodeURIComponent(latestRun.id)}/findings?limit=100`
    : '';
  const loadFindings = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${findingsPath}&cursor=${encodeURIComponent(cursor)}` : findingsPath,
        pagedResponseSchema(findingApiSchema),
      ),
    [findingsPath],
  );
  const findings = useApiPages(latestRun?.id ?? null, loadFindings);
  const mappedScan = runQuery.data ? mapScan(runQuery.data.data) : null;

  return (
    <>
      <Callout tone="success" className="state-callout">
        <strong>Identitas workflow terverifikasi</strong>
        <span>
          Ini menyatakan identitas workflow cocok. Isi laporan berasal dari workflow repositori dan
          tidak diverifikasi secara independen.
        </span>
      </Callout>
      <div className="repository-detail-grid verified-detail-grid">
        <Panel>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">AKTIVITAS PEMERIKSAAN</p>
              <h2>Scan terbaru</h2>
            </div>
            {mappedScan && <StatusPill status={mappedScan.status} />}
          </div>
          {runs.loading ? (
            <ApiLoading title="Memuat riwayat scan" />
          ) : runs.error ? (
            <ApiErrorState error={runs.error} onRetry={runs.retry} />
          ) : mappedScan ? (
            <Link className="featured-scan-card" to={`/scans/${mappedScan.id}`}>
              <div className="featured-scan-icon">
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div>
                <strong>{mappedScan.runNumber}</strong>
                <span>
                  <GitCommitHorizontal size={13} aria-hidden="true" />{' '}
                  {mappedScan.commit.slice(0, 7)} · {mappedScan.startedAt}
                </span>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <ApiEmptyState
              title="Belum ada laporan scan"
              description="Run dan temuan akan muncul setelah workflow mengirim laporan."
            />
          )}
          {runs.nextCursor && (
            <div className="pagination-actions">
              <Button
                type="button"
                onClick={() => void runs.loadMore()}
                disabled={runs.loadingMore}
              >
                {runs.loadingMore ? 'Memuat…' : 'Muat run sebelumnya'}
              </Button>
            </div>
          )}
          <div className="repo-detail-links">
            {mappedScan && (
              <Link className="text-link" to={`/scans/${mappedScan.id}`}>
                Buka detail scan
              </Link>
            )}
            {findings.data.length > 0 && (
              <Link className="text-link" to="/findings">
                Buka inbox temuan ({findings.data.length}
                {findings.nextCursor ? '+' : ''})
              </Link>
            )}
          </div>
          {findings.error && <ApiErrorState error={findings.error} onRetry={findings.retry} />}
        </Panel>
        <Panel>
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">IDENTITAS</p>
              <h2>Workflow terpasang</h2>
            </div>
            <ShieldCheck size={18} className="success-icon" aria-hidden="true" />
          </div>
          <dl className="detail-list">
            <div>
              <dt>Branch utama</dt>
              <dd>
                <GitBranch size={14} aria-hidden="true" /> {repository.defaultBranch}
              </dd>
            </div>
            <div>
              <dt>Commit terakhir</dt>
              <dd>
                <code>{mappedScan?.commit ?? 'Belum tersedia'}</code>
              </dd>
            </div>
            <div>
              <dt>Waktu laporan</dt>
              <dd>{mappedScan?.startedAt ?? 'Belum ada laporan'}</dd>
            </div>
          </dl>
          {runQuery.loading && <ApiLoading title="Memuat cakupan engine" />}
          {runQuery.error && <ApiErrorState error={runQuery.error} onRetry={runQuery.retry} />}
          {mappedScan && runQuery.data && (
            <div className="scan-engine-list repository-engine-list">
              {mappedScan.engines.length ? (
                mappedScan.engines.map((engine) => (
                  <div className="engine-row" key={engine.id}>
                    <div className={`engine-mark engine-${engine.status}`} aria-hidden="true">
                      <span />
                    </div>
                    <div className="engine-copy">
                      <strong>{engine.label}</strong>
                      <span>{engine.detail}</span>
                    </div>
                    <StatusPill status={engine.status} />
                  </div>
                ))
              ) : (
                <p className="muted-copy">Cakupan engine belum dilaporkan.</p>
              )}
            </div>
          )}
          <Callout tone="info" className="compact-callout">
            <span>Provenance CI membuktikan identitas job, bukan kebenaran hasil scan.</span>
          </Callout>
        </Panel>
      </div>
    </>
  );
}

function PreviewRepositoryDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const previewState = usePreviewState();
  const repository = getRepositoryFromRoute(id, location.state as NewRepositoryLocationState);

  if (!repository) {
    return (
      <div className="page-stack">
        <PageHeader
          title="Repositori tidak ditemukan"
          description="Data contoh untuk repositori ini tidak tersedia."
        />
        <Link className="btn btn-secondary back-link" to="/repositories">
          <ArrowLeft size={15} aria-hidden="true" /> Kembali ke repositori
        </Link>
      </div>
    );
  }

  const showPending = repository.status === 'pending' || previewState === 'pending';
  const currentRepo =
    showPending && repository.status === 'verified'
      ? { ...repository, status: 'pending' as const }
      : repository;

  return (
    <div className="page-stack">
      <Link className="back-link text-link" to="/repositories">
        <ArrowLeft size={15} aria-hidden="true" /> Kembali ke repositori
      </Link>
      <PageHeader
        eyebrow="REPOSITORI"
        title={`${currentRepo.owner}/${currentRepo.name}`}
        description={`${currentRepo.primaryStack} · Branch ${currentRepo.defaultBranch}`}
        actions={<StatusPill status={currentRepo.status} />}
      />
      <PreviewStateGate
        emptyTitle="Belum ada aktivitas"
        emptyDescription="Hubungkan workflow milik repositori untuk menerima laporan scan."
      >
        {currentRepo.status === 'pending' ? (
          <PendingRepository repository={currentRepo} />
        ) : (
          <VerifiedRepository repository={currentRepo} />
        )}
      </PreviewStateGate>
      <div className="muted-small repository-detail-caption">
        <CircleHelp size={14} aria-hidden="true" />
        Seluruh informasi di halaman ini merupakan data contoh dan tidak berhubung ke akun GitHub.
      </div>
    </div>
  );
}

function LiveRepositoryDetailPage() {
  const { id } = useParams();
  const workspace = useWorkspace();
  const [pairing, setPairing] = useState<PairingResponse | null>(() =>
    id ? readPairing(id) : null,
  );
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const organizationId = workspace?.activeOrganization?.id;
  const query = useApiQuery(
    id && organizationId ? `${organizationId}:${id}` : null,
    id ? `/v1/repositories/${encodeURIComponent(id)}` : '',
    dataResponseSchema(repositorySchema),
  );

  useEffect(() => {
    setPairing(id ? readPairing(id) : null);
    setPairingError('');
    setCopyState('idle');
  }, [id]);

  useEffect(() => {
    if (id && query.data?.data.status === 'verified') {
      clearPairing(id);
      setPairing(null);
    }
  }, [id, query.data?.data.status]);

  if (query.loading)
    return (
      <div className="page-stack">
        <ApiLoading title="Memuat detail repositori" />
      </div>
    );
  if (query.error)
    return (
      <div className="page-stack">
        <ApiErrorState error={query.error} onRetry={query.retry} />
      </div>
    );
  if (!query.data) {
    return (
      <div className="page-stack">
        <PageHeader
          title="Repositori tidak ditemukan"
          description="Repositori tidak tersedia pada organisasi aktif atau akun ini tidak memiliki akses."
        />
        <Link className="btn btn-secondary back-link" to="/repositories">
          <ArrowLeft size={15} aria-hidden="true" /> Kembali ke repositori
        </Link>
      </div>
    );
  }

  const repository = mapRepository(query.data.data);
  const isPending = query.data.data.status === 'pending_pairing';
  const canManage = workspace?.activeOrganization?.role !== 'viewer';
  const issuePairing = async () => {
    if (!id) return;
    setPairingBusy(true);
    setPairingError('');
    try {
      const result = await apiPost(
        `/v1/repositories/${encodeURIComponent(id)}/pairing`,
        dataResponseSchema(pairingResponseSchema),
        {},
      );
      keepPairing(result.data);
      setPairing(result.data);
      setCopyState('idle');
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : 'Nonce pairing belum dapat dibuat.');
    } finally {
      setPairingBusy(false);
    }
  };
  const copyNonce = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.nonce);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  const githubRepositoryUrl = `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const actionsUrl = `${githubRepositoryUrl}/actions`;

  return (
    <div className="page-stack">
      <Link className="back-link text-link" to="/repositories">
        <ArrowLeft size={15} aria-hidden="true" /> Kembali ke repositori
      </Link>
      <PageHeader
        eyebrow="REPOSITORI LIVE"
        title={`${repository.owner}/${repository.name}`}
        description={`Branch yang dinyatakan saat pendaftaran: ${repository.defaultBranch}. Nilainya belum diverifikasi terhadap GitHub.`}
        actions={<StatusPill status={repository.status} />}
      />
      {isPending ? (
        <>
          <Callout tone="warning" className="state-callout">
            <strong>Workflow belum terhubung</strong>
            <span>
              Repositori menunggu bukti identitas dari GitHub Actions. Nama repo dan branch yang
              dimasukkan belum membuktikan kontrol.
            </span>
          </Callout>
          <div className="repository-detail-grid">
            <Panel className="setup-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">PENYIAPAN PEMILIK</p>
                  <h2>Pasang workflow di GitHub</h2>
                  <p className="panel-subtitle">
                    Sentinel tidak memasang workflow secara otomatis.
                  </p>
                </div>
                <span className="step-count">0 dari 3</span>
              </div>
              <div className="setup-steps">
                <SetupStep
                  number="1"
                  title="Pastikan repositori benar"
                  description={`Konfirmasi ${repository.owner}/${repository.name} adalah repositori yang kamu kelola.`}
                  status="active"
                />
                <SetupStep
                  number="2"
                  title="Pasang template workflow"
                  description="Salin set file workflow Sentinel ke branch default repositori. Lihat templates/github-workflows/README.md untuk daftar lengkap tujuh file dan langkah pemasangan."
                >
                  <div className="workflow-placeholder workflow-live-card">
                    <div className="workflow-placeholder-heading">
                      <TerminalSquare size={16} aria-hidden="true" />
                      <strong>
                        {pairing?.workflowFile ?? '.github/workflows/sentinel-scan.yml'}
                      </strong>
                    </div>
                    <p>
                      Commit workflow dan runtime scanner ke branch default, lalu buka GitHub
                      Actions.
                    </p>
                    <div className="workflow-actions">
                      <a
                        className="btn btn-secondary btn-small"
                        href={`${githubRepositoryUrl}/new/${encodeURIComponent(repository.defaultBranch)}?filename=${encodeURIComponent('.github/workflows/sentinel-scan.yml')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" /> Buka repositori GitHub
                      </a>
                      <a
                        className="text-link"
                        href="https://github.com/abbyhilman/sentinel-security-scanner/blob/master/templates/github-workflows/README.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Panduan template <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </SetupStep>
                <SetupStep
                  number="3"
                  title="Tambahkan variable dan secret"
                  description="Atur nilai berikut di Settings → Secrets and variables → Actions pada repositori GitHub."
                >
                  {pairing ? (
                    <div className="pairing-secret-card">
                      <div className="pairing-secret-meta">
                        <strong>Nonce pairing sementara</strong>
                        <span>
                          Berlaku sampai {formatDate(pairing.expiresAt)}. Nilai ini hanya tersedia
                          di memori tab ini; setelah meninggalkan atau memuat ulang halaman, buat
                          nonce baru.
                        </span>
                      </div>
                      <div className="pairing-secret-value">
                        <code>{pairing.nonce}</code>
                        <Button type="button" size="small" onClick={() => void copyNonce()}>
                          <Copy size={14} aria-hidden="true" />{' '}
                          {copyState === 'copied' ? 'Tersalin' : 'Salin nonce'}
                        </Button>
                      </div>
                      {copyState === 'failed' && (
                        <p className="form-error" role="status">
                          Clipboard tidak tersedia. Salin nonce dari kotak di atas.
                        </p>
                      )}
                      <dl className="pairing-settings-list">
                        <div>
                          <dt>Repository variable</dt>
                          <dd>
                            <code>SENTINEL_SUPABASE_URL</code>
                            <span>
                              {publicEnv.supabaseUrl ||
                                'URL project Supabase belum ada di konfigurasi web.'}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>Repository secret</dt>
                          <dd>
                            <code>SENTINEL_PAIRING_NONCE</code>
                            <span>Isi dengan nonce sementara di atas.</span>
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <div className="pairing-secret-card pairing-secret-empty">
                      <p>
                        Nonce belum diterbitkan pada tab ini. Buat nonce lalu salin ke GitHub
                        Actions secret sebelum menjalankan workflow pertama kali.
                      </p>
                    </div>
                  )}
                  {pairingError && (
                    <p className="form-error" role="alert">
                      {pairingError}
                    </p>
                  )}
                  <div className="pairing-actions">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void issuePairing()}
                      disabled={!canManage || pairingBusy}
                      title={
                        !canManage
                          ? 'Hanya owner atau maintainer dapat membuat nonce pairing.'
                          : undefined
                      }
                    >
                      <LockKeyhole size={15} aria-hidden="true" />{' '}
                      {pairingBusy
                        ? 'Membuat nonce…'
                        : pairing
                          ? 'Buat nonce baru'
                          : 'Buat nonce pairing'}
                    </Button>
                    <a
                      className="text-link"
                      href={`${githubRepositoryUrl}/settings/secrets/actions`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Buka pengaturan secrets <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </div>
                  <p className="muted-small">
                    Nonce baru menggantikan nonce sebelumnya. Jangan kirim atau commit nilainya ke
                    repository, log, maupun issue.
                  </p>
                </SetupStep>
                <SetupStep
                  number="4"
                  title="Jalankan workflow dan verifikasi"
                  description="Buka tab Actions, pilih Sentinel Security Scan, lalu jalankan pada branch default. Pairing baru dianggap selesai setelah server menerima klaim workflow yang cocok dan report pertama lolos validasi."
                />
              </div>
              <div className="setup-footer">
                <a className="text-link" href={actionsUrl} target="_blank" rel="noreferrer">
                  Buka GitHub Actions <ExternalLink size={13} aria-hidden="true" />
                </a>
                <span>Belum ada laporan scan.</span>
              </div>
            </Panel>
            <Panel className="repository-context-panel">
              <div className="panel-heading panel-heading-tight">
                <div>
                  <p className="eyebrow">DETAIL REPOSITORI</p>
                  <h2>Informasi sumber</h2>
                </div>
                <LockKeyhole size={18} aria-hidden="true" />
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Repositori</dt>
                  <dd>
                    <code>
                      {repository.owner}/{repository.name}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>Visibilitas</dt>
                  <dd>
                    {repository.visibility === 'unknown'
                      ? 'Belum dilaporkan'
                      : repository.visibility}
                  </dd>
                </div>
                <div>
                  <dt>Branch utama</dt>
                  <dd>
                    <GitBranch size={14} aria-hidden="true" /> {repository.defaultBranch} ·
                    dinyatakan pengguna
                  </dd>
                </div>
                <div>
                  <dt>Stack</dt>
                  <dd>Belum dilaporkan</dd>
                </div>
                <div>
                  <dt>Status identitas</dt>
                  <dd>
                    <StatusPill status="pending" />
                  </dd>
                </div>
              </dl>
              <Callout tone="info" className="compact-callout">
                <strong>Kontrol repositori</strong>
                <span>
                  Verifikasi memakai identitas workflow GitHub dan nonce pairing. GitHub OIDC
                  membuktikan identitas workflow, bukan kebenaran isi hasil scan.
                </span>
              </Callout>
            </Panel>
          </div>
        </>
      ) : query.data.data.status === 'disabled' ? (
        <Callout tone="warning" className="state-callout">
          <strong>Repositori dinonaktifkan</strong>
          <span>Data historis tidak ditampilkan sebagai scan aktif.</span>
        </Callout>
      ) : (
        <LiveVerifiedRepository repository={repository} />
      )}
      <p className="muted-small repository-detail-caption">
        <CircleHelp size={14} aria-hidden="true" /> Data pada halaman ini berasal dari API Sentinel
        untuk organisasi aktif.
      </p>
    </div>
  );
}

export function RepositoryDetailPage() {
  const auth = useAuth();
  return auth.configured ? <LiveRepositoryDetailPage /> : <PreviewRepositoryDetailPage />;
}
