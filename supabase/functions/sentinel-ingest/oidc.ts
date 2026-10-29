export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_OIDC_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';

const MAX_TOKEN_LENGTH = 16_384;
const MAX_JWKS_BYTES = 1_048_576;
const CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN_LIFETIME_SECONDS = 3_600;

export class OidcTokenError extends Error {
  constructor() {
    super('The GitHub Actions identity token is invalid.');
    this.name = 'OidcTokenError';
  }
}

export class OidcUnavailableError extends Error {
  constructor() {
    super('GitHub OIDC keys are temporarily unavailable.');
    this.name = 'OidcUnavailableError';
  }
}

export interface GitHubOidcClaims {
  readonly iss: typeof GITHUB_OIDC_ISSUER;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly nbf: number;
  readonly repository_id: string;
  readonly repository: string;
  readonly workflow_ref: string;
  readonly run_id: string;
  readonly run_attempt: string;
  readonly sha: string;
  readonly ref: string;
  readonly event_name: 'push' | 'workflow_dispatch';
}

interface GitHubJsonWebKey extends JsonWebKey {
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
}

interface JsonWebKeySetResponse {
  readonly keys?: readonly GitHubJsonWebKey[];
}

interface CachedKeys {
  readonly keys: ReadonlyMap<string, JsonWebKey>;
  readonly expiresAt: number;
}

export interface GitHubOidcVerifierOptions {
  readonly audience: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new OidcTokenError();
  const padded =
    value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new OidcTokenError();
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function decodeJsonSegment(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(value)),
    );
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new OidcTokenError();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new OidcTokenError();
  }
}

function readBoundedStringClaim(
  claims: Record<string, unknown>,
  name: string,
  maximumLength: number,
): string {
  const value = claims[name];
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new OidcTokenError();
  }
  return value;
}

function readPositiveIntegerClaim(claims: Record<string, unknown>, name: string): number {
  const value = claims[name];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new OidcTokenError();
  }
  return value;
}

function parseIdentityClaims(
  claims: Record<string, unknown>,
  expectedAudience: string,
  nowSeconds: number,
): GitHubOidcClaims {
  const issuer = readBoundedStringClaim(claims, 'iss', 100);
  const audience = readBoundedStringClaim(claims, 'aud', 500);
  const exp = readPositiveIntegerClaim(claims, 'exp');
  const iat = readPositiveIntegerClaim(claims, 'iat');
  const nbf = readPositiveIntegerClaim(claims, 'nbf');
  const repositoryId = readBoundedStringClaim(claims, 'repository_id', 32);
  const repository = readBoundedStringClaim(claims, 'repository', 200);
  const workflowRef = readBoundedStringClaim(claims, 'workflow_ref', 512);
  const runId = readBoundedStringClaim(claims, 'run_id', 32);
  const runAttempt = readBoundedStringClaim(claims, 'run_attempt', 8);
  const sha = readBoundedStringClaim(claims, 'sha', 64);
  const ref = readBoundedStringClaim(claims, 'ref', 512);
  const eventName = readBoundedStringClaim(claims, 'event_name', 64);

  if (
    issuer !== GITHUB_OIDC_ISSUER ||
    audience !== expectedAudience ||
    exp < nowSeconds - CLOCK_SKEW_SECONDS ||
    nbf > nowSeconds + CLOCK_SKEW_SECONDS ||
    iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    exp <= iat ||
    exp - iat > MAX_TOKEN_LIFETIME_SECONDS ||
    iat < nowSeconds - MAX_TOKEN_LIFETIME_SECONDS - CLOCK_SKEW_SECONDS ||
    !/^\d{1,20}$/u.test(repositoryId) ||
    BigInt(repositoryId) < 1n ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !/^\d{1,20}$/u.test(runId) ||
    BigInt(runId) < 1n ||
    !/^\d{1,3}$/u.test(runAttempt) ||
    Number(runAttempt) < 1 ||
    Number(runAttempt) > 100 ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(sha) ||
    !/^refs\/heads\/[A-Za-z0-9_./-]{1,480}$/u.test(ref) ||
    !['push', 'workflow_dispatch'].includes(eventName) ||
    !workflowRef.includes('/.github/workflows/') ||
    !workflowRef.endsWith(`@${ref}`)
  ) {
    throw new OidcTokenError();
  }

  return {
    iss: GITHUB_OIDC_ISSUER,
    aud: audience,
    exp,
    iat,
    nbf,
    repository_id: BigInt(repositoryId).toString(),
    repository,
    workflow_ref: workflowRef,
    run_id: BigInt(runId).toString(),
    run_attempt: String(Number(runAttempt)),
    sha,
    ref,
    event_name: eventName as GitHubOidcClaims['event_name'],
  };
}

