import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { organizationsResponseSchema } from '@sentinel/contracts';
import type { Organization } from '@sentinel/contracts';
import { useAuth } from './AuthContext';
import { useApiQuery } from '../lib/useApiQuery';

type WorkspaceContextValue = {
  organizations: Organization[];
  activeOrganization: Organization | null;
  loading: boolean;
  error: Error | null;
  selectOrganization: (id: string) => void;
  reloadOrganizations: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function storageKey(userId: string | undefined) {
  return userId ? `sentinel.active-organization.${userId}` : null;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = user?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const currentKey = storageKey(key ?? undefined);
    return currentKey ? window.localStorage.getItem(currentKey) : null;
  });
  const query = useApiQuery(key, '/v1/organizations', organizationsResponseSchema);
  const organizations = query.data?.data ?? [];
  useEffect(() => {
    const currentKey = storageKey(key ?? undefined);
    setSelectedId(currentKey ? window.localStorage.getItem(currentKey) : null);
  }, [key]);
  const activeOrganization =
    organizations.find((organization) => organization.id === selectedId) ??
    organizations[0] ??
    null;

  const selectOrganization = useCallback(
    (id: string) => {
      const currentKey = storageKey(key ?? undefined);
      if (currentKey) window.localStorage.setItem(currentKey, id);
      setSelectedId(id);
    },
    [key],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      organizations,
      activeOrganization,
      loading: query.loading,
      error: query.error,
      selectOrganization,
      reloadOrganizations: query.retry,
    }),
    [
      activeOrganization,
      organizations,
      query.error,
      query.loading,
      query.retry,
      selectOrganization,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  return context;
}
