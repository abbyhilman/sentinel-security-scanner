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

export function SettingsPage() {
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
