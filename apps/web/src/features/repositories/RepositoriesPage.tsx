import { useMemo, useState } from 'react';
import { ArrowRight, GitBranch, LockKeyhole, Plus, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Button, PageHeader, StatusPill } from '../../components/ui';
import { mockRepositories } from '../../fixtures/mock/data';
import { usePreviewState } from '../../components/PreviewContext';
import { ConnectRepositoryDialog } from './ConnectRepositoryDialog';
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { apiGet } from '../../lib/api';
import { mapRepository } from '../../lib/mappers';
import { useApiPages } from '../../lib/useApiQuery';
import { pagedResponseSchema, repositorySchema } from '@sentinel/contracts';
import { useCallback } from 'react';

export function RepositoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const previewState = usePreviewState();
  const auth = useAuth();
  const workspace = useWorkspace();
  const organizationId = workspace?.activeOrganization?.id;
  const listPath = organizationId
    ? `/v1/repositories?organizationId=${encodeURIComponent(organizationId)}&limit=100`
    : '';
  const loadPage = useCallback(
    (cursor: string | null) => {
      const path = cursor ? `${listPath}&cursor=${encodeURIComponent(cursor)}` : listPath;
      return apiGet(path, pagedResponseSchema(repositorySchema));
    },
    [listPath],
  );
  const liveQuery = useApiPages(auth.configured ? listPath : null, loadPage);
  const sourceRepositories = auth.configured ? liveQuery.data.map(mapRepository) : mockRepositories;
  const canManageRepositories =
    !auth.configured || workspace?.activeOrganization?.role !== 'viewer';
  const repositories = useMemo(() => {
    return sourceRepositories.filter((repository) => {
      const matchesQuery = `${repository.owner}/${repository.name} ${repository.primaryStack}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'all' || repository.status === statusFilter;
      const matchesPendingPreview = previewState !== 'pending' || repository.status === 'pending';
      return matchesQuery && matchesStatus && matchesPendingPreview;
    });
  }, [previewState, query, sourceRepositories, statusFilter]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="SUMBER PEMERIKSAAN"
        title="Repositori"
        description="Kelola status koneksi dan riwayat scan dari repositori yang kamu miliki."
        actions={
          <Button
            variant="primary"
            onClick={() => setDialogOpen(true)}
            disabled={!canManageRepositories}
            title={
              canManageRepositories
                ? undefined
                : 'Hanya owner atau maintainer yang dapat mendaftarkan repository.'
            }
          >
            <Plus size={16} aria-hidden="true" /> Hubungkan repositori
          </Button>
        }
      />
      {auth.configured && liveQuery.loading ? <ApiLoading title="Memuat repositori" /> : null}
      {auth.configured && liveQuery.error ? (
        <ApiErrorState error={liveQuery.error} onRetry={liveQuery.retry} />
      ) : null}
      {(!auth.configured || (!liveQuery.loading && !liveQuery.error)) && (
        <PreviewStateGate
          emptyTitle="Belum ada repositori"
          emptyDescription="Tambahkan owner/repo untuk memulai panduan pemasangan workflow milik pemilik repositori."
          emptyAction={
            <Button
              variant="primary"
              onClick={() => setDialogOpen(true)}
              disabled={!canManageRepositories}
              title={
                canManageRepositories
                  ? undefined
                  : 'Hanya owner atau maintainer yang dapat mendaftarkan repository.'
              }
            >
              <Plus size={16} aria-hidden="true" /> Hubungkan repositori
            </Button>
          }
        >
          <section className="repositories-toolbar" aria-label="Filter repositori">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Cari repositori</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Cari nama atau stack"
              />
            </label>
            <label className="select-field">
              <span className="sr-only">Filter status repositori</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
              >
                <option value="all">Semua status</option>
                <option value="verified">Terverifikasi</option>
                <option value="pending">Menunggu verifikasi</option>
              </select>
            </label>
            <p className="result-count">
              {repositories.length} repositori{auth.configured ? ' dimuat' : ' contoh'}
            </p>
          </section>

          {repositories.length === 0 ? (
            <ApiEmptyState
              title={
                query || statusFilter !== 'all'
                  ? 'Repositori tidak ditemukan'
                  : 'Belum ada repositori'
              }
              description={
                query || statusFilter !== 'all'
                  ? 'Ubah pencarian atau filter untuk melihat repositori lainnya.'
                  : 'Tambahkan repository yang kamu kelola untuk menyiapkan workflow scan.'
              }
            />
          ) : (
            <PreviewStateGate
              emptyTitle="Repositori tidak ditemukan"
              emptyDescription="Ubah kata pencarian atau filter status untuk melihat repositori contoh lainnya."
            >
              <div className="repository-table-wrap">
                <table className="data-table repository-table">
                  <caption className="sr-only">Daftar repositori contoh Sentinel</caption>
                  <thead>
                    <tr>
                      <th scope="col">Repositori</th>
                      <th scope="col">Stack</th>
                      <th scope="col">Status</th>
                      <th scope="col">Branch utama</th>
                      <th scope="col">Scan terakhir</th>
                      <th scope="col">
                        <span className="sr-only">Buka detail</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {repositories.map((repository) => (
                      <tr key={repository.id}>
                        <td>
                          <Link
                            className="repository-name-cell"
                            to={`/repositories/${repository.id}`}
                          >
                            <span className="repo-avatar" aria-hidden="true">
                              {repository.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>
                                {repository.owner}/{repository.name}
                              </strong>
                              <span className="repository-visibility">
                                <LockKeyhole size={12} aria-hidden="true" />{' '}
                                {repository.visibility === 'private'
                                  ? 'Repo privat'
                                  : repository.visibility === 'public'
                                    ? 'Repo publik'
                                    : repository.visibility === 'internal'
                                      ? 'Repo internal'
                                      : 'Visibilitas belum diketahui'}
                                {auth.configured ? '' : ' · contoh'}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td>{repository.primaryStack}</td>
                        <td>
                          <StatusPill status={repository.status} />
                        </td>
                        <td>
                          <span className="branch-cell">
                            <GitBranch size={14} aria-hidden="true" />
                            {repository.defaultBranch}
                          </span>
                        </td>
                        <td>{repository.lastRunAt ?? 'Belum ada run'}</td>
                        <td>
                          <Link
                            className="row-action"
                            to={`/repositories/${repository.id}`}
                            aria-label={`Buka ${repository.owner}/${repository.name}`}
                          >
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="repository-cards" aria-label="Daftar repositori ringkas">
                {repositories.map((repository) => (
                  <Link
                    className="repository-card"
                    to={`/repositories/${repository.id}`}
                    key={repository.id}
                  >
                    <div className="repository-card-heading">
                      <span className="repo-avatar" aria-hidden="true">
                        {repository.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="repository-card-name">
                        <strong>
                          {repository.owner}/{repository.name}
                        </strong>
                        <small>{repository.primaryStack}</small>
                      </span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </div>
                    <div className="repository-card-meta">
                      <StatusPill status={repository.status} />
                      <span>
                        <GitBranch size={13} aria-hidden="true" /> {repository.defaultBranch}
                      </span>
                    </div>
                    <div className="repository-card-last-run">
                      <span>Scan terakhir</span>
                      <strong>{repository.lastRunAt ?? 'Belum ada run'}</strong>
                    </div>
                  </Link>
                ))}
              </div>
            </PreviewStateGate>
          )}

          {previewState === 'pending' && (
            <div className="repo-preview-note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                Menunggu workflow pemilik repo untuk membuktikan identitas. Nama repository saja
                tidak mengubah status.
              </span>
            </div>
          )}
        </PreviewStateGate>
      )}
      {auth.configured && !liveQuery.loading && liveQuery.nextCursor && (
        <div className="pagination-actions">
          <Button onClick={() => void liveQuery.loadMore()} disabled={liveQuery.loadingMore}>
            {liveQuery.loadingMore ? 'Memuat…' : 'Muat lebih banyak repositori'}
          </Button>
        </div>
      )}
      <ConnectRepositoryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCompleted={liveQuery.retry}
      />
    </div>
  );
}
