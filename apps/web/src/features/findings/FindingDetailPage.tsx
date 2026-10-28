import { useState } from 'react';
import {
  ArrowLeft,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileCode2,
  GitCommitHorizontal,
  History,
  ShieldAlert,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import {
  ConfidenceLabel,
  PageHeader,
  Panel,
  SeverityPill,
  StatusPill,
  Callout,
  Button,
} from '../../components/ui';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { getFinding, getRepository, getScan } from '../../fixtures/mock/data';

export function FindingDetailPage() {
  const { id } = useParams();
  const finding = id ? getFinding(id) : undefined;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const repository = finding ? getRepository(finding.repositoryId) : undefined;
  const scan = finding ? getScan(finding.scanId) : undefined;
  const pathWithLine = finding ? `${finding.path}${finding.line ? `:${finding.line}` : ''}` : '';

  if (!finding) {
    return (
      <div className="page-stack">
        <Link className="back-link text-link" to="/findings">
          <ArrowLeft size={15} aria-hidden="true" /> Kembali ke temuan
        </Link>
        <PageHeader
          title="Temuan tidak ditemukan"
          description="Data contoh untuk temuan ini tidak tersedia."
        />
      </div>
    );
  }

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(pathWithLine);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="page-stack">
      <Link className="back-link text-link" to="/findings">
        <ArrowLeft size={15} aria-hidden="true" /> Kembali ke temuan
      </Link>
      <PageHeader
        eyebrow={`${repository?.owner}/${repository?.name} · ${finding.category}`}
        title={finding.title}
        description={`${finding.detector} · Rule ${finding.ruleId}`}
        actions={<SeverityPill severity={finding.severity} />}
      />

      <PreviewStateGate
        emptyTitle="Evidence belum tersedia"
        emptyDescription="Belum ada laporan scan untuk temuan ini. Periksa status verifikasi repositori."
      >
        <Callout tone="warning" className="state-callout">
          <strong>
            {finding.confidence === 'potential'
              ? 'Indikasi perlu ditinjau'
              : 'Evidence memerlukan verifikasi'}
          </strong>
          <span>
            Severity dan hasil scanner bukan bukti bahwa isu dapat dieksploitasi. Tinjau konteks
            kode sebelum mengambil keputusan.
          </span>
        </Callout>

        <div className="finding-detail-grid">
          <div className="finding-detail-main">
            <Panel className="evidence-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">EVIDENCE TERSANITASI</p>
                  <h2>Lokasi kode</h2>
                </div>
                <span className="sanitized-tag">
                  <ShieldAlert size={13} aria-hidden="true" /> Tersanitasi
                </span>
              </div>
              <div className="source-location-bar">
                <div className="source-location-copy">
                  <FileCode2 size={16} aria-hidden="true" />
                  <code>{pathWithLine}</code>
                </div>
                <Button size="small" onClick={copyPath} aria-label="Salin path dan nomor baris">
                  {copyState === 'copied' ? (
                    <ClipboardCheck size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  {copyState === 'copied' ? 'Tersalin' : 'Salin path'}
                </Button>
              </div>
              <div
                className="evidence-code"
                role="region"
                aria-label="Cuplikan kode contoh yang telah disanitasi"
                tabIndex={0}
              >
                {finding.excerpt.map((line, index) => (
                  <div
                    className={`code-line${index + finding.line === finding.line ? ' code-line-highlight' : ''}`}
                    key={`${index}-${line}`}
                  >
                    <span aria-hidden="true">{finding.line ? finding.line + index : '—'}</span>
                    <code>{line}</code>
                  </div>
                ))}
              </div>
              <div className="evidence-footer">
                <span>
                  <GitCommitHorizontal size={14} aria-hidden="true" /> Commit{' '}
                  <code>{scan?.commit ?? 'tidak tersedia'}</code>
                </span>
                <span>Nilai secret tidak ditampilkan</span>
              </div>
              {copyState !== 'idle' && (
                <p className={`copy-feedback copy-${copyState}`} aria-live="polite">
                  {copyState === 'copied'
                    ? 'Path tersalin ke clipboard.'
                    : 'Clipboard tidak tersedia di browser ini.'}
                </p>
              )}
            </Panel>

            <Panel className="finding-history-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">AUDIT TRAIL</p>
                  <h2>Riwayat triage</h2>
                </div>
                <History size={18} aria-hidden="true" />
              </div>
              <ol className="history-list">
                {finding.history.map((entry, index) => (
                  <li className="history-item" key={`${entry.date}-${entry.state}`}>
                    <span
                      className={`history-marker${index === 0 ? ' history-marker-first' : ''}`}
                      aria-hidden="true"
                    />
                    <div className="history-entry">
                      <div className="history-entry-heading">
                        <strong>{entry.state}</strong>
                        <time>{entry.date}</time>
                      </div>
                      <span>{entry.actor}</span>
                      <p>{entry.note}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="triage-actions" aria-label="Tindakan triage">
                <div>
                  <strong>
                    <StatusPill status={finding.triage} />
                  </strong>
                  <span>Perubahan status tersedia setelah integrasi API diaktifkan.</span>
                </div>
                <Button disabled title="Tindakan triage belum tersedia pada pratinjau">
                  Ubah status
                </Button>
              </div>
            </Panel>
          </div>

          <aside className="finding-detail-aside" aria-label="Metadata temuan">
            <Panel>
              <div className="panel-heading panel-heading-tight">
                <div>
                  <p className="eyebrow">RINGKASAN TEMUAN</p>
                  <h2>Metadata</h2>
                </div>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Severity</dt>
                  <dd>
                    <SeverityPill severity={finding.severity} />
                  </dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>
                    {finding.evidenceStatus === 'sanitized'
                      ? 'Lokasi dan cuplikan disanitasi'
                      : 'Metadata saja'}
                  </dd>
                </div>
                <div>
                  <dt>Keyakinan</dt>
                  <dd>
                    <ConfidenceLabel confidence={finding.confidence} />
                  </dd>
                </div>
                <div>
                  <dt>Tool</dt>
                  <dd>{finding.detector}</dd>
                </div>
                <div>
                  <dt>Rule ID</dt>
                  <dd>
                    <code className="rule-code">{finding.ruleId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Terdeteksi</dt>
                  <dd>{finding.lastDetected}</dd>
                </div>
              </dl>
              <div className="aside-action-list">
                <Button disabled title="Tautan sumber tidak tersedia pada data contoh">
                  <ExternalLink size={14} aria-hidden="true" /> Buka lokasi sumber
                </Button>
                {finding.advisory ? (
                  <div className="advisory-reference">
                    <span>Rujukan dependensi</span>
                    <strong>{finding.advisory}</strong>
                    <small>Tautan advisory belum tersedia pada fixture.</small>
                  </div>
                ) : (
                  <p className="muted-small">
                    Tidak ada referensi advisory eksternal pada contoh ini.
                  </p>
                )}
              </div>
            </Panel>
            <Callout tone="info">
              Identitas workflow yang cocok membantu menelusuri asal laporan, tetapi tidak
              memastikan keaslian isi temuan.
            </Callout>
          </aside>
        </div>
      </PreviewStateGate>
    </div>
  );
}
