import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { CreateOrganizationPage, WorkspaceLoadError } from './AuthPages';
import { FullScreenLoadingState } from './ui';

function WorkspaceGate({ children }: { children?: ReactNode }) {
  const workspace = useWorkspace();
  if (!workspace) return <>{children}</>;
  if (workspace.loading) return <FullScreenLoadingState title="Memuat ruang kerja" />;
  if (workspace.error)
    return <WorkspaceLoadError error={workspace.error} onRetry={workspace.reloadOrganizations} />;
  if (!workspace.organizations.length) return <CreateOrganizationPage />;
  return <>{children ?? <Outlet />}</>;
}

export function AuthenticatedArea() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.configured) return <Outlet />;
  if (auth.loading) return <FullScreenLoadingState title="Memeriksa sesi" />;
  if (!auth.session) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return (
    <WorkspaceProvider>
      <WorkspaceGate>
        <Outlet />
      </WorkspaceGate>
    </WorkspaceProvider>
  );
}
