import {
  ArrowUpRight,
  Bell,
  Building2,
  CircleHelp,
  GitBranch,
  KeyRound,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Callout, PageHeader, Panel, StatusPill } from '../../components/ui';
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { ApiErrorState, ApiLoading } from '../../components/ApiState';
import { apiGet } from '../../lib/api';
import { mapRepository } from '../../lib/mappers';
import { useApiPages } from '../../lib/useApiQuery';
import { pagedResponseSchema, repositorySchema } from '@sentinel/contracts';
import { useCallback } from 'react';

function SettingRow({
  label,
  value,
  description,
  status,
}: {
  label: string;
  value: string;
  description: string;
  status?: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="setting-row-value">
        {status ? <StatusPill status="unknown" label={status} /> : <span>{value}</span>}
      </div>
    </div>
  );
}

function PreviewSettingsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="PREFERENSI RUANG KERJA"
        title="Pengaturan"
        description="Informasi keanggotaan, akses repositori, dan sumber laporan."
      />
      <PreviewStateGate
        emptyTitle="Pengaturan belum tersedia"
        emptyDescription="Informasi ruang kerja akan ditampilkan setelah sesi akun dan keanggotaan terhubung."
      >
        <Callout tone="info" className="state-callout">
          <strong>Mode demo hanya-baca.</strong>
          <span>
            Pengaturan di bawah adalah contoh dan tidak mengubah izin atau integrasi nyata.
          </span>
        </Callout>
        <div className="settings-grid">
          <Panel className="settings-main-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RUANG KERJA</p>
                <h2>Demo Sentinel</h2>
                <p className="panel-subtitle">Konfigurasi contoh untuk pratinjau UI.</p>
              </div>
              <Building2 size={19} aria-hidden="true" />
            </div>
            <div className="settings-section">
              <div className="settings-section-title">
                <Users size={16} aria-hidden="true" />
                <h3>Keanggotaan</h3>
              </div>
              <SettingRow
                label="Akses anggota"
                value="Owner, maintainer, viewer"
                description="Model akses ditampilkan sebagai contoh."
              />
              <SettingRow
                label="Pemeriksaan tenant"
                value="Belum terhubung"
                description="Keanggotaan dan isolasi data belum diuji terhadap database."
                status="Belum terverifikasi"
              />
            </div>
            <div className="settings-section">
              <div className="settings-section-title">
                <GitBranch size={16} aria-hidden="true" />
                <h3>Workflow repositori</h3>
              </div>
              <SettingRow
                label="Kepemilikan workflow"
                value="Pemilik repositori"
                description="Workflow dipasang dan dijalankan di repositori yang dipindai."
              />
              <SettingRow
                label="Pemindaian otomatis"
                value="Tidak diaktifkan"
                description="Tidak ada workflow atau scan nyata yang dijalankan dari pratinjau."
              />
            </div>
          </Panel>

          <div className="settings-side-stack">
            <Panel>
              <div className="panel-heading panel-heading-tight">
                <div>
                  <p className="eyebrow">INTEGRASI</p>
                  <h2>Sumber data</h2>
                </div>
                <KeyRound size={18} aria-hidden="true" />
              </div>
              <div className="integration-row">
                <div className="integration-mark github-mark" aria-hidden="true">
                  GH
                </div>
                <div>
                  <strong>GitHub Actions</strong>
                  <span>Identitas workflow · belum terhubung</span>
                </div>
                <StatusPill status="unknown" label="Demo" />
              </div>
              <div className="integration-row">
                <div className="integration-mark supabase-mark" aria-hidden="true">
                  S
                </div>
                <div>
                  <strong>Supabase</strong>
                  <span>Auth dan penyimpanan · belum terhubung</span>
                </div>
                <StatusPill status="unknown" label="Demo" />
              </div>
            </Panel>

            <Panel>
              <div className="panel-heading panel-heading-tight">
                <div>
                  <p className="eyebrow">RETENSI & NOTIFIKASI</p>
                  <h2>Preferensi data</h2>
                </div>
                <Bell size={18} aria-hidden="true" />
              </div>
              <SettingRow
                label="Retensi laporan"
                value="Belum ditetapkan"
                description="Periode penyimpanan belum ditetapkan."
                status="Belum ditetapkan"
              />
              <SettingRow
                label="Notifikasi"
                value="Belum tersedia"
                description="Preferensi notifikasi belum dikonfigurasi."
                status="Belum tersedia"
              />
            </Panel>

            <div className="settings-help-card">
              <div className="settings-help-icon">
                <CircleHelp size={18} aria-hidden="true" />
              </div>
              <div>
                <strong>Perlu informasi?</strong>
                <span>Lihat status proyek dan kebijakan akses.</span>
              </div>
              <Link to="/repositories" aria-label="Buka daftar repositori">
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
        <Callout tone="warning">
          Status integrasi dan retensi pada halaman ini bukan konfigurasi aktif.
        </Callout>
      </PreviewStateGate>
    </div>
  );
}

