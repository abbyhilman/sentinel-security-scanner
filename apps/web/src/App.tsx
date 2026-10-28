import { Link, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { FindingDetailPage } from './features/findings/FindingDetailPage';
import { FindingsPage } from './features/findings/FindingsPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { RepositoriesPage } from './features/repositories/RepositoriesPage';
import { RepositoryDetailPage } from './features/repositories/RepositoryDetailPage';
import { ScanDetailPage } from './features/scans/ScanDetailPage';
import { SettingsPage } from './features/settings/SettingsPage';

function NotFoundPage() {
  return (
    <div className="not-found-page">
      <p className="eyebrow">404</p>
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat ini tidak tersedia di pratinjau Sentinel.</p>
      <Link className="btn btn-primary" to="/overview">
        Kembali ke ringkasan
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="repositories" element={<RepositoriesPage />} />
        <Route path="repositories/:id" element={<RepositoryDetailPage />} />
        <Route path="scans/:id" element={<ScanDetailPage />} />
        <Route path="findings" element={<FindingsPage />} />
        <Route path="findings/:id" element={<FindingDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