function getMaxAgeSeconds(response: Response): number {
  const cacheControl = response.headers.get('cache-control') ?? '';
  const match = /(?:^|,)\s*max-age=(\d+)/iu.exec(cacheControl);
  const seconds = match ? Number(match[1]) : 300;
  return Math.max(0, Math.min(seconds, 3_600));
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JWKS_BYTES) {
    throw new OidcUnavailableError();
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JWKS_BYTES) {
        await reader.cancel();
        throw new OidcUnavailableError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof OidcUnavailableError) throw error;
    throw new OidcUnavailableError();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new OidcUnavailableError();
  }
}

function parseJwks(value: unknown): ReadonlyMap<string, GitHubJsonWebKey> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as JsonWebKeySetResponse).keys)
  ) {
    throw new OidcUnavailableError();
  }
  const keys = new Map<string, GitHubJsonWebKey>();
  for (const candidate of (value as JsonWebKeySetResponse).keys ?? []) {
    if (
      typeof candidate.kid === 'string' &&
      candidate.kid.length > 0 &&
      candidate.kid.length <= 200 &&
      candidate.kty === 'RSA' &&
      (candidate.use === undefined || candidate.use === 'sig') &&
      (candidate.alg === undefined || candidate.alg === 'RS256')
    ) {
      if (keys.has(candidate.kid)) throw new OidcUnavailableError();
      keys.set(candidate.kid, candidate);
    }
  }
  if (keys.size === 0 || keys.size > 100) throw new OidcUnavailableError();
  return keys;
}

export function createGitHubOidcVerifier(options: GitHubOidcVerifierOptions) {
  if (!options.audience.startsWith('https://')) {
    throw new Error('The expected GitHub OIDC audience must be an HTTPS URL.');
  }
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => Date.now());
  let cachedKeys: CachedKeys | undefined;

  async function fetchKeys(forceRefresh = false): Promise<ReadonlyMap<string, GitHubJsonWebKey>> {
    const currentTime = now();
    if (!forceRefresh && cachedKeys && cachedKeys.expiresAt > currentTime) return cachedKeys.keys;

    let response: Response;
    try {
      response = await fetcher(GITHUB_OIDC_JWKS_URL, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new OidcUnavailableError();
    }
    if (!response.ok) throw new OidcUnavailableError();

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBoundedResponse(response));
    } catch (error) {
      if (error instanceof OidcUnavailableError) throw error;
      throw new OidcUnavailableError();
    }
    const keys = parseJwks(parsed);
    cachedKeys = { keys, expiresAt: currentTime + getMaxAgeSeconds(response) * 1_000 };
    return keys;
  }

  return async function verifyGitHubOidcToken(token: string): Promise<GitHubOidcClaims> {
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) throw new OidcTokenError();
    const parts = token.split('.');
    if (parts.length !== 3) throw new OidcTokenError();

    const header = decodeJsonSegment(parts[0]!);
    if (
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      header.kid.length === 0 ||
      header.kid.length > 200 ||
      (header.typ !== undefined && header.typ !== 'JWT') ||
      header.crit !== undefined ||
      header.b64 !== undefined ||
      header.jku !== undefined ||
      header.jwk !== undefined ||
      header.x5u !== undefined ||
      header.x5c !== undefined
    ) {
      throw new OidcTokenError();
    }
    const claims = decodeJsonSegment(parts[1]!);
    const signature = decodeBase64Url(parts[2]!);
    const identity = parseIdentityClaims(claims, options.audience, Math.floor(now() / 1_000));

    let keys = await fetchKeys();
    let jwk = keys.get(header.kid);
    if (!jwk) {
      keys = await fetchKeys(true);
      jwk = keys.get(header.kid);
    }
    if (!jwk) throw new OidcTokenError();

    let publicKey: CryptoKey;
    try {
      publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
    } catch {
      throw new OidcTokenError();
    }
    const keyAlgorithm = publicKey.algorithm;
    if (
      keyAlgorithm.name !== 'RSASSA-PKCS1-v1_5' ||
      !('modulusLength' in keyAlgorithm) ||
      typeof keyAlgorithm.modulusLength !== 'number' ||
      keyAlgorithm.modulusLength < 2_048
    ) {
      throw new OidcTokenError();
    }

    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    let isValid: boolean;
    try {
      isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        toArrayBuffer(signature),
        toArrayBuffer(signingInput),
      );
    } catch {
      throw new OidcTokenError();
    }
    if (!isValid) throw new OidcTokenError();
    return identity;
  };
}
