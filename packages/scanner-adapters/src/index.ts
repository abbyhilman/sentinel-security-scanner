export { detectRepositoryCoverage } from './coverage';
export type { RepositoryFileDescriptor } from './coverage';
export { parseComposerAuditJson } from './composer';
export { parseGitleaksJson } from './gitleaks';
export { parseOsvJson } from './osv';
export { deduplicateAdvisoryFindings, deriveReportStatus } from './report';
export { parseSemgrepJson } from './semgrep';
export { normalizeRepositoryPath, sanitizeReferenceUrl, sanitizeText, sha256Hex } from './sanitize';
export type { AdapterParseResult, ParserContext } from './common';
