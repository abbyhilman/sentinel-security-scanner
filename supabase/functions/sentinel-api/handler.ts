import {
  createOrganizationInputSchema,
  findingScannerFilterSchema,
  findingSeverityFilterSchema,
  findingTriageFilterSchema,
  pageCursorSchema,
  registerRepositoryInputSchema,
  uuidSchema,
} from '../../../packages/contracts/src/api.ts';

const apiPrefix = '/functions/v1/sentinel-api';
const apiPathPrefixes = [apiPrefix, '/sentinel-api'] as const;
const pageSizeDefault = 25;
const pageSizeMaximum = 100;
const requestBodyMaximum = 16 * 1024;
const workflowFile = '.github/workflows/sentinel-scan.yml';

function resolveApiRoute(pathname: string): string | null {
  for (const prefix of apiPathPrefixes) {
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }

  // Edge Function runtimes can provide the path after the function prefix.
  if (pathname === '/v1' || pathname.startsWith('/v1/')) return pathname;
  return null;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ApiConfig {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly fetcher?: FetchLike;
  readonly createNonce?: () => string;
}

interface Cursor {
  readonly createdAt: string;
  readonly id: string;
}

interface AuthUser {
  readonly id: string;
}

interface Page<T> {
  readonly data: T[];
  readonly page: { readonly limit: number; readonly nextCursor: string | null };
}

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set('content-type', 'application/json; charset=utf-8');
  resultHeaders.set('cache-control', 'no-store');
  resultHeaders.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: resultHeaders });
}

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '600',
    vary: 'Origin',
  });
  if (origin) headers.set('access-control-allow-origin', origin);
  return headers;
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable = false,
  headers?: HeadersInit,
): Response {
  return jsonResponse(status, { error: { code, message, requestId, retryable } }, headers);
}

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value))
    throw new ApiInputError('INVALID_FILTER');
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const cursor = pageCursorSchema.safeParse(parsed);
    if (!cursor.success) throw new Error('Invalid cursor');
    return cursor.data;
  } catch {
    throw new ApiInputError('INVALID_FILTER');
  }
}

function encodeCursor(cursor: Cursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function pageParameters(url: URL): { limit: number; cursor: Cursor | null } {
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? pageSizeDefault : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > pageSizeMaximum) {
    throw new ApiInputError('INVALID_FILTER');
  }
  return { limit, cursor: parseCursor(url.searchParams.get('cursor')) };
}

function paged<T extends { readonly created_at: string; readonly id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    page: {
      limit,
      nextCursor:
        hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
    },
  };
}

function relationRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return [value];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapRepository(row: Record<string, unknown>) {
  const runs = relationRows(row.scan_runs);
  const last = runs[0];
  return {
    id: String(row.id),
    organizationId: String(row.org_id),
    fullName: String(row.full_name),
    visibility: row.visibility,
    defaultBranch: String(row.default_branch ?? ''),
    status:
      row.onboarding_state === 'pending'
        ? 'pending_pairing'
        : row.onboarding_state === 'verified'
          ? 'verified'
          : 'disabled',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(Array.isArray(row.repository_workflows)
      ? {
          workflows: relationRows(row.repository_workflows).map((workflow) => ({
            workflowRef: String(workflow.allowed_workflow_ref),
            refPattern:
              workflow.allowed_ref_pattern === null ? null : String(workflow.allowed_ref_pattern),
            enabled: Boolean(workflow.enabled),
          })),
        }
      : {}),
    ...(last
      ? {
          lastRun: {
            id: String(last.id),
            githubRunId: String(last.github_run_id),
            status: String(last.status),
            createdAt: String(last.created_at),
            completedAt: last.completed_at === null ? null : String(last.completed_at),
            commitSha: String(last.commit_sha),
            ref: String(last.ref),
          },
        }
      : { lastRun: null }),
  };
}

function mapRun(row: Record<string, unknown>, repositoryFullName?: string) {
  return {
    id: String(row.id),
    repositoryId: String(row.repository_id),
    ...(repositoryFullName ? { repositoryFullName } : {}),
    githubRunId: String(row.github_run_id),
    runAttempt: Number(row.run_attempt),
    commitSha: String(row.commit_sha),
    ref: String(row.ref),
    eventName: String(row.event_name),
    status: row.status,
    reportSchemaVersion: Number(row.report_schema_version),
    startedAt: row.started_at === null ? null : String(row.started_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at),
    workflowRef: row.workflow_ref === null ? null : String(row.workflow_ref),
    coverage: isRecord(row.coverage_redacted) ? row.coverage_redacted : {},
    createdAt: String(row.created_at),
  };
}

