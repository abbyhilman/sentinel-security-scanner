import { AlertTriangle, ArrowRight, Boxes, Clock3, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { FindingSummary } from '../../components/FindingSummary';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Callout, MetricCard, PageHeader, Panel, StatusPill } from '../../components/ui';
import { getRepository, mockFindings, mockRepositories, mockScans } from '../../fixtures/mock/data';
import { usePreviewState } from '../../components/PreviewContext';

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
