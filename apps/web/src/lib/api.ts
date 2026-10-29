import { apiErrorSchema } from '@sentinel/contracts';
import type { ZodType } from '@sentinel/contracts';
import { publicEnv, supabase } from './supabase';

type Output<Schema extends ZodType<unknown>> = Schema extends ZodType<infer Value> ? Value : never;

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

async function send<Schema extends ZodType<unknown>>(
  path: string,
  schema: Schema,
  options: RequestOptions,
): Promise<Output<Schema>> {
  if (!supabase || !publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) {
    throw new ApiError('NOT_CONFIGURED', 503, 'Koneksi Supabase belum dikonfigurasi.');
  }

  const { data: initial } = await supabase.auth.getSession();
  if (!initial.session) {
    window.dispatchEvent(new Event('sentinel:session-expired'));
    throw new ApiError('UNAUTHENTICATED', 401, 'Sesi masuk sudah berakhir.');
  }

  const url = `${publicEnv.supabaseUrl.replace(/\/+$/u, '')}/functions/v1/sentinel-api${path}`;
  const execute = (accessToken: string) =>
    fetch(url, {
      method: options.method ?? 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        apikey: publicEnv.supabasePublishableKey!,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(15_000),
    });

  let response = await execute(initial.session.access_token);
  if (response.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) response = await execute(refreshed.session.access_token);
    if (!refreshed.session || response.status === 401)
      window.dispatchEvent(new Event('sentinel:session-expired'));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      'INVALID_RESPONSE',
      502,
      'Layanan mengirim respons yang tidak dapat dibaca.',
      true,
    );
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    const details = parsedError.success ? parsedError.data.error : null;
    throw new ApiError(
      details?.code ?? 'REQUEST_FAILED',
      response.status,
      details?.message ?? 'Permintaan belum dapat diproses.',
      details?.retryable ?? response.status >= 500,
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      502,
      'Format data dari layanan tidak sesuai kontrak.',
      true,
    );
  }
  return parsed.data as Output<Schema>;
}

export function apiGet<Schema extends ZodType<unknown>>(path: string, schema: Schema) {
  return send(path, schema, { method: 'GET' });
}

export function apiPost<Schema extends ZodType<unknown>>(
  path: string,
  schema: Schema,
  body: unknown,
) {
  return send(path, schema, { method: 'POST', body });
}
