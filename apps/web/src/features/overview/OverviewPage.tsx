import { AlertTriangle, ArrowRight, Boxes, Clock3, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { FindingSummary } from '../../components/FindingSummary';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Callout, MetricCard, PageHeader, Panel, StatusPill } from '../../components/ui';
import { getRepository, mockFindings, mockRepositories, mockScans } from '../../fixtures/mock/data';
import { usePreviewState } from '../../components/PreviewContext';
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { useApiQuery } from '../../lib/useApiQuery';
import { formatDate, mapFinding, mapScan } from '../../lib/mappers';
import {
  dataResponseSchema,
  findingApiSchema,
  organizationOverviewSchema,
  pagedResponseSchema,
  scanRunSchema,
} from '@sentinel/contracts';

function OverviewContent() {
  const previewState = usePreviewState();
  const latestScan = mockScans[0];
  const latestRepository = getRepository(latestScan.repositoryId);
  const completedEngines = latestScan.engines.filter(
    (engine) => engine.status === 'completed',
  ).length;
  const openFindings = mockFindings.filter((finding) => finding.triage === 'open');
  const verifiedRepositories = mockRepositories.filter(
    (repository) => repository.status === 'verified',
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="RUANG KERJA DEMO"
        title="Ringkasan"
        description="Pantau cakupan pemeriksaan dan temuan yang perlu ditinjau."
        actions={
          <Link className="btn btn-primary" to="/repositories">
            Lihat repositori <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />

      {previewState === 'pending' && (
        <Callout tone="warning" className="state-callout">
          <strong>Verifikasi repositori masih menunggu.</strong>
          <span>
            Nama repositori saja belum membuktikan kontrol. Selesaikan pemasangan workflow milik
            pemilik repositori.
          </span>
        </Callout>
      )}
      {previewState === 'complete-zero' && (
        <Callout tone="success" className="state-callout">
          <strong>Tidak ada temuan pada pemeriksaan yang berhasil dijalankan.</strong>
          <span>Hasil tanpa temuan bukan jaminan bahwa kode aman.</span>
        </Callout>
      )}
      {(previewState === 'partial' || previewState === 'failed') && (
        <Callout tone="warning" className="state-callout">
          <strong>
            {previewState === 'partial'
              ? 'Sebagian pemeriksaan gagal atau dilewati.'
              : 'Scan contoh gagal.'}
          </strong>
          <span>
            Periksa status tiap engine. Kondisi ini tidak dapat ditafsirkan sebagai hasil bersih.
          </span>
        </Callout>
      )}

      <div className="metric-grid">
        <Link className="metric-card-link" to="/repositories">
          <MetricCard
            label="Repositori"
            value={String(mockRepositories.length)}
            note={`${verifiedRepositories} terverifikasi · ${mockRepositories.length - verifiedRepositories} menunggu`}
            icon={Boxes}
            tone="navy"
          />
        </Link>
        <Link className="metric-card-link" to="/findings">
          <MetricCard
            label="Temuan terbuka"
            value={String(openFindings.length)}
            note="Berdasarkan data contoh tersanitasi"
            icon={AlertTriangle}
            tone="amber"
          />
        </Link>
        <Link className="metric-card-link" to={`/scans/${latestScan.id}`}>
          <MetricCard
            label="Cakupan scan terakhir"
            value={`${completedEngines}/${latestScan.engines.length}`}
            note="Engine selesai · 1 gagal · 1 dilewati"
            icon={ShieldCheck}
            tone="teal"
          />
        </Link>
      </div>

      <div className="overview-grid">
        <Panel className="coverage-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PEMERIKSAAN TERAKHIR</p>
              <h2>Cakupan engine</h2>
              <p className="panel-subtitle">
                {latestRepository?.owner}/{latestRepository?.name} · {latestScan.startedAt}
              </p>
            </div>
            <StatusPill status={latestScan.status} />
          </div>
          <Callout tone="warning" className="compact-callout">
            <strong>Sebagian pemeriksaan gagal atau dilewati.</strong>
            <span>Temuan yang tersedia tetap ditampilkan, tetapi cakupan belum lengkap.</span>
          </Callout>
          <div className="engine-list" aria-label="Status pemeriksaan per engine">
            {latestScan.engines.map((engine) => (
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
            ))}
          </div>
          <Link className="panel-footer-link" to={`/scans/${latestScan.id}`}>
            Buka detail scan <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </Panel>

        <Panel className="findings-panel">
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">PERLU DITINJAU</p>
              <h2>Temuan terbaru</h2>
            </div>
            <Link className="text-link" to="/findings">
              Lihat semua
            </Link>
          </div>
          <div className="finding-summary-list">
            {mockFindings.slice(0, 3).map((finding) => (
              <FindingSummary key={finding.id} finding={finding} />
            ))}
          </div>
          <div className="panel-note">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>
              Indikasi scanner perlu ditinjau; hasil tidak diverifikasi secara independen.
            </span>
          </div>
        </Panel>
      </div>

      <Panel className="recent-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RIWAYAT</p>
            <h2>Scan terbaru</h2>
          </div>
          <Link className="text-link" to="/reports">
            Lihat semua laporan
          </Link>
        </div>
        <div className="recent-scan-list">
          {mockScans.map((scan) => {
            const repository = getRepository(scan.repositoryId);
            return (
              <Link className="recent-scan-row" to={`/scans/${scan.id}`} key={scan.id}>
                <div className="recent-scan-icon">
                  <Clock3 size={16} aria-hidden="true" />
                </div>
                <div className="recent-scan-main">
                  <strong>
                    {repository?.owner}/{repository?.name}
                  </strong>
                  <span>
                    Commit <code>{scan.commit}</code> · {scan.startedAt}
                  </span>
                </div>
                <span className="run-number">{scan.runNumber}</span>
                <StatusPill status={scan.status} />
                <ArrowRight size={15} className="recent-row-arrow" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

export function OverviewPage() {
  const { configured } = useAuth();
  if (configured) return <LiveOverviewPage />;
  return (
    <div className="page-stack">
      <PreviewStateGate
        emptyTitle="Belum ada repositori"
        emptyDescription="Hubungkan repositori milikmu untuk menyiapkan workflow scan yang dijalankan oleh GitHub Actions milik repositori tersebut."
        emptyAction={
          <Link className="btn btn-primary" to="/repositories">
            Kelola repositori
          </Link>
        }
      >
        <OverviewContent />
      </PreviewStateGate>
    </div>
  );
}

function LiveOverviewPage() {
  const workspace = useWorkspace();
  const organization = workspace?.activeOrganization ?? null;
  const organizationId = organization?.id ?? null;
  const overviewPath = organizationId
    ? `/v1/organizations/${organizationId}/overview`
    : '/v1/organizations';
  const overviewQuery = useApiQuery(
    organizationId,
    overviewPath,
    dataResponseSchema(organizationOverviewSchema),
  );
  const overview = overviewQuery.data?.data;
  const latestRunId = overview?.recentRuns[0]?.id ?? null;
  const runQuery = useApiQuery(
    latestRunId,
    latestRunId ? `/v1/runs/${latestRunId}` : '/v1/runs',
    dataResponseSchema(scanRunSchema),
  );
  const findingsPath = organizationId
    ? `/v1/findings?organizationId=${encodeURIComponent(organizationId)}&limit=3`
    : '/v1/findings';
  const findingsQuery = useApiQuery(
    organizationId,
    findingsPath,
    pagedResponseSchema(findingApiSchema),
  );

  if (overviewQuery.loading || runQuery.loading || findingsQuery.loading) {
    return (
      <div className="page-stack">
        <ApiLoading title="Memuat ringkasan organisasi" />
      </div>
    );
  }
  const error = overviewQuery.error ?? runQuery.error ?? findingsQuery.error;
  if (error) {
    return (
      <div className="page-stack">
        <ApiErrorState
          error={error}
          onRetry={() => {
            overviewQuery.retry();
            runQuery.retry();
            findingsQuery.retry();
          }}
        />
      </div>
    );
  }
  if (!overview) return null;

  const latestRun = runQuery.data?.data ? mapScan(runQuery.data.data) : null;
  const latestOverviewRun = overview.recentRuns[0];
  const completedEngines =
    latestRun?.engines.filter((engine) => engine.status === 'completed').length ?? 0;
  const findings = findingsQuery.data?.data.map(mapFinding) ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={organization?.name ?? 'RUANG KERJA'}
        title="Ringkasan"
        description="Pantau cakupan laporan dan temuan yang perlu ditinjau."
        actions={
          <Link className="btn btn-primary" to="/repositories">
            Lihat repositori <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />
      <div className="metric-grid">
        <Link className="metric-card-link" to="/repositories">
          <MetricCard
            label="Repositori"
            value={String(overview.repositoryCount)}
            note={`${overview.verifiedRepositoryCount} terverifikasi · ${overview.pendingRepositoryCount} menunggu`}
            icon={Boxes}
            tone="navy"
          />
        </Link>
        <Link className="metric-card-link" to="/findings">
          <MetricCard
            label="Temuan terbuka"
            value={String(overview.openFindingCount)}
            note="Temuan yang belum ditutup lewat triage"
            icon={AlertTriangle}
            tone="amber"
          />
        </Link>
        <Link className="metric-card-link" to={latestRun ? `/scans/${latestRun.id}` : '/reports'}>
          <MetricCard
            label="Cakupan scan terakhir"
            value={
              latestRun?.engines.length ? `${completedEngines}/${latestRun.engines.length}` : '—'
            }
            note={latestRun ? `Status laporan: ${latestRun.status}` : 'Belum ada laporan'}
            icon={ShieldCheck}
            tone="teal"
          />
        </Link>
      </div>

      <div className="overview-grid">
        <Panel className="coverage-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LAPORAN TERAKHIR</p>
              <h2>Cakupan engine</h2>
              <p className="panel-subtitle">
                {latestOverviewRun?.repositoryFullName ?? 'Belum ada repositori'} ·{' '}
                {formatDate(latestOverviewRun?.completedAt ?? latestOverviewRun?.createdAt)}
              </p>
            </div>
            {latestRun && <StatusPill status={latestRun.status} />}
          </div>
          {latestRun ? (
            <>
              {(latestRun.status === 'partial' || latestRun.status === 'failed') && (
                <Callout
                  tone={latestRun.status === 'failed' ? 'danger' : 'warning'}
                  className="compact-callout"
                >
                  <strong>
                    {latestRun.status === 'failed'
                      ? 'Cakupan scan tidak lengkap.'
                      : 'Sebagian pemeriksaan gagal atau dilewati.'}
                  </strong>
                  <span>
                    Temuan dari engine yang berhasil tetap tersedia; status ini bukan hasil bersih.
                  </span>
                </Callout>
              )}
              {latestRun.engines.length > 0 ? (
                <div className="engine-list" aria-label="Status pemeriksaan per engine">
                  {latestRun.engines.map((engine) => (
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
                  ))}
                </div>
              ) : (
                <ApiEmptyState
                  title="Status engine belum tersedia"
                  description="Laporan ini belum menyertakan rincian status engine."
                />
              )}
              <Link className="panel-footer-link" to={`/scans/${latestRun.id}`}>
                Buka detail laporan <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <ApiEmptyState
              title="Belum ada laporan scan"
              description="Laporan muncul setelah workflow di repository mengirim hasil pemeriksaan."
            />
          )}
        </Panel>

        <Panel className="findings-panel">
          <div className="panel-heading panel-heading-tight">
            <div>
              <p className="eyebrow">PERLU DITINJAU</p>
              <h2>Temuan terbaru</h2>
            </div>
            <Link className="text-link" to="/findings">
              Lihat semua
            </Link>
          </div>
          <div className="finding-summary-list">
            {findings.map((finding) => (
              <FindingSummary
                key={finding.id}
                finding={finding}
                repositoryFullName={finding.repositoryFullName}
              />
            ))}
            {findings.length === 0 && (
              <ApiEmptyState
                title="Belum ada temuan"
                description="Belum ada temuan yang tercatat pada organisasi ini."
              />
            )}
          </div>
          <div className="panel-note">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Hasil scanner adalah indikasi dari workflow, bukan verifikasi independen.</span>
          </div>
        </Panel>
      </div>

      <Panel className="recent-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RIWAYAT</p>
            <h2>Scan terbaru</h2>
          </div>
          <Link className="text-link" to="/reports">
            Lihat semua laporan
          </Link>
        </div>
        {overview.recentRuns.length ? (
          <div className="recent-scan-list">
            {overview.recentRuns.map((run) => (
              <Link className="recent-scan-row" to={`/scans/${run.id}`} key={run.id}>
                <div className="recent-scan-icon">
                  <Clock3 size={16} aria-hidden="true" />
                </div>
                <div className="recent-scan-main">
                  <strong>{run.repositoryFullName}</strong>
                  <span>
                    Commit <code>{run.commitSha.slice(0, 12)}</code> ·{' '}
                    {formatDate(run.completedAt ?? run.createdAt)}
                  </span>
                </div>
                <span className="run-number">{run.githubRunId}</span>
                <StatusPill status={run.status} />
                <ArrowRight size={15} className="recent-row-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <ApiEmptyState
            title="Belum ada riwayat scan"
            description="Run akan muncul setelah laporan pertama diterima."
          />
        )}
      </Panel>
    </div>
  );
}
