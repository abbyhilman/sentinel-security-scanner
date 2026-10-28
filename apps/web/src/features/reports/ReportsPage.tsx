import { ArrowDownToLine, ArrowRight, FileBarChart2, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Callout, PageHeader, Panel, StatusPill } from '../../components/ui';
import { getRepository, mockFindings, mockScans } from '../../fixtures/mock/data';

export function ReportsPage() {
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