function mapFinding(row: Record<string, unknown>) {
  const scanner = scannerApiName(row.scanner);
  const category = row.category === 'dependency' ? 'sca' : row.category;
  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  const advisories = Array.isArray(row.advisories) ? row.advisories : [];
  return {
    id: String(row.id),
    scanId: String(row.scan_id),
    repositoryId: String(row.repository_id),
    repositoryFullName: String(row.repository_full_name),
    githubRunId: String(row.github_run_id),
    runAttempt: Number(row.run_attempt),
    commitSha: String(row.commit_sha),
    ref: String(row.ref),
    fingerprint: String(row.fingerprint).trim(),
    scanner,
    ruleId: String(row.rule_id),
    category,
    severity: row.severity,
    evidenceStatus: row.evidence_status,
    title: String(row.title),
    messageRedacted: String(row.message_redacted ?? ''),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    createdAt: String(row.created_at),
    triage: row.triage,
    evidence,
    advisories,
  };
}

function scannerApiName(value: unknown): unknown {
  if (value === 'osv_scanner') return 'osv';
  if (value === 'composer_audit') return 'composer';
  return value;
}

function mapRunListRow(row: Record<string, unknown>) {
  const repository = relationRows(row.repository)[0];
  return mapRun(row, repository ? String(repository.full_name) : undefined);
}

function mapDatabaseError(
  status: number,
  payload: unknown,
): { status: number; code: string; message: string; retryable: boolean } {
  const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : '';
  const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : '';
  if (code === 'P0002')
    return { status: 404, code: 'NOT_FOUND', message: 'Data tidak ditemukan.', retryable: false };
  if (code === '42501' || status === 403)
    return {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Akses ke data ini tidak diizinkan.',
      retryable: false,
    };
  if (code === '23505' || message === 'REPO_ALREADY_PAIRED') {
    return {
      status: 409,
      code: 'REPO_ALREADY_PAIRED',
      message: 'Repositori sudah terdaftar atau terhubung.',
      retryable: false,
    };
  }
  if (code === 'P0001' && message === 'ONBOARDING_RATE_LIMITED') {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Batas pendaftaran repositori tercapai. Coba lagi nanti.',
      retryable: true,
    };
  }
  if (code === '28000' || status === 401)
    return {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Sesi berakhir. Masuk kembali untuk melanjutkan.',
      retryable: false,
    };
  if (code === '22023' || status === 400)
    return {
      status: 400,
      code: 'INVALID_PAYLOAD',
      message: 'Periksa kembali data yang dikirim.',
      retryable: false,
    };
  if (status === 429)
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Terlalu banyak permintaan. Coba lagi nanti.',
      retryable: true,
    };
  if (status >= 500)
    return {
      status: 503,
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Layanan sementara tidak tersedia.',
      retryable: true,
    };
  return {
    status: 500,
    code: 'INTERNAL',
    message: 'Permintaan tidak dapat diproses.',
    retryable: false,
  };
}

class ApiInputError extends Error {
  constructor(readonly code: 'INVALID_PAYLOAD' | 'INVALID_FILTER') {
    super(code);
  }
}

function scannerDbName(value: string): string {
  if (value === 'osv') return 'osv_scanner';
  if (value === 'composer') return 'composer_audit';
  return value;
}

function parseUuid(value: string | null): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new ApiInputError('INVALID_FILTER');
  return result.data;
}

function parseFilter<T extends string>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: string | null,
): T | null {
  if (!value || value === 'all') return null;
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiInputError('INVALID_FILTER');
  return result.data;
}

