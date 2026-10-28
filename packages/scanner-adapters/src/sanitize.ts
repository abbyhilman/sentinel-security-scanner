const secretAssignment =
  /(\b(?:[a-z0-9]+[_-])*(?:authorization|password|passwd|secret|token|api[_-]?key|access[_-]?key|service[_-]?role[_-]?key|private[_-]?key|database[_-]?url|db[_-]?url|connection[_-]?string)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;
const privateKeyBlock =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/giu;
const incompletePrivateKeyBlock = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*/giu;
const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu;
const jwtToken = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu;
const providerToken =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,})\b/gu;
const awsAccessKey = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu;
const commonProviderToken = /\b(?:sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/gu;
const credentialUrl = /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/giu;
const htmlDangerousBlock = /<\s*(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu;
const htmlTag = /<\/?[A-Za-z][^>]*>/gu;
const absoluteWindowsPath = /\b[a-z]:[\\/](?:[^\s"'<>]+[\\/]?)+/giu;
const absoluteUnixPath = /\/(?:home|Users|workspace|workspaces|tmp|root|runner|mnt)\/[^\s"'<>]*/giu;

const allowedReferenceHosts = new Set([
  'cve.org',
  'cveawg.mitre.org',
  'github.com',
  'getcomposer.org',
  'nvd.nist.gov',
  'osv.dev',
  'packagist.org',
  'semgrep.dev',
]);

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => !isControlCharacter(character))
    .join('');
}

function truncateText(value: string, maxLength: number): string {
  let result = '';
  let codeUnits = 0;
  for (const character of value) {
    if (codeUnits + character.length > maxLength) break;
    result += character;
    codeUnits += character.length;
  }
  return result;
}

export function sanitizeText(value: unknown, maxLength = 4_000, fallback = ''): string {
  if (typeof value !== 'string') return fallback;

  const withoutMarkup = value
    .replace(privateKeyBlock, '[REDACTED PRIVATE KEY]')
    .replace(incompletePrivateKeyBlock, '[REDACTED PRIVATE KEY]')
    .replace(secretAssignment, '$1[REDACTED]')
    .replace(bearerToken, 'Bearer [REDACTED]')
    .replace(jwtToken, '[REDACTED JWT]')
    .replace(providerToken, '[REDACTED TOKEN]')
    .replace(awsAccessKey, '[REDACTED ACCESS KEY]')
    .replace(commonProviderToken, '[REDACTED TOKEN]')
    .replace(credentialUrl, '$1[REDACTED]@')
    .replace(absoluteWindowsPath, '[ABSOLUTE PATH]')
    .replace(absoluteUnixPath, '[ABSOLUTE PATH]')
    .replace(htmlDangerousBlock, ' [HTML BLOCK REMOVED] ')
    .replace(htmlTag, ' ');
  const normalized = stripControlCharacters(withoutMarkup).replace(/\s+/gu, ' ').trim();
  const sanitized = truncateText(normalized, maxLength);

  return sanitized || fallback;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/gu, '/').replace(/\/{2,}/gu, '/');
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-z]:\//iu.test(value) || /^\/\//u.test(value);
}

export function normalizeRepositoryPath(value: unknown, checkoutRoot?: string): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || Array.from(value).some(isControlCharacter))
    return undefined;

  let path = normalizeSlashes(value.trim());
  if (checkoutRoot) {
    const root = normalizeSlashes(checkoutRoot.trim()).replace(/\/$/u, '');
    const pathForCompare = path.toLowerCase();
    const rootForCompare = root.toLowerCase();
    if (pathForCompare === rootForCompare) return undefined;
    if (pathForCompare.startsWith(`${rootForCompare}/`)) {
      path = path.slice(root.length + 1);
    } else if (isAbsolutePath(path)) {
      return undefined;
    }
  } else if (isAbsolutePath(path)) {
    return undefined;
  }

  path = path.replace(/^\.\//u, '');
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.')) {
    return undefined;
  }

  const normalized = segments.join('/');
  if (normalized.length > 1_024 || isAbsolutePath(normalized)) return undefined;
  if (sanitizeText(normalized, 1_024).includes('[REDACTED')) return undefined;
  return normalized;
}

export function sanitizeReferenceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4_096) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !allowedReferenceHosts.has(url.hostname.toLowerCase()) ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return undefined;
    }
    url.search = '';
    url.hash = '';
    const normalized = url.toString();
    return normalized.length <= 2_048 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function uniqueStrings(values: readonly unknown[], maxItems = 100): string[] {
  const result = new Map<string, string>();
  for (const value of values) {
    const safe = sanitizeText(value, 120);
    if (safe) result.set(safe.toLowerCase(), safe);
    if (result.size >= maxItems) break;
  }
  return [...result.values()];
}
