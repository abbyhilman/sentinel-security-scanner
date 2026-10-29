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
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { useApiQuery } from '../../lib/useApiQuery';
import { dataResponseSchema, findingApiSchema } from '@sentinel/contracts';
import { mapFinding } from '../../lib/mappers';

function PreviewFindingDetailPage() {
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

function LiveFindingDetailPage() {
  const { id } = useParams();
  const workspace = useWorkspace();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const organizationId = workspace?.activeOrganization?.id;
  const path =
    id && organizationId
      ? `/v1/findings/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`
      : '';
  const query = useApiQuery(
    id && organizationId ? `${organizationId}:${id}` : null,
    path,
    dataResponseSchema(findingApiSchema),
  );

  if (query.loading)
    return (
      <div className="page-stack">
        <Link className="back-link text-link" to="/findings">
          <ArrowLeft size={15} aria-hidden="true" /> Kembali ke temuan
        </Link>
        <ApiLoading title="Memuat detail temuan" />
      </div>
    );
  if (query.error)
    return (
      <div className="page-stack">
        <Link className="back-link text-link" to="/findings">
          <ArrowLeft size={15} aria-hidden="true" /> Kembali ke temuan
        </Link>
        <ApiErrorState error={query.error} onRetry={query.retry} />
      </div>
    );
  if (!query.data)
    return (
      <div className="page-stack">
        <Link className="back-link text-link" to="/findings">
          <ArrowLeft size={15} aria-hidden="true" /> Kembali ke temuan
        </Link>
        <ApiEmptyState
          title="Temuan tidak ditemukan"
          description="Temuan tidak tersedia pada organisasi aktif atau akun ini tidak memiliki akses."
        />
      </div>
    );

  const finding = mapFinding(query.data.data);
  const pathWithLine = `${finding.path}${finding.line ? `:${finding.line}` : ''}`;
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(pathWithLine);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  const safeSourceUrl = (() => {
    if (!finding.sourceUrl) return null;
    try {
      return new URL(finding.sourceUrl).protocol === 'https:' ? finding.sourceUrl : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="page-stack">
      <Link className="back-link text-link" to="/findings">
        <ArrowLeft size={15} aria-hidden="true" /> Kembali ke temuan
      </Link>
      <PageHeader
        eyebrow={`${finding.repositoryFullName} · ${finding.category}`}
        title={finding.title}
        description={`${finding.detector} · Rule ${finding.ruleId}`}
        actions={<SeverityPill severity={finding.severity} />}
      />
      <Callout tone="warning" className="state-callout">
        <strong>
          {finding.confidence === 'potential'
            ? 'Indikasi perlu ditinjau'
            : 'Evidence memerlukan verifikasi'}
        </strong>
        <span>
          Severity dan hasil scanner bukan bukti bahwa isu dapat dieksploitasi. Tinjau konteks kode
          sebelum mengambil keputusan.
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
                <ShieldAlert size={13} aria-hidden="true" />
                {finding.evidenceStatus === 'sanitized' ? 'Tersanitasi' : 'Metadata saja'}
              </span>
            </div>
            <div className="source-location-bar">
              <div className="source-location-copy">
                <FileCode2 size={16} aria-hidden="true" />
                <code>{pathWithLine}</code>
              </div>
              <Button
                size="small"
                onClick={() => void copyPath()}
                aria-label="Salin path dan nomor baris"
              >
                {copyState === 'copied' ? (
                  <ClipboardCheck size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {copyState === 'copied' ? 'Tersalin' : 'Salin path'}
              </Button>
            </div>
            {finding.excerpt.length ? (
              <div
                className="evidence-code"
                role="region"
                aria-label="Cuplikan kode tersanitasi"
                tabIndex={0}
              >
                {finding.excerpt.map((line, index) => (
                  <div
                    className={`code-line${index === 0 ? ' code-line-highlight' : ''}`}
                    key={`${index}-${line}`}
                  >
                    <span aria-hidden="true">{finding.line ? finding.line + index : '—'}</span>
                    <code>{line}</code>
                  </div>
                ))}
              </div>
            ) : (
              <ApiEmptyState
                title="Cuplikan kode tidak tersedia"
                description="Laporan hanya menyertakan metadata untuk temuan ini. Sentinel tidak menyimpan nilai secret atau source mentah."
              />
            )}
            <div className="evidence-footer">
              <span>
                <GitCommitHorizontal size={14} aria-hidden="true" /> Commit{' '}
                <code>{finding.commitSha ?? 'tidak tersedia'}</code>
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
            <ApiEmptyState
              title="Riwayat belum tersedia melalui API"
              description="Perubahan triage dan audit trail termasuk Tahap 08. Status saat ini ditampilkan dari laporan tersimpan."
            />
            <div className="triage-actions">
              <div>
                <strong>
                  <StatusPill status={finding.triage} />
                </strong>
                <span>Perubahan status belum tersedia pada tahap ini.</span>
              </div>
              <Button disabled title="Mutasi triage dijadwalkan pada Tahap 08">
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
                <dt>Repositori</dt>
                <dd>
                  <Link className="text-link" to={`/repositories/${finding.repositoryId}`}>
                    {finding.repositoryFullName}
                  </Link>
                </dd>
              </div>
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
              <div>
                <dt>Status triage</dt>
                <dd>
                  <StatusPill status={finding.triage} />
                </dd>
              </div>
            </dl>
            <div className="aside-action-list">
              {safeSourceUrl ? (
                <a
                  className="btn btn-secondary"
                  href={safeSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} aria-hidden="true" /> Buka rujukan sumber
                </a>
              ) : (
                <p className="muted-small">Tidak ada tautan sumber https pada laporan ini.</p>
              )}
              {finding.advisory && (
                <div className="advisory-reference">
                  <span>Rujukan dependensi</span>
                  <strong>{finding.advisory}</strong>
                  <small>Rujukan berasal dari metadata scanner.</small>
                </div>
              )}
            </div>
          </Panel>
          <Callout tone="info">
            Identitas workflow yang cocok membantu menelusuri asal laporan, tetapi tidak memastikan
            keaslian isi temuan.
          </Callout>
        </aside>
      </div>
    </div>
  );
}

export function FindingDetailPage() {
  const auth = useAuth();
  return auth.configured ? <LiveFindingDetailPage /> : <PreviewFindingDetailPage />;
}
