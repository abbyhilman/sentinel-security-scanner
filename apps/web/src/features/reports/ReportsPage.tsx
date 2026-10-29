import { ArrowDownToLine, ArrowRight, FileBarChart2, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Button, Callout, PageHeader, Panel, StatusPill } from '../../components/ui';
import { getRepository, mockFindings, mockScans } from '../../fixtures/mock/data';
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { apiGet } from '../../lib/api';
import { mapScan } from '../../lib/mappers';
import { useApiPages } from '../../lib/useApiQuery';
import { pagedResponseSchema, scanRunSchema } from '@sentinel/contracts';
import { useCallback } from 'react';

function PreviewReportsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="RIWAYAT PEMERIKSAAN"
        title="Laporan"
        description="Ringkasan tersanitasi dengan asal laporan, cakupan, dan waktu pemeriksaan."
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            disabled
            title="Ekspor belum tersedia di pratinjau"
          >
            <ArrowDownToLine size={16} aria-hidden="true" /> Ekspor
          </button>
        }
      />
      <PreviewStateGate
        emptyTitle="Belum ada laporan"
        emptyDescription="Laporan akan muncul setelah workflow milik repositori mengirim hasil pemeriksaan."
      >
        <Callout tone="info" className="state-callout">
          <strong>Ekspor belum tersedia di pratinjau.</strong>
          <span>
            Laporan yang nantinya tersedia harus menyertakan provenance, status coverage, dan data
            yang sudah disanitasi.
          </span>
        </Callout>
        <Panel className="reports-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LAPORAN TERSEDIA</p>
              <h2>Riwayat scan</h2>
              <p className="panel-subtitle">
                Tanggal dan hasil berikut merupakan data contoh sintetis.
              </p>
            </div>
            <span className="report-as-of">As of · 28 Okt 2026</span>
          </div>
          <div className="reports-table-wrap">
            <table className="data-table reports-table">
              <caption className="sr-only">Riwayat laporan scan sintetis</caption>
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Repositori</th>
                  <th scope="col">Commit</th>
                  <th scope="col">Cakupan engine</th>
                  <th scope="col">Temuan</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Buka laporan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockScans.map((scan) => {
                  const repository = getRepository(scan.repositoryId);
                  const completed = scan.engines.filter(
                    (engine) => engine.status === 'completed',
                  ).length;
                  const findingCount = mockFindings.filter(
                    (finding) => finding.scanId === scan.id,
                  ).length;
                  return (
                    <tr key={scan.id}>
                      <td>
                        <Link className="report-run-link" to={`/scans/${scan.id}`}>
                          <FileBarChart2 size={15} aria-hidden="true" /> {scan.runNumber}
                        </Link>
                      </td>
                      <td>
                        {repository?.owner}/{repository?.name}
                      </td>
                      <td>
                        <code>{scan.commit}</code>
                      </td>
                      <td>
                        {completed}/{scan.engines.length}
                      </td>
                      <td>{findingCount}</td>
                      <td>
                        <StatusPill status={scan.status} />
                      </td>
                      <td>
                        <Link
                          className="row-action"
                          to={`/scans/${scan.id}`}
                          aria-label={`Buka laporan ${scan.runNumber}`}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="report-table-footer">
            <span>
              <ShieldAlert size={14} aria-hidden="true" /> Nol temuan tidak berarti kode aman.
            </span>
            <span>{mockScans.length} laporan contoh</span>
          </div>
        </Panel>
        <div className="reports-mobile-list">
          {mockScans.map((scan) => {
            const repository = getRepository(scan.repositoryId);
            const completed = scan.engines.filter((engine) => engine.status === 'completed').length;
            const findingCount = mockFindings.filter(
              (finding) => finding.scanId === scan.id,
            ).length;
            return (
              <Link className="report-mobile-card" key={scan.id} to={`/scans/${scan.id}`}>
                <div className="report-mobile-heading">
                  <div>
                    <strong>{scan.runNumber}</strong>
                    <span>
                      {repository?.owner}/{repository?.name}
                    </span>
                  </div>
                  <StatusPill status={scan.status} />
                </div>
                <div className="report-mobile-meta">
                  <span>
                    {completed}/{scan.engines.length} engine
                  </span>
                  <span>{findingCount} temuan contoh</span>
                </div>
                <div className="report-mobile-footer">
                  <code>{scan.commit}</code>
                  <span>
                    Buka laporan <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </PreviewStateGate>
    </div>
  );
}

function LiveReportsPage() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const organizationId = workspace?.activeOrganization?.id;
  const listPath = organizationId
    ? `/v1/organizations/${encodeURIComponent(organizationId)}/runs?limit=100`
    : '';
  const loadPage = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${listPath}&cursor=${encodeURIComponent(cursor)}` : listPath,
        pagedResponseSchema(scanRunSchema),
      ),
    [listPath],
  );
  const reports = useApiPages(auth.configured ? listPath : null, loadPage);
  const scans = reports.data.map(mapScan);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="RIWAYAT PEMERIKSAAN · LIVE"
        title="Laporan"
        description="Riwayat run dari workflow, dengan status dan provenance yang tersedia."
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            disabled
            title="Ekspor tersanitasi belum tersedia pada tahap ini"
          >
            <ArrowDownToLine size={16} aria-hidden="true" /> Ekspor belum tersedia
          </button>
        }
      />
      <Callout tone="info" className="state-callout">
        <strong>Ekspor belum tersedia.</strong>
        <span>
          Riwayat di bawah menampilkan data run yang disimpan. Cakupan engine dan jumlah temuan
          tersedia di detail laporan.
        </span>
      </Callout>
      {reports.loading && <ApiLoading title="Memuat riwayat laporan" />}
      {reports.error && <ApiErrorState error={reports.error} onRetry={reports.retry} />}
      {!reports.loading && !reports.error && !scans.length && (
        <ApiEmptyState
          title="Belum ada laporan"
          description="Laporan akan muncul setelah workflow milik repositori mengirim hasil pemeriksaan."
        />
      )}
      {!reports.loading && !reports.error && scans.length > 0 && (
        <>
          <Panel className="reports-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">LAPORAN TERSEDIA</p>
                <h2>Riwayat scan</h2>
                <p className="panel-subtitle">
                  Status laporan berasal dari record tersimpan. Run parsial atau gagal bukan hasil
                  bersih.
                </p>
              </div>
              <span className="report-as-of">
                {scans.length}
                {reports.nextCursor ? '+' : ''} laporan dimuat
              </span>
            </div>
            <div className="reports-table-wrap">
              <table className="data-table reports-table">
                <caption className="sr-only">Riwayat laporan scan live</caption>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col">Repositori</th>
                    <th scope="col">Commit</th>
                    <th scope="col">Mulai</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Buka laporan</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id}>
                      <td>
                        <Link className="report-run-link" to={`/scans/${scan.id}`}>
                          <FileBarChart2 size={15} aria-hidden="true" /> {scan.runNumber} · #
                          {scan.attempt}
                        </Link>
                      </td>
                      <td>{scan.repositoryFullName ?? 'Tidak dilaporkan'}</td>
                      <td>
                        <code>{scan.commit.slice(0, 12)}</code>
                      </td>
                      <td>{scan.startedAt}</td>
                      <td>
                        <StatusPill status={scan.status} />
                      </td>
                      <td>
                        <Link
                          className="row-action"
                          to={`/scans/${scan.id}`}
                          aria-label={`Buka laporan ${scan.runNumber}`}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-table-footer">
              <span>
                <ShieldAlert size={14} aria-hidden="true" /> Nol temuan tidak berarti kode aman.
              </span>
              <span>
                {scans.length}
                {reports.nextCursor ? '+' : ''} run
              </span>
            </div>
          </Panel>
          <div className="reports-mobile-list">
            {scans.map((scan) => (
              <Link className="report-mobile-card" key={scan.id} to={`/scans/${scan.id}`}>
                <div className="report-mobile-heading">
                  <div>
                    <strong>
                      {scan.runNumber} · #{scan.attempt}
                    </strong>
                    <span>{scan.repositoryFullName ?? 'Tidak dilaporkan'}</span>
                  </div>
                  <StatusPill status={scan.status} />
                </div>
                <div className="report-mobile-footer">
                  <code>{scan.commit.slice(0, 12)}</code>
                  <span>{scan.startedAt}</span>
                  <span>
                    Buka laporan <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {reports.nextCursor && (
            <div className="pagination-actions">
              <Button
                type="button"
                onClick={() => void reports.loadMore()}
                disabled={reports.loadingMore}
              >
                {reports.loadingMore ? 'Memuat…' : 'Muat laporan lainnya'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ReportsPage() {
  const auth = useAuth();
  return auth.configured ? <LiveReportsPage /> : <PreviewReportsPage />;
}
