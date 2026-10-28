import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  LockKeyhole,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { usePreviewState } from '../../components/PreviewContext';
import { Button, Callout, PageHeader, Panel, StatusPill } from '../../components/ui';
import { getFindingsForRepository, getRepository, getScan } from '../../fixtures/mock/data';
import type { RepositoryFixture } from '../../fixtures/mock/types';

type NewRepositoryLocationState = { owner?: string; name?: string } | null;

function getRepositoryFromRoute(id: string | undefined, locationState: NewRepositoryLocationState) {
  if (id === 'new-pending') {
    const repository: RepositoryFixture = {
      id: 'new-pending',
      owner: locationState?.owner ?? 'contoh-org',
      name: locationState?.name ?? 'new-repo',
      visibility: 'private',
      status: 'pending',
      primaryStack: 'Belum terdeteksi',
      defaultBranch: 'main',
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

export function RepositoryDetailPage() {
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