function nonceFromCrypto(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSentinelApiHandler(config: ApiConfig) {
  const baseUrl = config.supabaseUrl.replace(/\/+$/u, '');
  const fetcher = config.fetcher ?? fetch;

  async function requestJson(
    path: string,
    authorization: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<{ ok: true; data: unknown } | { ok: false; response: Response; payload: unknown }> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          apikey: config.publishableKey,
          authorization,
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ProviderError();
    }
    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) return { ok: false, response, payload };
    return { ok: true, data: payload };
  }

  async function authUser(request: Request): Promise<{ user: AuthUser; authorization: string }> {
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer\s+[^\s]+$/iu.test(authorization)) throw new AuthError();
    const response = await requestJson('/auth/v1/user', authorization);
    if (!response.ok || !isRecord(response.data) || typeof response.data.id !== 'string')
      throw new AuthError();
    return { user: { id: response.data.id }, authorization };
  }

  async function rest(
    path: string,
    authorization: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<unknown> {
    const response = await requestJson(`/rest/v1/${path}`, authorization, init);
    if (!response.ok) throw new DatabaseError(response.response.status, response.payload);
    return response.data;
  }

  async function rpc(
    name: string,
    body: Record<string, unknown>,
    authorization: string,
  ): Promise<unknown> {
    return await rest(`rpc/${name}`, authorization, { method: 'POST', body });
  }

  async function readBody(request: Request): Promise<unknown> {
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') throw new ApiInputError('INVALID_PAYLOAD');
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > requestBodyMaximum) throw new RequestTooLargeError();
    const reader = request.body?.getReader();
    if (!reader) throw new ApiInputError('INVALID_PAYLOAD');
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > requestBodyMaximum) {
        void reader.cancel().catch(() => undefined);
        throw new RequestTooLargeError();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw new ApiInputError('INVALID_PAYLOAD');
    }
  }

  async function getOrganization(organizationId: string, authorization: string) {
    const result = await rest(
      `organizations?select=id,name,slug&id=eq.${organizationId}&limit=1`,
      authorization,
    );
    const row = Array.isArray(result) ? result[0] : null;
    if (!isRecord(row)) throw new NotFoundError();
    return { id: String(row.id), name: String(row.name), slug: String(row.slug) };
  }

  async function listFindings(
    url: URL,
    authorization: string,
    filters: {
      readonly organizationId: string;
      readonly runId?: string;
      readonly findingId?: string;
    },
  ): Promise<Page<Record<string, unknown>>> {
    const { limit, cursor } = pageParameters(url);
    const severityRaw = url.searchParams.get('severity');
    const scannerRaw = url.searchParams.get('scanner');
    const triageRaw = url.searchParams.get('triage');
    const queryRaw = url.searchParams.get('q')?.trim() ?? '';
    const severity = parseFilter(findingSeverityFilterSchema, severityRaw);
    const scanner = parseFilter(findingScannerFilterSchema, scannerRaw);
    const triage = parseFilter(findingTriageFilterSchema, triageRaw);
    if (queryRaw.length > 100) throw new ApiInputError('INVALID_FILTER');
    const repositoryIdRaw = url.searchParams.get('repositoryId');
    const repositoryId = repositoryIdRaw ? parseUuid(repositoryIdRaw) : null;
    const result = await rpc(
      'list_organization_findings',
      {
        p_org_id: filters.organizationId,
        p_run_id: filters.runId ?? null,
        p_repository_id: repositoryId,
        p_finding_id: filters.findingId ?? null,
        p_severity: severity,
        p_scanner: scanner ? scannerDbName(scanner) : null,
        p_triage: triage,
        p_query: queryRaw || null,
        p_limit: filters.findingId ? 1 : Math.min(limit + 1, 101),
        p_cursor_created_at: cursor?.createdAt ?? null,
        p_cursor_id: cursor?.id ?? null,
      },
      authorization,
    );
    if (!Array.isArray(result) || !result.every(isRecord)) throw new ProviderError();
    const page = paged(
      result as Array<
        Record<string, unknown> & { readonly created_at: string; readonly id: string }
      >,
      limit,
    );
    return { data: page.data.map(mapFinding), page: page.page };
  }

  return async function handle(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return errorResponse(
          requestId,
          405,
          'METHOD_NOT_ALLOWED',
          'Metode tidak didukung.',
          false,
          headers,
        );
      }
      const url = new URL(request.url);
      const route = resolveApiRoute(url.pathname);
      if (!route) {
        return errorResponse(
          requestId,
          404,
          'NOT_FOUND',
          'Endpoint tidak ditemukan.',
          false,
          headers,
        );
      }
      const { user, authorization } = await authUser(request);

      if (route === '/v1/organizations' && request.method === 'GET') {
        const result = await rest(
          `organization_members?select=role,organization:organizations!inner(id,name,slug)&user_id=eq.${user.id}&order=created_at.asc&limit=100`,
          authorization,
        );
        const data = Array.isArray(result)
          ? result.flatMap((row) => {
              if (!isRecord(row)) return [];
              const organization = relationRows(row.organization)[0];
              return organization
                ? [
                    {
                      id: String(organization.id),
                      name: String(organization.name),
                      slug: String(organization.slug),
                      role: row.role,
                    },
                  ]
                : [];
            })
          : [];
        return jsonResponse(200, { data }, headers);
      }

      if (route === '/v1/organizations' && request.method === 'POST') {
        const input = createOrganizationInputSchema.safeParse(await readBody(request));
        if (!input.success) throw new ApiInputError('INVALID_PAYLOAD');
        const data = await rpc('create_organization', { p_name: input.data.name }, authorization);
        return jsonResponse(201, { data }, headers);
      }

      const organizationOverviewMatch = route.match(/^\/v1\/organizations\/([^/]+)\/overview$/u);
      if (organizationOverviewMatch && request.method === 'GET') {
        const organizationId = parseUuid(organizationOverviewMatch[1]);
        await getOrganization(organizationId, authorization);
        const data = await rpc(
          'get_organization_overview',
          { p_org_id: organizationId },
          authorization,
        );
        return jsonResponse(200, { data }, headers);
      }

      const organizationRunsMatch = route.match(/^\/v1\/organizations\/([^/]+)\/runs$/u);
      if (organizationRunsMatch && request.method === 'GET') {
        const organizationId = parseUuid(organizationRunsMatch[1]);
        await getOrganization(organizationId, authorization);
        const { limit, cursor } = pageParameters(url);
        const params = new URLSearchParams({
          select:
            'id,repository_id,github_run_id,run_attempt,commit_sha,ref,event_name,status,report_schema_version,started_at,completed_at,workflow_ref,coverage_redacted,created_at,repository:repositories!inner(id,org_id,full_name)',
          'repository.org_id': `eq.${organizationId}`,
          order: 'created_at.desc,id.desc',
          limit: String(limit + 1),
        });
        if (cursor)
          params.set(
            'or',
            `(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`,
          );
        const result = await rest(`scan_runs?${params}`, authorization);
        if (!Array.isArray(result)) throw new ProviderError();
        const page = paged(
          result.filter(isRecord) as Array<
            Record<string, unknown> & { readonly created_at: string; readonly id: string }
          >,
          limit,
        );
        return jsonResponse(
          200,
          {
            data: page.data.map(mapRunListRow),
            page: page.page,
          },
          headers,
        );
      }

      if (route === '/v1/repositories' && request.method === 'GET') {
        const organizationId = parseUuid(url.searchParams.get('organizationId'));
        await getOrganization(organizationId, authorization);
        const { limit, cursor } = pageParameters(url);
        const params = new URLSearchParams({
          select:
            'id,org_id,full_name,visibility,default_branch,onboarding_state,created_at,updated_at,scan_runs(id,github_run_id,status,commit_sha,ref,completed_at,created_at)',
          org_id: `eq.${organizationId}`,
          order: 'created_at.desc,id.desc',
          limit: String(limit + 1),
          'scan_runs.order': 'created_at.desc,id.desc',
          'scan_runs.limit': '1',
        });
        if (cursor)
          params.set(
            'or',
            `(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`,
          );
        const result = await rest(`repositories?${params}`, authorization);
        if (!Array.isArray(result)) throw new ProviderError();
        const rows = result.filter(isRecord);
        const hasMore = rows.length > limit;
        const selected = hasMore ? rows.slice(0, limit) : rows;
        const data = selected.map(mapRepository);
        const last = selected.at(-1);
        return jsonResponse(
          200,
          {
            data,
            page: {
              limit,
              nextCursor:
                hasMore && last
                  ? encodeCursor({ createdAt: String(last.created_at), id: String(last.id) })
                  : null,
            },
          },
          headers,
        );
      }

      if (route === '/v1/repositories' && request.method === 'POST') {
        const input = registerRepositoryInputSchema.safeParse(await readBody(request));
        if (!input.success) throw new ApiInputError('INVALID_PAYLOAD');
        const data = await rpc(
          'register_repository',
          {
            p_org_id: input.data.organizationId,
            p_full_name: input.data.fullName,
            p_default_branch: input.data.defaultBranch,
          },
          authorization,
        );
        return jsonResponse(201, { data }, headers);
      }

      const pairingMatch = route.match(/^\/v1\/repositories\/([^/]+)\/pairing$/u);
      if (pairingMatch && request.method === 'POST') {
        const repositoryId = parseUuid(pairingMatch[1]);
        const body = await readBody(request);
        if (!isRecord(body) || Object.keys(body).length > 0)
          throw new ApiInputError('INVALID_PAYLOAD');
        const nonce = (config.createNonce ?? nonceFromCrypto)();
        const nonceHash = await sha256Hex(nonce);
        const result = await rpc(
          'issue_repository_pairing',
          { p_repository_id: repositoryId, p_nonce_hash: nonceHash },
          authorization,
        );
        if (!isRecord(result) || typeof result.expiresAt !== 'string') throw new ProviderError();
        return jsonResponse(
          201,
          {
            data: {
              repositoryId,
              nonce,
              expiresAt: result.expiresAt,
              workflowFile,
            },
          },
          headers,
        );
      }

      const repositoryRunsMatch = route.match(/^\/v1\/repositories\/([^/]+)\/runs$/u);
      if (repositoryRunsMatch && request.method === 'GET') {
        const repositoryId = parseUuid(repositoryRunsMatch[1]);
        const { limit, cursor } = pageParameters(url);
        const params = new URLSearchParams({
          select:
            'id,repository_id,github_run_id,run_attempt,commit_sha,ref,event_name,status,report_schema_version,started_at,completed_at,workflow_ref,coverage_redacted,created_at',
          repository_id: `eq.${repositoryId}`,
          order: 'created_at.desc,id.desc',
          limit: String(limit + 1),
        });
        if (cursor)
          params.set(
            'or',
            `(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`,
          );
        const result = await rest(`scan_runs?${params}`, authorization);
        if (!Array.isArray(result)) throw new ProviderError();
        const page = paged(
          result.filter(isRecord) as Array<
            Record<string, unknown> & { readonly created_at: string; readonly id: string }
          >,
          limit,
        );
        return jsonResponse(
          200,
          { data: page.data.map((row) => mapRun(row)), page: page.page },
          headers,
        );
      }

      const repositoryMatch = route.match(/^\/v1\/repositories\/([^/]+)$/u);
      if (repositoryMatch && request.method === 'GET') {
        const repositoryId = parseUuid(repositoryMatch[1]);
        const params = new URLSearchParams({
          select:
            'id,org_id,full_name,visibility,default_branch,onboarding_state,created_at,updated_at,repository_workflows(allowed_workflow_ref,allowed_ref_pattern,enabled),scan_runs(id,github_run_id,status,commit_sha,ref,completed_at,created_at)',
          id: `eq.${repositoryId}`,
          limit: '1',
          'scan_runs.order': 'created_at.desc,id.desc',
          'scan_runs.limit': '1',
        });
        const result = await rest(`repositories?${params}`, authorization);
        const row = Array.isArray(result) && isRecord(result[0]) ? result[0] : null;
        if (!row) throw new NotFoundError();
        const data = mapRepository(row);
        return jsonResponse(200, { data }, headers);
      }

      const runFindingsMatch = route.match(/^\/v1\/runs\/([^/]+)\/findings$/u);
      if (runFindingsMatch && request.method === 'GET') {
        const runId = parseUuid(runFindingsMatch[1]);
        const result = await rest(
          `scan_runs?select=id,repository:repositories!inner(org_id)&id=eq.${runId}&limit=1`,
          authorization,
        );
        const runRow = Array.isArray(result) && isRecord(result[0]) ? result[0] : null;
        const repository = runRow ? relationRows(runRow.repository)[0] : null;
        if (!runRow || !repository) throw new NotFoundError();
        const data = await listFindings(url, authorization, {
          organizationId: String(repository.org_id),
          runId,
        });
        return jsonResponse(200, data, headers);
      }

      const runMatch = route.match(/^\/v1\/runs\/([^/]+)$/u);
      if (runMatch && request.method === 'GET') {
        const runId = parseUuid(runMatch[1]);
        const result = await rest(
          `scan_runs?select=id,repository_id,github_run_id,run_attempt,commit_sha,ref,event_name,status,report_schema_version,started_at,completed_at,workflow_ref,coverage_redacted,created_at,repository:repositories!inner(full_name)&id=eq.${runId}&limit=1`,
          authorization,
        );
        const row = Array.isArray(result) && isRecord(result[0]) ? result[0] : null;
        if (!row) throw new NotFoundError();
        const repository = relationRows(row.repository)[0];
        const data = mapRun(row, repository ? String(repository.full_name) : undefined);
        const executionResult = await rest(
          `scanner_executions?select=scanner,version,status,elapsed_ms,findings_count,skip_reason,error_redacted,ruleset_version,ruleset_digest,ruleset_source,license_gate&scan_id=eq.${runId}&order=scanner.asc`,
          authorization,
        );
        if (!Array.isArray(executionResult)) throw new ProviderError();
        const engines = executionResult.filter(isRecord).map((execution) => ({
          scanner: scannerApiName(execution.scanner),
          version: execution.version,
          status: execution.status,
          elapsedMs: execution.elapsed_ms === null ? null : Number(execution.elapsed_ms),
          findingsCount: Number(execution.findings_count),
          skipReason: execution.skip_reason,
          errorRedacted: execution.error_redacted,
          rulesetVersion: execution.ruleset_version,
          rulesetDigest: execution.ruleset_digest,
          rulesetSource: execution.ruleset_source,
          licenseGate: execution.license_gate,
        }));
        return jsonResponse(200, { data: { ...data, engines } }, headers);
      }

      if (route === '/v1/findings' && request.method === 'GET') {
        const organizationId = parseUuid(url.searchParams.get('organizationId'));
        await getOrganization(organizationId, authorization);
        const data = await listFindings(url, authorization, { organizationId });
        return jsonResponse(200, data, headers);
      }

      const findingMatch = route.match(/^\/v1\/findings\/([^/]+)$/u);
      if (findingMatch && request.method === 'GET') {
        const findingId = parseUuid(findingMatch[1]);
        const organizationId = parseUuid(url.searchParams.get('organizationId'));
        await getOrganization(organizationId, authorization);
        const result = await listFindings(url, authorization, { organizationId, findingId });
        const finding = result.data[0];
        if (!finding) throw new NotFoundError();
        return jsonResponse(200, { data: finding }, headers);
      }

      return errorResponse(
        requestId,
        404,
        'NOT_FOUND',
        'Endpoint tidak ditemukan.',
        false,
        headers,
      );
    } catch (error) {
      if (error instanceof AuthError) {
        return errorResponse(
          requestId,
          401,
          'UNAUTHENTICATED',
          'Masuk kembali untuk mengakses data.',
          false,
          headers,
        );
      }
      if (error instanceof NotFoundError) {
        return errorResponse(requestId, 404, 'NOT_FOUND', 'Data tidak ditemukan.', false, headers);
      }
      if (error instanceof RequestTooLargeError) {
        return errorResponse(
          requestId,
          413,
          'PAYLOAD_TOO_LARGE',
          'Isi permintaan terlalu besar.',
          false,
          headers,
        );
      }
      if (error instanceof ApiInputError) {
        return errorResponse(
          requestId,
          400,
          error.code,
          'Periksa kembali data permintaan.',
          false,
          headers,
        );
      }
      if (error instanceof DatabaseError) {
        const mapped = mapDatabaseError(error.status, error.payload);
        return errorResponse(
          requestId,
          mapped.status,
          mapped.code,
          mapped.message,
          mapped.retryable,
          headers,
        );
      }
      if (error instanceof ProviderError) {
        return errorResponse(
          requestId,
          503,
          'PROVIDER_UNAVAILABLE',
          'Layanan sementara tidak tersedia.',
          true,
          headers,
        );
      }
      return errorResponse(
        requestId,
        500,
        'INTERNAL',
        'Permintaan tidak dapat diproses.',
        false,
        headers,
      );
    }
  };
}

class AuthError extends Error {}
class NotFoundError extends Error {}
class RequestTooLargeError extends Error {}
class ProviderError extends Error {}
class DatabaseError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super('Database request failed');
  }
}
