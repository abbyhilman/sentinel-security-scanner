import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  ShieldAlert,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import {
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  SeverityPill,
  StatusPill,
} from '../../components/ui';
import { usePreviewState } from '../../components/PreviewContext';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { getRepository, mockFindings, mockScans } from '../../fixtures/mock/data';
import type { EngineStatus, ScanFixture } from '../../fixtures/mock/types';
import { useAuth } from '../../components/AuthContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { apiGet } from '../../lib/api';
import { useApiPages, useApiQuery } from '../../lib/useApiQuery';
import { formatDate, mapFinding, mapScan } from '../../lib/mappers';
import {
  dataResponseSchema,
  findingApiSchema,
  pagedResponseSchema,
  scanRunSchema,
} from '@sentinel/contracts';
import { useCallback } from 'react';

function makeFailedScan(scan: ScanFixture): ScanFixture {
  return {
    ...scan,
    status: 'failed',
    duration: '48 dtk',
    engines: scan.engines.map((engine) => ({
      ...engine,
      status: engine.status === 'skipped' ? 'skipped' : 'failed',
      findingCount: 0,
      detail:
        engine.status === 'skipped'
          ? engine.detail
          : 'Contoh kegagalan tool; hasil sebelumnya tidak boleh dianggap lengkap.',
    })),
  };
}

function engineLabel(status: EngineStatus) {
  return status === 'completed'
    ? 'Pemeriksaan selesai'
    : status === 'failed'
      ? 'Pemeriksaan gagal'
      : status === 'skipped'
        ? 'Pemeriksaan dilewati'
        : status === 'timed_out'
          ? 'Melewati batas waktu'
          : 'Status belum diketahui';
}