function LiveSettingsPage() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const organization = workspace?.activeOrganization;
  const listPath = organization
    ? `/v1/repositories?organizationId=${encodeURIComponent(organization.id)}&limit=100`
    : '';
  const loadPage = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${listPath}&cursor=${encodeURIComponent(cursor)}` : listPath,
        pagedResponseSchema(repositorySchema),
      ),
    [listPath],
  );
  const repositories = useApiPages(auth.configured ? listPath : null, loadPage);
  const mapped = repositories.data.map(mapRepository);
  const verified = mapped.filter((repository) => repository.status === 'verified').length;
  const pending = mapped.filter((repository) => repository.status === 'pending').length;
  const disabled = mapped.filter((repository) => repository.status === 'disabled').length;
  const integrationStatus = repositories.loading
    ? 'Memuat status'
    : repositories.error
      ? 'Belum dapat dimuat'
      : mapped.length === 0
        ? 'Belum ada repositori'
        : `${verified} terverifikasi · ${pending} menunggu${disabled ? ` · ${disabled} dinonaktifkan` : ''}${repositories.nextCursor ? ' · sebagian data' : ''}`;
  const roleLabel =
    organization?.role === 'owner'
      ? 'Owner'
      : organization?.role === 'maintainer'
        ? 'Maintainer'
        : organization?.role === 'viewer'
          ? 'Viewer'
          : 'Tidak diketahui';

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="PREFERENSI RUANG KERJA · LIVE"
        title="Pengaturan"
        description="Informasi sesi, keanggotaan, dan status repositori pada organisasi aktif."
      />
      <Callout tone="info" className="state-callout">
        <strong>Pengaturan bersifat baca saja pada tahap ini.</strong>
        <span>
          Halaman ini menampilkan status dari sesi dan API. Perubahan role, retensi, notifikasi, dan
          mutasi triage belum tersedia.
        </span>
      </Callout>
      {repositories.loading && <ApiLoading title="Memuat status repositori" />}
      {repositories.error && (
        <ApiErrorState error={repositories.error} onRetry={repositories.retry} />
      )}
      <div className="settings-grid">
        <Panel className="settings-main-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RUANG KERJA</p>
              <h2>{organization?.name ?? 'Organisasi tidak tersedia'}</h2>
              <p className="panel-subtitle">Data membership dari sesi akun aktif.</p>
            </div>
            <Building2 size={19} aria-hidden="true" />
          </div>
          <div className="settings-section">
            <div className="settings-section-title">
              <Users size={16} aria-hidden="true" />
              <h3>Keanggotaan</h3>
            </div>
            <SettingRow
              label="Akun"
              value={auth.user?.email ?? 'Email tidak tersedia'}
              description="Sesi Supabase Auth saat ini."
            />
            <SettingRow
              label="Peran di organisasi"
              value={roleLabel}
              description="Izin efektif diperiksa kembali oleh API dan RLS pada setiap permintaan."
            />
            <SettingRow
              label="Pemeriksaan tenant"
              value="Diterapkan melalui API dan RLS"
              description="Validasi tenant sudah dikonfirmasi sebelumnya pada test pgTAP; jalur API Tahap 07 masih perlu dites end-to-end."
              status="Perlu verifikasi API"
            />
          </div>
          <div className="settings-section">
            <div className="settings-section-title">
              <GitBranch size={16} aria-hidden="true" />
              <h3>Workflow repositori</h3>
            </div>
            <SettingRow
              label="Status repo"
              value={integrationStatus}
              description="Ringkasan dari repositori yang dimuat untuk organisasi aktif."
            />
            <SettingRow
              label="Pemindaian"
              value={
                repositories.loading
                  ? 'Memuat status workflow'
                  : repositories.error
                    ? 'Status workflow belum dapat dimuat'
                    : verified > 0
                      ? 'Workflow terhubung ke repositori terverifikasi'
                      : pending > 0
                        ? 'Menunggu pairing workflow'
                        : 'Belum ada workflow terhubung'
              }
              description="Pemilik repository memasang dan menjalankan workflow. Sentinel tidak memindai secara otomatis."
            />
          </div>
        </Panel>
        <div className="settings-side-stack">
          <Panel>
            <div className="panel-heading panel-heading-tight">
              <div>
                <p className="eyebrow">INTEGRASI</p>
                <h2>Sumber data</h2>
              </div>
              <KeyRound size={18} aria-hidden="true" />
            </div>
            <div className="integration-row">
              <div className="integration-mark github-mark" aria-hidden="true">
                GH
              </div>
              <div>
                <strong>GitHub Actions</strong>
                <span>{integrationStatus}</span>
              </div>
              <StatusPill
                status={verified ? 'verified' : pending ? 'pending' : 'unknown'}
                label={verified ? 'Terhubung' : pending ? 'Pairing menunggu' : 'Belum terhubung'}
              />
            </div>
            <div className="integration-row">
              <div className="integration-mark supabase-mark" aria-hidden="true">
                S
              </div>
              <div>
                <strong>Supabase</strong>
                <span>Auth dan API user terkonfigurasi</span>
              </div>
              <StatusPill status="verified" label="Sesi aktif" />
            </div>
          </Panel>
          <Panel>
            <div className="panel-heading panel-heading-tight">
              <div>
                <p className="eyebrow">RETENSI & NOTIFIKASI</p>
                <h2>Preferensi data</h2>
              </div>
              <Bell size={18} aria-hidden="true" />
            </div>
            <SettingRow
              label="Retensi laporan"
              value="Belum tersedia"
              description="Kebijakan retensi belum disediakan melalui API."
              status="Belum ditetapkan"
            />
            <SettingRow
              label="Notifikasi"
              value="Belum tersedia"
              description="Preferensi notifikasi belum disediakan melalui API."
              status="Belum tersedia"
            />
          </Panel>
          <div className="settings-help-card">
            <div className="settings-help-icon">
              <CircleHelp size={18} aria-hidden="true" />
            </div>
            <div>
              <strong>Kelola repositori</strong>
              <span>Lihat status pairing dan laporan workflow.</span>
            </div>
            <Link to="/repositories" aria-label="Buka daftar repositori">
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  return auth.configured ? <LiveSettingsPage /> : <PreviewSettingsPage />;
}
