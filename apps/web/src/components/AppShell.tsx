import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpenText,
  Boxes,
  ChevronDown,
  CircleHelp,
  FileBarChart2,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { mockNotice, previewStateOptions } from '../fixtures/mock/data';
import type { PreviewState } from '../fixtures/mock/types';
import { PreviewContextProvider } from './PreviewContext';

const primaryLinks = [
  { to: '/overview', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: '/repositories', label: 'Repositori', icon: Boxes },
  { to: '/findings', label: 'Temuan', icon: ShieldCheck },
];

const secondaryLinks = [
  { to: '/reports', label: 'Laporan', icon: FileBarChart2 },
  { to: '/settings', label: 'Pengaturan', icon: Settings2 },
];

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="sidebar-navigation" aria-label="Navigasi utama">
      <p className="sidebar-section-label">RUANG KERJA</p>
      <div className="nav-link-list">
        {primaryLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <p className="sidebar-section-label sidebar-section-spaced">LAINNYA</p>
      <div className="nav-link-list">
        {secondaryLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            title={label}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function BrandWordmark() {
  return (
    <Link to="/overview" className="brand-wordmark" aria-label="Sentinel, ringkasan">
      <span className="brand-logo-art" aria-hidden="true" />
    </Link>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar desktop-sidebar">
      <div className="sidebar-brand">
        <BrandWordmark />
      </div>
      <div className="workspace-switcher">
        <div className="workspace-avatar" aria-hidden="true">
          D
        </div>
        <div className="workspace-name">
          <span>Ruang kerja</span>
          <strong>Demo Sentinel</strong>
        </div>
      </div>
      <NavigationLinks />
      <div className="sidebar-footer">
        <div className="sidebar-footer-icon">
          <BookOpenText size={17} aria-hidden="true" />
        </div>
        <div>
          <strong>Mode pratinjau</strong>
          <span>Data contoh tersanitasi</span>
        </div>
      </div>
    </aside>
  );
}

function MobileNavigation({ onClose }: { onClose: () => void }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelector<HTMLElement>(
      'button, a[href], select, input, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab' || !drawer) return;
      const controls = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button, a[href], select, input, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="mobile-nav-layer">
      <button
        className="mobile-nav-scrim"
        type="button"
        aria-label="Tutup menu navigasi"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-nav-title"
      >
        <div className="mobile-drawer-header">
          <BrandWordmark />
          <button
            className="icon-button"
            type="button"
            aria-label="Tutup navigasi"
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <h2 className="sr-only" id="mobile-nav-title">
          Menu navigasi
        </h2>
        <NavigationLinks onNavigate={onClose} />
        <div className="sidebar-footer mobile-sidebar-footer">
          <div className="sidebar-footer-icon">
            <BookOpenText size={17} aria-hidden="true" />
          </div>
          <div>
            <strong>Mode pratinjau</strong>
            <span>Data contoh tersanitasi</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getPageLabel(pathname: string) {
  if (pathname.startsWith('/repositories/')) return 'Detail repositori';
  if (pathname.startsWith('/repositories')) return 'Repositori';
  if (pathname.startsWith('/scans/')) return 'Detail scan';
  if (pathname.startsWith('/findings/')) return 'Detail temuan';
  if (pathname.startsWith('/findings')) return 'Temuan';
  if (pathname.startsWith('/reports')) return 'Laporan';
  if (pathname.startsWith('/settings')) return 'Pengaturan';
  return 'Ringkasan';
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const previewParam = searchParams.get('preview') as PreviewState | null;
  const previewState = previewStateOptions.some((option) => option.value === previewParam)
    ? (previewParam as PreviewState)
    : 'default';
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pageLabel = getPageLabel(location.pathname);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${pageLabel} — Sentinel Security Scanner`;
  }, [pageLabel]);

  const closeMobileNav = () => {
    setMobileNavOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  const setPreviewState = (nextState: PreviewState) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextState === 'default') nextParams.delete('preview');
    else nextParams.set('preview', nextState);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <PreviewContextProvider state={previewState}>
      <div className="app-shell min-h-screen bg-canvas text-graphite antialiased">
        <a href="#main-content" className="skip-link">
          Lewati ke konten utama
        </a>
        <Sidebar />
        <div className="app-frame">
          <header className="topbar">
            <div className="topbar-left">
              <button
                ref={menuButtonRef}
                className="icon-button mobile-menu-trigger"
                type="button"
                aria-label="Buka menu navigasi"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-navigation"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
              <div className="breadcrumb">
                <span>Demo Sentinel</span>
                <span className="breadcrumb-separator" aria-hidden="true">
                  /
                </span>
                <strong>{pageLabel}</strong>
              </div>
            </div>
            <div className="topbar-tools">
              <label className="preview-control">
                <Activity size={15} aria-hidden="true" />
                <span className="sr-only">Pilih kondisi pratinjau</span>
                <select
                  aria-label="Pilih kondisi pratinjau"
                  value={previewState}
                  onChange={(event) => setPreviewState(event.currentTarget.value as PreviewState)}
                >
                  {previewStateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
              <Link
                className="icon-button topbar-icon"
                to="/settings"
                aria-label="Bantuan dan pengaturan"
              >
                <CircleHelp size={18} aria-hidden="true" />
              </Link>
              <div className="account-avatar" aria-label="Akun demo">
                D
              </div>
            </div>
          </header>

          <div id="mobile-navigation">
            {mobileNavOpen && <MobileNavigation onClose={closeMobileNav} />}
          </div>

          <main id="main-content" className="main-content">
            <div className="demo-banner" role="status">
              <div className="demo-banner-mark">
                <Search size={15} aria-hidden="true" />
              </div>
              <p>
                <strong>Mode pratinjau</strong>
                <span>{mockNotice}</span>
              </p>
              <span className="demo-label">DEMO</span>
            </div>
            <Outlet />
            <footer className="app-footer">
              <span>Sentinel Security Scanner</span>
              <span>Pratinjau UI · data sintetis</span>
            </footer>
          </main>
        </div>
      </div>
    </PreviewContextProvider>
  );
}