function PreviewScanDetailPage() {
  const { id } = useParams();
  const previewState = usePreviewState();
  const fallback = mockScans[0];
  const selectedScan =
    previewState === 'complete-zero'
      ? (mockScans.find((scan) => scan.id === 'scan-zero') ?? fallback)
      : previewState === 'failed'
        ? makeFailedScan(mockScans.find((scan) => scan.id === 'scan-failed') ?? fallback)
        : previewState === 'partial'
          ? (mockScans.find((scan) => scan.id === 'scan-partial') ?? fallback)
          : (mockScans.find((scan) => scan.id === id) ?? fallback);
  const repository = getRepository(selectedScan.repositoryId);
  const findings = mockFindings.filter((finding) => finding.scanId === selectedScan.id);
  const isZeroFinding = previewState === 'complete-zero';
  const isFailed = selectedScan.status === 'failed';

  return (
    <div className="page-stack">
      <Link
        className="back-link text-link"
        to={repository ? `/repositories/${repository.id}` : '/repositories'}
      >
        <ArrowLeft size={15} aria-hidden="true" /> Kembali ke repositori
      </Link>
      <PageHeader
        eyebrow="DETAIL PEMERIKSAAN"
        title={`Scan ${selectedScan.runNumber}`}
        description={`${repository?.owner}/${repository?.name} · dimulai ${selectedScan.startedAt}`}
        actions={<StatusPill status={selectedScan.status} />}
      />
      <PreviewStateGate
        emptyTitle="Laporan scan belum tersedia"
        emptyDescription="Workflow belum mengirim laporan untuk repositori ini. Status menunggu laporan tidak berarti scan berhasil."
        emptyAction={
          <Link className="btn btn-secondary" to={`/repositories/${repository?.id ?? ''}`}>
            Lihat status repositori
          </Link>
        }
      >
        {isFailed && (
          <Callout tone="danger" className="state-callout">
            <strong>Scan gagal sebelum cakupan pemeriksaan lengkap.</strong>
            <span>
              Tidak ada kesimpulan yang dapat diambil dari pemeriksaan ini. Periksa kegagalan tiap
              tool.
            </span>
          </Callout>
        )}
        {selectedScan.status === 'partial' && (
          <Callout tone="warning" className="state-callout">
            <strong>Sebagian pemeriksaan gagal atau dilewati.</strong>
            <span>
              Temuan dari tool yang berhasil tetap tersedia. Status ini bukan hasil bersih.
            </span>
          </Callout>
        )}
        {isZeroFinding && (
          <Callout tone="success" className="state-callout">
            <strong>Tidak ada temuan pada pemeriksaan yang berhasil dijalankan.</strong>
            <span>
              Kesimpulan ini terbatas pada cakupan scan contoh dan bukan jaminan bahwa kode aman.
            </span>
          </Callout>
        )}

        <div className="scan-summary-grid">
          <Panel className="scan-meta-panel">
            <div className="panel-heading panel-heading-tight">
              <div>
                <p className="eyebrow">PROVENANCE LAPORAN</p>
                <h2>Informasi run</h2>
              </div>
              <GitCommitHorizontal size={19} aria-hidden="true" />
            </div>
            <dl className="scan-meta-grid">
              <div>
                <dt>Commit SHA</dt>
                <dd>
                  <code>{selectedScan.commit}</code>
                </dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>
                  <GitBranch size={14} aria-hidden="true" /> {selectedScan.branch}
                </dd>
              </div>
              <div>
                <dt>Run / attempt</dt>
                <dd>
                  {selectedScan.runNumber} · {selectedScan.attempt}
                </dd>
              </div>
              <div>
                <dt>Durasi contoh</dt>
                <dd>
                  <Clock3 size={14} aria-hidden="true" /> {selectedScan.duration}
                </dd>
              </div>
            </dl>
            <Callout tone="info" className="compact-callout">
              Identitas workflow mengikat laporan ke job GitHub, tetapi tidak membuktikan bahwa
              temuan benar atau lengkap.
            </Callout>
          </Panel>

          <Panel className="scan-coverage-panel">
            <div className="panel-heading panel-heading-tight">
              <div>
                <p className="eyebrow">CAKUPAN</p>
                <h2>Status per engine</h2>
              </div>
              <span className="scan-engine-count">
                {selectedScan.engines.filter((engine) => engine.status === 'completed').length}/
                {selectedScan.engines.length} selesai
              </span>
            </div>
            <div className="scan-engine-list">
              {selectedScan.engines.map((engine) => (
                <div className="scan-engine-card" key={engine.id}>
                  <div className={`engine-mark engine-${engine.status}`} aria-hidden="true">
                    <span />
                  </div>
                  <div className="scan-engine-main">
                    <div className="scan-engine-title">
                      <strong>{engine.label}</strong>
                      <StatusPill status={engine.status} />
                    </div>
                    <p>
                      {engineLabel(engine.status)} · {engine.detail}
                    </p>
                    <span className="engine-version">
                      {engine.version}
                      {engine.id === 'semgrep' ? ' · ruleset contoh' : ''}
                    </span>
                  </div>
                  <span
                    className="engine-finding-count"
                    aria-label={`${engine.findingCount} temuan contoh`}
                  >
                    {engine.findingCount}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel className="scan-findings-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HASIL YANG TERSEDIA</p>
              <h2>Temuan dalam laporan</h2>
              <p className="panel-subtitle">
                {findings.length} temuan contoh · bukti yang ditampilkan sudah disanitasi
              </p>
            </div>
            {findings.length > 0 && (
              <Link className="text-link" to="/findings">
                Buka inbox temuan <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
          {findings.length > 0 ? (
            <div className="scan-finding-list">
              {findings.map((finding) => {
                const repo = getRepository(finding.repositoryId);
                return (
                  <Link
                    className="scan-finding-row"
                    to={`/findings/${finding.id}`}
                    key={finding.id}
                  >
                    <SeverityPill severity={finding.severity} />
                    <div className="scan-finding-copy">
                      <strong>{finding.title}</strong>
                      <span>
                        {finding.detector} ·{' '}
                        <code>
                          {finding.path}:{finding.line || '—'}
                        </code>
                      </span>
                    </div>
                    <span className="scan-finding-repo">{repo?.name}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={
                isFailed
                  ? 'Belum ada hasil yang dapat ditampilkan'
                  : 'Tidak ada temuan dalam cakupan yang berhasil'
              }
              description={
                isFailed
                  ? 'Semua engine yang berlaku gagal. Perbaiki error workflow lalu jalankan pemeriksaan baru.'
                  : 'Temuan yang cocok tidak dikembalikan oleh pemeriksaan contoh yang berhasil. Ini bukan jaminan bahwa kode aman.'
              }
              icon={isFailed ? ShieldAlert : Clock3}
            />
          )}
        </Panel>

        <div className="scan-actions-row">
          <div className="muted-small">
            <ExternalLink size={14} aria-hidden="true" /> Tautan GitHub Actions tidak tersedia pada
            data demo.
          </div>
          <Button disabled title="Tidak ada URL Actions pada data contoh">
            <ExternalLink size={15} aria-hidden="true" /> Buka GitHub Actions
          </Button>
        </div>
      </PreviewStateGate>
    </div>
  );
}

function LiveScanDetailPage() {
  const { id } = useParams();
  const query = useApiQuery(
    id ?? null,
    id ? `/v1/runs/${encodeURIComponent(id)}` : '',
    dataResponseSchema(scanRunSchema),
  );
  const run = query.data?.data;
  const findingsPath = run ? `/v1/runs/${encodeURIComponent(run.id)}/findings?limit=100` : '';
  const loadFindings = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${findingsPath}&cursor=${encodeURIComponent(cursor)}` : findingsPath,
        pagedResponseSchema(findingApiSchema),
      ),
    [findingsPath],
  );
  const findings = useApiPages(run?.id ?? null, loadFindings);

  if (query.loading)
    return (
      <div className="page-stack">
        <ApiLoading title="Memuat laporan scan" />
      </div>
    );
  if (query.error)
    return (
      <div className="page-stack">
        <ApiErrorState error={query.error} onRetry={query.retry} />
      </div>
    );
  if (!run)
    return (
      <div className="page-stack">
        <ApiEmptyState
          title="Laporan tidak ditemukan"
          description="Laporan tidak tersedia pada organisasi aktif atau akun ini tidak memiliki akses."
        />
        <Link className="text-link" to="/reports">
          Kembali ke laporan
        </Link>
      </div>
    );

  const scan = mapScan(run);
  const fullName = run.repositoryFullName ?? 'Repositori tidak dilaporkan';
  const [owner, ...repoParts] = fullName.split('/');
  const repositoryName = repoParts.join('/');
  const githubRunId = /^\d+$/u.test(run.githubRunId) ? run.githubRunId : null;
  const actionsUrl =
    owner && repositoryName && githubRunId
      ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/actions/runs/${githubRunId}`
      : null;
  const engineCount = scan.engines.length;
  const completedEngines = scan.engines.filter((engine) => engine.status === 'completed').length;
  const mappedFindings = findings.data.map(mapFinding);

  return (
    <div className="page-stack">
      <Link
        className="back-link text-link"
        to={run.repositoryId ? `/repositories/${run.repositoryId}` : '/repositories'}
      >
        <ArrowLeft size={15} aria-hidden="true" /> Kembali ke repositori
      </Link>
      <PageHeader
        eyebrow="DETAIL PEMERIKSAAN · DATA LIVE"
        title={`Scan ${run.githubRunId}`}
        description={`${fullName} · dimulai ${formatDate(run.startedAt ?? run.createdAt)}`}
        actions={<StatusPill status={run.status} />}
      />
      {(run.status === 'partial' || run.status === 'failed' || run.status === 'rejected') && (
        <Callout tone={run.status === 'partial' ? 'warning' : 'danger'} className="state-callout">
          <strong>
            {run.status === 'partial'
              ? 'Sebagian pemeriksaan gagal atau dilewati.'
              : 'Laporan tidak lengkap atau ditolak.'}
          </strong>
          <span>
            Hasil yang tersedia tetap dapat ditinjau. Status ini tidak berarti repository aman.
          </span>
        </Callout>
      )}
      {run.status === 'completed' &&
        completedEngines === engineCount &&
        engineCount > 0 &&
        mappedFindings.length === 0 &&
        !findings.loading &&
        !findings.error && (
          <Callout tone="info" className="state-callout">
            <strong>Tidak ada temuan yang dikembalikan.</strong>
            <span>
              Kesimpulan ini terbatas pada engine yang berhasil dijalankan dan bukan jaminan bahwa
              kode aman.
            </span>
          </Callout>
        )}

      <div className="scan-summary-grid">
        <Panel className="scan-meta-panel">
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">PROVENANCE LAPORAN</p>
              <h2>Informasi run</h2>
            </div>
            <GitCommitHorizontal size={19} aria-hidden="true" />
          </div>
          <dl className="scan-meta-grid">
            <div>
              <dt>Commit SHA</dt>
              <dd>
                <code>{run.commitSha}</code>
              </dd>
            </div>
            <div>
              <dt>Branch / ref</dt>
              <dd>
                <GitBranch size={14} aria-hidden="true" />{' '}
                {run.ref.replace(/^refs\/(heads|tags)\//u, '')}
              </dd>
            </div>
            <div>
              <dt>Run / attempt</dt>
              <dd>
                {run.githubRunId} · {run.runAttempt}
              </dd>
            </div>
            <div>
              <dt>Mulai</dt>
              <dd>
                <Clock3 size={14} aria-hidden="true" /> {formatDate(run.startedAt ?? run.createdAt)}
              </dd>
            </div>
            <div>
              <dt>Selesai</dt>
              <dd>{formatDate(run.completedAt)}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>{run.eventName}</dd>
            </div>
            <div>
              <dt>Workflow ref</dt>
              <dd>
                <code>{run.workflowRef ?? 'Belum dilaporkan'}</code>
              </dd>
            </div>
          </dl>
          <Callout tone="info" className="compact-callout">
            Identitas workflow mengikat laporan ke job GitHub, tetapi tidak membuktikan bahwa temuan
            benar atau lengkap.
          </Callout>
        </Panel>
        <Panel className="scan-coverage-panel">
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">CAKUPAN</p>
              <h2>Status per engine</h2>
            </div>
            <span className="scan-engine-count">
              {completedEngines}/{engineCount} selesai
            </span>
          </div>
          {engineCount ? (
            <div className="scan-engine-list">
              {scan.engines.map((engine) => (
                <div className="scan-engine-card" key={engine.id}>
                  <div className={`engine-mark engine-${engine.status}`} aria-hidden="true">
                    <span />
                  </div>
                  <div className="scan-engine-main">
                    <div className="scan-engine-title">
                      <strong>{engine.label}</strong>
                      <StatusPill status={engine.status} />
                    </div>
                    <p>{engine.detail}</p>
                    <span className="engine-version">{engine.version}</span>
                  </div>
                  <span
                    className="engine-finding-count"
                    aria-label={`${engine.findingCount} temuan`}
                  >
                    {engine.findingCount}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <ApiEmptyState
              title="Cakupan engine belum tersedia"
              description="Run ini belum melaporkan status engine."
            />
          )}
        </Panel>
      </div>

      <Panel className="scan-findings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">HASIL YANG TERSEDIA</p>
            <h2>Temuan dalam laporan</h2>
            <p className="panel-subtitle">Bukti yang dikembalikan API sudah disanitasi.</p>
          </div>
          {mappedFindings.length > 0 && (
            <Link className="text-link" to="/findings">
              Buka inbox temuan <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
        {findings.loading ? (
          <ApiLoading title="Memuat temuan laporan" />
        ) : findings.error ? (
          <ApiErrorState error={findings.error} onRetry={findings.retry} />
        ) : mappedFindings.length ? (
          <div className="scan-finding-list">
            {mappedFindings.map((finding) => (
              <Link className="scan-finding-row" to={`/findings/${finding.id}`} key={finding.id}>
                <SeverityPill severity={finding.severity} />
                <div className="scan-finding-copy">
                  <strong>{finding.title}</strong>
                  <span>
                    {finding.detector} ·{' '}
                    <code>
                      {finding.path}
                      {finding.line ? `:${finding.line}` : ''}
                    </code>
                  </span>
                </div>
                <span className="scan-finding-repo">{fullName.split('/').at(-1)}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              run.status === 'failed'
                ? 'Belum ada hasil yang dapat ditampilkan'
                : 'Tidak ada temuan pada hasil yang tersedia'
            }
            description={
              run.status === 'failed'
                ? 'Semua engine yang berlaku mungkin gagal. Periksa cakupan sebelum menyimpulkan.'
                : 'Tidak ada temuan yang dikembalikan untuk laporan ini. Hasil kosong bukan jaminan keamanan.'
            }
            icon={ShieldAlert}
          />
        )}
        {findings.nextCursor && (
          <div className="pagination-actions">
            <Button
              type="button"
              onClick={() => void findings.loadMore()}
              disabled={findings.loadingMore}
            >
              {findings.loadingMore ? 'Memuat…' : 'Muat temuan lainnya'}
            </Button>
          </div>
        )}
      </Panel>
      <div className="scan-actions-row">
        {actionsUrl ? (
          <a className="btn btn-secondary" href={actionsUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> Buka GitHub Actions
          </a>
        ) : (
          <span className="muted-small">
            <ExternalLink size={14} aria-hidden="true" /> Tautan Actions belum tersedia pada laporan
            ini.
          </span>
        )}
      </div>
    </div>
  );
}

export function ScanDetailPage() {
  const auth = useAuth();
  return auth.configured ? <LiveScanDetailPage /> : <PreviewScanDetailPage />;
}
