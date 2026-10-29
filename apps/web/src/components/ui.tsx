import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  LoaderCircle,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  EngineStatus,
  FindingSeverity,
  FindingTriage,
  ScanStatus,
} from '../fixtures/mock/types';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'small';
};

export function Button({
  children,
  className = '',
  variant = 'secondary',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function Panel({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatusPill({
  status,
  label,
}: {
  status:
    | EngineStatus
    | ScanStatus
    | FindingTriage
    | 'pending'
    | 'verified'
    | 'disabled'
    | 'running'
    | 'cancelled'
    | 'rejected';
  label?: string;
}) {
  const copy =
    label ??
    (status === 'completed'
      ? 'Selesai'
      : status === 'partial'
        ? 'Sebagian'
        : status === 'failed'
          ? 'Gagal'
          : status === 'skipped'
            ? 'Dilewati'
            : status === 'timed_out'
              ? 'Batas waktu'
              : status === 'unknown'
                ? 'Tidak diketahui'
                : status === 'pending'
                  ? 'Menunggu verifikasi'
                  : status === 'verified'
                    ? 'Terverifikasi'
                    : status === 'disabled'
                      ? 'Dinonaktifkan'
                      : status === 'awaiting_report'
                        ? 'Menunggu laporan'
                        : status === 'running'
                          ? 'Berjalan'
                          : status === 'cancelled'
                            ? 'Dibatalkan'
                            : status === 'rejected'
                              ? 'Ditolak'
                              : status === 'open'
                                ? 'Terbuka'
                                : status === 'acknowledged'
                                  ? 'Diakui'
                                  : status === 'investigating'
                                    ? 'Sedang ditinjau'
                                    : status === 'false_positive'
                                      ? 'False positive'
                                      : status === 'accepted_risk'
                                        ? 'Risiko diterima'
                                        : status === 'fixed'
                                          ? 'Diperbaiki'
                                          : 'Status tidak diketahui');

  return (
    <span className={`status-pill status-${status.replace('_', '-')}`}>
      <span className="status-dot" aria-hidden="true" />
      {copy}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: FindingSeverity }) {
  const labels: Record<FindingSeverity, string> = {
    critical: 'Kritis',
    high: 'Tinggi',
    medium: 'Sedang',
    low: 'Rendah',
    info: 'Informasi',
    unknown: 'Tidak diketahui',
  };

  return (
    <span className={`severity-pill severity-${severity}`}>
      <ShieldAlert size={14} aria-hidden="true" />
      {labels[severity]}
    </span>
  );
}

export function ConfidenceLabel({
  confidence,
}: {
  confidence: 'potential' | 'needs_review' | 'unknown';
}) {
  const labels = {
    potential: 'Indikasi perlu ditinjau',
    needs_review: 'Perlu verifikasi',
    unknown: 'Keyakinan tidak diketahui',
  };
  return <span className="confidence-label">{labels[confidence]}</span>;
}

export function Callout({
  children,
  tone = 'info',
  className = '',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
  className?: string;
}) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
        ? AlertCircle
        : tone === 'danger'
          ? XCircle
          : ShieldAlert;
  return (
    <div className={`callout callout-${tone} ${className}`.trim()} role="note">
      <Icon size={17} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = BadgeCheck,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={21} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function LoadingState({ title = 'Memuat data' }: { title?: string }) {
  return (
    <div className="loading-state" aria-live="polite" aria-busy="true">
      <span className="sr-only">{title}, mohon tunggu.</span>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
      <div className="skeleton skeleton-panel" />
      <div className="loading-caption">
        <LoaderCircle size={16} className="spin-icon" aria-hidden="true" />
        {title}…
      </div>
    </div>
  );
}

export function FullScreenLoadingState({ title }: { title: string }) {
  const navigationRows = Array.from({ length: 5 }, (_, index) => index);
  const metricCards = Array.from({ length: 3 }, (_, index) => index);
  const resultRows = Array.from({ length: 3 }, (_, index) => index);

  return (
    <div className="full-screen-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{title}, mohon tunggu.</span>
      <aside className="full-screen-loading-sidebar" aria-hidden="true">
        <div className="full-screen-loading-brand">
          <span className="skeleton full-screen-loading-mark" />
          <span className="skeleton full-screen-loading-wordmark" />
        </div>
        <div className="full-screen-loading-workspace">
          <span className="skeleton full-screen-loading-avatar" />
          <span className="skeleton full-screen-loading-workspace-copy" />
        </div>
        <div className="full-screen-loading-navigation">
          {navigationRows.map((row) => (
            <div className="full-screen-loading-navigation-row" key={row}>
              <span className="skeleton full-screen-loading-navigation-icon" />
              <span className="skeleton full-screen-loading-navigation-label" />
            </div>
          ))}
        </div>
        <span className="skeleton full-screen-loading-sidebar-footer" />
      </aside>

      <div className="full-screen-loading-main">
        <header className="full-screen-loading-topbar" aria-hidden="true">
          <span className="skeleton full-screen-loading-breadcrumb" />
          <span className="skeleton full-screen-loading-topbar-control" />
        </header>
        <main className="full-screen-loading-content">
          <p className="full-screen-loading-caption" aria-hidden="true">
            <LoaderCircle size={15} className="spin-icon" aria-hidden="true" />
            {title}…
          </p>
          <div className="skeleton full-screen-loading-notice" aria-hidden="true" />
          <div className="full-screen-loading-page-heading" aria-hidden="true">
            <div className="full-screen-loading-title-group">
              <span className="skeleton full-screen-loading-eyebrow" />
              <span className="skeleton full-screen-loading-title" />
              <span className="skeleton full-screen-loading-description" />
            </div>
            <span className="skeleton full-screen-loading-action" />
          </div>
          <div className="full-screen-loading-metrics" aria-hidden="true">
            {metricCards.map((card) => (
              <div className="full-screen-loading-metric" key={card}>
                <span className="skeleton full-screen-loading-metric-icon" />
                <span className="skeleton full-screen-loading-metric-label" />
                <span className="skeleton full-screen-loading-metric-value" />
                <span className="skeleton full-screen-loading-metric-note" />
              </div>
            ))}
          </div>
          <section className="full-screen-loading-panel" aria-hidden="true">
            <div className="full-screen-loading-panel-heading">
              <span className="skeleton full-screen-loading-panel-eyebrow" />
              <span className="skeleton full-screen-loading-panel-title" />
            </div>
            {resultRows.map((row) => (
              <div className="full-screen-loading-result-row" key={row}>
                <span className="skeleton full-screen-loading-result-icon" />
                <span className="skeleton full-screen-loading-result-copy" />
                <span className="skeleton full-screen-loading-result-status" />
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

export function FeedbackState({
  kind,
  onRetry,
}: {
  kind: 'unauthorized' | 'error';
  onRetry: () => void;
}) {
  const denied = kind === 'unauthorized';
  return (
    <div className="feedback-state">
      <div className="feedback-icon" aria-hidden="true">
        {denied ? <ShieldAlert size={22} /> : <AlertCircle size={22} />}
      </div>
      <p className="eyebrow">{denied ? 'AKSES TERBATAS' : 'GANGGUAN SEMENTARA'}</p>
      <h1>{denied ? 'Kamu tidak memiliki akses' : 'Data belum dapat ditampilkan'}</h1>
      <p>
        {denied
          ? 'Akses ke ruang kerja atau repositori ini tidak tersedia untuk akun demo.'
          : 'Pratinjau tidak dapat memuat data contoh. Coba tampilkan kondisi demo lain.'}
      </p>
      <button className="btn btn-secondary" onClick={onRetry} type="button">
        <ArrowRight size={16} aria-hidden="true" />
        Kembali ke ringkasan demo
      </button>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'navy',
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: 'navy' | 'teal' | 'amber';
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon metric-${tone}`}>
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="metric-content">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </div>
  );
}
