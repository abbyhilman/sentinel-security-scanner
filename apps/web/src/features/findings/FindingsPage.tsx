import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpDown, Filter, Search, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { PreviewStateGate } from '../../components/PreviewStateGate';
import { Button, PageHeader, SeverityPill, StatusPill } from '../../components/ui';
import { usePreviewState } from '../../components/PreviewContext';
import { getRepository, mockFindings, mockRepositories } from '../../fixtures/mock/data';
import type { FindingSeverity } from '../../fixtures/mock/types';
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { ApiEmptyState, ApiErrorState, ApiLoading } from '../../components/ApiState';
import { apiGet } from '../../lib/api';
import { mapFinding, mapRepository } from '../../lib/mappers';
import { useApiPages } from '../../lib/useApiQuery';
import { findingApiSchema, pagedResponseSchema, repositorySchema } from '@sentinel/contracts';
import { useCallback } from 'react';

type SortKey = 'severity' | 'lastDetected';

const severityRank: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
  unknown: 5,
};

function FindingLocation({ path, line }: { path: string; line: number }) {
  return (
    <code className="finding-location">
      {path}
      {line ? `:${line}` : ''}
    </code>
  );
}

function PreviewFindingsPage() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const [triage, setTriage] = useState('all');
  const [repositoryId, setRepositoryId] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('severity');
  const [descending, setDescending] = useState(false);
  const previewState = usePreviewState();

  const findings = useMemo(() => {
    const filtered = mockFindings.filter((finding) => {
      const repository = getRepository(finding.repositoryId);
      const fullText =
        `${finding.title} ${finding.category} ${finding.detector} ${finding.ruleId} ${finding.path} ${repository?.owner}/${repository?.name}`.toLowerCase();
      return (
        fullText.includes(query.toLowerCase()) &&
        (severity === 'all' || finding.severity === severity) &&
        (triage === 'all' || finding.triage === triage) &&
        (repositoryId === 'all' || finding.repositoryId === repositoryId)
      );
    });

    filtered.sort((a, b) => {
      const result =
        sortKey === 'severity'
          ? severityRank[a.severity] - severityRank[b.severity]
          : a.lastDetected.localeCompare(b.lastDetected, 'id');
      return descending ? -result : result;
    });
    return filtered;
  }, [descending, query, repositoryId, severity, sortKey, triage]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) setDescending((current) => !current);
    else {
      setSortKey(nextKey);
      setDescending(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="INBOX PEMERIKSAAN"
        title="Temuan"
        description="Tinjau indikasi dari scanner dengan status evidence, sumber, dan lokasi yang jelas."
        actions={
          <span className="findings-count">
            <ShieldAlert size={15} aria-hidden="true" /> {findings.length} data contoh
          </span>
        }
      />
      {previewState === 'pending' && (
        <div className="repo-preview-note">
          <Filter size={15} aria-hidden="true" />
          Status pending hanya berlaku untuk repositori yang belum diverifikasi; temuan di bawah
          adalah fixture demo.
        </div>
      )}
      <PreviewStateGate
        emptyTitle="Belum ada temuan"
        emptyDescription="Temuan akan muncul dari laporan workflow setelah repositori mengirim hasil pemeriksaan. Scan parsial tidak cukup untuk menyatakan kode aman."
      >
        <div className="findings-filter-bar" role="search" aria-label="Filter temuan">
          <label className="search-field findings-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Cari temuan</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Cari judul, rule, atau path"
            />
          </label>
          <label className="select-field">
            <span className="sr-only">Filter severity</span>
            <select value={severity} onChange={(event) => setSeverity(event.currentTarget.value)}>
              <option value="all">Semua severity</option>
              <option value="critical">Kritis</option>
              <option value="high">Tinggi</option>
              <option value="medium">Sedang</option>
              <option value="low">Rendah</option>
            </select>
          </label>
          <label className="select-field">
            <span className="sr-only">Filter status triage</span>
            <select value={triage} onChange={(event) => setTriage(event.currentTarget.value)}>
              <option value="all">Semua status</option>
              <option value="open">Terbuka</option>
              <option value="acknowledged">Diakui</option>
              <option value="investigating">Sedang ditinjau</option>
            </select>
          </label>
          <label className="select-field repository-filter">
            <span className="sr-only">Filter repositori</span>
            <select
              value={repositoryId}
              onChange={(event) => setRepositoryId(event.currentTarget.value)}
            >
              <option value="all">Semua repositori</option>
              {mockRepositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.owner}/{repository.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="findings-result-meta" aria-live="polite">
          <span>Menampilkan {findings.length} temuan contoh</span>
          <span>Semua bukti pada pratinjau ini sudah disanitasi</span>
        </div>

        {findings.length > 0 ? (
          <>
            <div className="findings-table-wrap">
              <table className="data-table findings-table">
                <caption className="sr-only">
                  Daftar temuan keamanan contoh yang sudah disanitasi
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Severity</th>
                    <th
                      scope="col"
                      aria-sort={
                        sortKey === 'severity' ? (descending ? 'descending' : 'ascending') : 'none'
                      }
                    >
                      <button
                        className="sort-button"
                        type="button"
                        onClick={() => changeSort('severity')}
                      >
                        Temuan <ArrowUpDown size={13} aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col">Repositori</th>
                    <th scope="col">Lokasi</th>
                    <th scope="col">Status</th>
                    <th
                      scope="col"
                      aria-sort={
                        sortKey === 'lastDetected'
                          ? descending
                            ? 'descending'
                            : 'ascending'
                          : 'none'
                      }
                    >
                      <button
                        className="sort-button"
                        type="button"
                        onClick={() => changeSort('lastDetected')}
                      >
                        Terdeteksi <ArrowUpDown size={13} aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col">
                      <span className="sr-only">Buka temuan</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding) => {
                    const repository = getRepository(finding.repositoryId);
                    return (
                      <tr key={finding.id}>
                        <td>
                          <SeverityPill severity={finding.severity} />
                        </td>
                        <td>
                          <Link className="finding-title-cell" to={`/findings/${finding.id}`}>
                            <strong>{finding.title}</strong>
                            <span>
                              {finding.detector} · <code>{finding.ruleId}</code>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Link className="table-text-link" to={`/repositories/${repository?.id}`}>
                            {repository?.owner}/{repository?.name}
                          </Link>
                        </td>
                        <td>
                          <FindingLocation path={finding.path} line={finding.line} />
                        </td>
                        <td>
                          <StatusPill status={finding.triage} />
                        </td>
                        <td>{finding.lastDetected}</td>
                        <td>
                          <Link
                            className="row-action"
                            to={`/findings/${finding.id}`}
                            aria-label={`Buka temuan: ${finding.title}`}
                          >
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="finding-cards">
              {findings.map((finding) => {
                const repository = getRepository(finding.repositoryId);
                return (
                  <Link className="finding-card" to={`/findings/${finding.id}`} key={finding.id}>
                    <div className="finding-card-top">
                      <SeverityPill severity={finding.severity} />
                      <StatusPill status={finding.triage} />
                    </div>
                    <strong className="finding-card-title">{finding.title}</strong>
                    <span className="finding-card-repo">
                      {repository?.owner}/{repository?.name} · {finding.detector}
                    </span>
                    <FindingLocation path={finding.path} line={finding.line} />
                    <span className="finding-card-open">
                      Buka evidence <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <div className="filtered-empty">
            Tidak ada temuan yang cocok dengan filter. Ubah kata pencarian atau pilihan filter.
          </div>
        )}
        <div className="findings-footer-note">
          <ShieldAlert size={15} aria-hidden="true" />
          Temuan menunjukkan indikasi dari tool; statusnya belum membuktikan eksploitasi.
        </div>
      </PreviewStateGate>
    </div>
  );
}

function LiveFindingsPage() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const [triage, setTriage] = useState('all');
  const [repositoryId, setRepositoryId] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('severity');
  const [descending, setDescending] = useState(false);
  const auth = useAuth();
  const workspace = useWorkspace();
  const organizationId = workspace?.activeOrganization?.id;
  const repositoryPath = organizationId
    ? `/v1/repositories?organizationId=${encodeURIComponent(organizationId)}&limit=100`
    : '';
  const loadRepositories = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${repositoryPath}&cursor=${encodeURIComponent(cursor)}` : repositoryPath,
        pagedResponseSchema(repositorySchema),
      ),
    [repositoryPath],
  );
  const repositories = useApiPages(auth.configured ? repositoryPath : null, loadRepositories);

  const listParams = new URLSearchParams();
  if (organizationId) listParams.set('organizationId', organizationId);
  listParams.set('limit', '100');
  if (query.trim()) listParams.set('q', query.trim());
  if (severity !== 'all') listParams.set('severity', severity);
  if (triage !== 'all') listParams.set('triage', triage);
  if (repositoryId !== 'all') listParams.set('repositoryId', repositoryId);
  const listPath = organizationId ? `/v1/findings?${listParams.toString()}` : '';
  const loadFindings = useCallback(
    (cursor: string | null) =>
      apiGet(
        cursor ? `${listPath}&cursor=${encodeURIComponent(cursor)}` : listPath,
        pagedResponseSchema(findingApiSchema),
      ),
    [listPath],
  );
  const findings = useApiPages(auth.configured ? listPath : null, loadFindings);
  const mappedFindings = useMemo(() => findings.data.map(mapFinding), [findings.data]);
  const sortedFindings = useMemo(
    () =>
      [...mappedFindings].sort((a, b) => {
        const result =
          sortKey === 'severity'
            ? severityRank[a.severity] - severityRank[b.severity]
            : (Date.parse(b.createdAt ?? b.lastDetected) || 0) -
              (Date.parse(a.createdAt ?? a.lastDetected) || 0);
        return descending ? -result : result;
      }),
    [descending, mappedFindings, sortKey],
  );
  const changeSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) setDescending((current) => !current);
    else {
      setSortKey(nextKey);
      setDescending(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="INBOX PEMERIKSAAN · LIVE"
        title="Temuan"
        description="Tinjau indikasi dari laporan workflow dengan status evidence, sumber, dan lokasi yang jelas."
        actions={
          <span className="findings-count">
            <ShieldAlert size={15} aria-hidden="true" /> {sortedFindings.length}
            {findings.nextCursor ? '+' : ''} dimuat
          </span>
        }
      />
      {(findings.loading || repositories.loading) && <ApiLoading title="Memuat temuan" />}
      {(findings.error || repositories.error) && (
        <ApiErrorState
          error={findings.error ?? repositories.error!}
          onRetry={findings.error ? findings.retry : repositories.retry}
        />
      )}
      {!findings.loading && !findings.error && !repositories.loading && !repositories.error && (
        <>
          <div className="findings-filter-bar" role="search" aria-label="Filter temuan">
            <label className="search-field findings-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Cari temuan</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Cari judul, rule, atau path"
              />
            </label>
            <label className="select-field">
              <span className="sr-only">Filter severity</span>
              <select value={severity} onChange={(event) => setSeverity(event.currentTarget.value)}>
                <option value="all">Semua severity</option>
                <option value="critical">Kritis</option>
                <option value="high">Tinggi</option>
                <option value="medium">Sedang</option>
                <option value="low">Rendah</option>
                <option value="info">Informasi</option>
                <option value="unknown">Tidak diketahui</option>
              </select>
            </label>
            <label className="select-field">
              <span className="sr-only">Filter status triage</span>
              <select value={triage} onChange={(event) => setTriage(event.currentTarget.value)}>
                <option value="all">Semua status</option>
                <option value="open">Terbuka</option>
                <option value="acknowledged">Diakui</option>
                <option value="investigating">Sedang ditinjau</option>
                <option value="false_positive">False positive</option>
                <option value="accepted_risk">Risiko diterima</option>
                <option value="fixed">Diperbaiki</option>
              </select>
            </label>
            <label className="select-field repository-filter">
              <span className="sr-only">Filter repositori</span>
              <select
                value={repositoryId}
                onChange={(event) => setRepositoryId(event.currentTarget.value)}
              >
                <option value="all">Semua repositori</option>
                {repositories.data.map((item) => {
                  const repository = mapRepository(item);
                  return (
                    <option key={item.id} value={item.id}>
                      {repository.owner}/{repository.name}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <div className="findings-result-meta" aria-live="polite">
            <span>
              Menampilkan {sortedFindings.length}
              {findings.nextCursor ? '+' : ''} temuan
            </span>
            <span>Semua bukti yang ditampilkan berasal dari data tersanitasi API.</span>
          </div>
          {sortedFindings.length ? (
            <>
              <div className="findings-table-wrap">
                <table className="data-table findings-table">
                  <caption className="sr-only">Daftar temuan keamanan live</caption>
                  <thead>
                    <tr>
                      <th scope="col">Severity</th>
                      <th
                        scope="col"
                        aria-sort={
                          sortKey === 'severity'
                            ? descending
                              ? 'descending'
                              : 'ascending'
                            : 'none'
                        }
                      >
                        <button
                          className="sort-button"
                          type="button"
                          onClick={() => changeSort('severity')}
                        >
                          Temuan <ArrowUpDown size={13} aria-hidden="true" />
                        </button>
                      </th>
                      <th scope="col">Repositori</th>
                      <th scope="col">Lokasi</th>
                      <th scope="col">Status</th>
                      <th
                        scope="col"
                        aria-sort={
                          sortKey === 'lastDetected'
                            ? descending
                              ? 'descending'
                              : 'ascending'
                            : 'none'
                        }
                      >
                        <button
                          className="sort-button"
                          type="button"
                          onClick={() => changeSort('lastDetected')}
                        >
                          Terdeteksi <ArrowUpDown size={13} aria-hidden="true" />
                        </button>
                      </th>
                      <th scope="col">
                        <span className="sr-only">Buka temuan</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFindings.map((finding) => (
                      <tr key={finding.id}>
                        <td>
                          <SeverityPill severity={finding.severity} />
                        </td>
                        <td>
                          <Link className="finding-title-cell" to={`/findings/${finding.id}`}>
                            <strong>{finding.title}</strong>
                            <span>
                              {finding.detector} · <code>{finding.ruleId}</code>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Link
                            className="table-text-link"
                            to={`/repositories/${finding.repositoryId}`}
                          >
                            {finding.repositoryFullName}
                          </Link>
                        </td>
                        <td>
                          <FindingLocation path={finding.path} line={finding.line} />
                        </td>
                        <td>
                          <StatusPill status={finding.triage} />
                        </td>
                        <td>{finding.lastDetected}</td>
                        <td>
                          <Link
                            className="row-action"
                            to={`/findings/${finding.id}`}
                            aria-label={`Buka temuan: ${finding.title}`}
                          >
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="finding-cards">
                {sortedFindings.map((finding) => (
                  <Link className="finding-card" to={`/findings/${finding.id}`} key={finding.id}>
                    <div className="finding-card-top">
                      <SeverityPill severity={finding.severity} />
                      <StatusPill status={finding.triage} />
                    </div>
                    <strong className="finding-card-title">{finding.title}</strong>
                    <span className="finding-card-repo">
                      {finding.repositoryFullName} · {finding.detector}
                    </span>
                    <FindingLocation path={finding.path} line={finding.line} />
                    <span className="finding-card-open">
                      Buka evidence <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <ApiEmptyState
              title="Belum ada temuan yang cocok"
              description="Temuan akan muncul dari laporan workflow. Ubah filter atau tunggu laporan pertama. Hasil kosong bukan jaminan bahwa kode aman."
            />
          )}
          {findings.nextCursor && (
            <div className="pagination-actions">
              <Button
                type="button"
                onClick={() => void findings.loadMore()}
                disabled={findings.loadingMore}
              >
                {findings.loadingMore ? 'Memuat…' : 'Muat temuan lainnya'}
              </Button>
            </div>
          )}
          <div className="findings-footer-note">
            <ShieldAlert size={15} aria-hidden="true" />
            Temuan menunjukkan indikasi dari tool; statusnya belum membuktikan eksploitasi.
          </div>
        </>
      )}
    </div>
  );
}

export function FindingsPage() {
  const auth = useAuth();
  return auth.configured ? <LiveFindingsPage /> : <PreviewFindingsPage />;
}
