# Sentinel database data dictionary

**Baseline:** ERD/DBA v1.1, aligned with decisions D-004 through D-006 and D-013 through D-018 on 28 October 2026.
**Migrations:** `supabase/migrations/20261028000100_initial_schema.sql`, `supabase/migrations/20261028000200_atomic_report_ingestion.sql`
**Scope:** tenant schema/RLS and Stage 06 atomic ingestion. The initial schema is applied to the linked hosted project; the Stage 06 migration is still pending and has not been pushed.

## Canonical entities

| Table | Purpose and key relationships |
| --- | --- |
| `profiles` | Minimal user profile keyed to `auth.users.id`; users can read and update only their own display name. |
| `organizations` | Tenant root with case-insensitive unique slug. |
| `organization_members` | Organization membership and `owner` / `maintainer` / `viewer` role. Membership writes are reserved for the authenticated API layer. |
| `repositories` | Tenant repository record; GitHub ID may remain null while onboarding is pending. A verified repository requires a GitHub ID. |
| `repository_pairings` | Hashed one-time pairing nonce, expiry, consumption time, and lifecycle status. Only trusted server functions can read or write it. |
| `repository_workflows` | Exact workflow identity and optional ref pattern allowlist. User access is read-only. |
| `scan_runs` | GitHub run/attempt snapshot with commit, ref, event, validated `workflow_ref`, sanitized coverage, report schema version, status, and payload digest. Run tuple is unique per repository. |
| `scanner_executions` | Per-run engine status, tool version, elapsed time, counts, skip reason, redacted error, and ruleset/license provenance. Unique per engine and run. |
| `findings` | Immutable finding snapshot per run with stable fingerprint, scanner/rule, category, severity, evidence status, redacted message, and optional HTTPS source link. |
| `finding_evidence` | Sanitized repository-relative paths, line bounds, bounded redacted excerpt, and optional package/version. |
| `finding_triage` | Append-only disposition history keyed by repository and fingerprint; only owners and maintainers may append as themselves. |
| `ingestion_receipts` | Server-only idempotency receipt, payload digest, and digest of selected OIDC claims; no raw token. |
| `dependency_inventory` | Per-run package/version/lockfile inventory. Unknown versions may be null. |
| `advisories` | Global advisory records keyed by source and source ID; authenticated users have read-only access. |
| `advisory_aliases` | Normalized CVE/GHSA/OSV aliases for advisory deduplication. |
| `finding_advisories` | Many-to-many correlation between finding snapshots and advisory records. |
| `audit_events` | Server-written organization audit record with redacted JSON metadata; only organization owners can read it. |
| `scan_artifacts` | Optional metadata for private, sanitized artifacts; the table does not store artifact contents or signed URLs. |

## Name mappings approved for Stage 03

| Implementation prompt name | Canonical ERD entity |
| --- | --- |
| `scan_engine_runs` | `scanner_executions` |
| `finding_occurrences` | `findings` snapshots per scan; stable fingerprints connect snapshots over time |
| `advisory_refs` | `advisories`, `advisory_aliases`, and `finding_advisories` |
| `triage_history` | `finding_triage` |
| `ingestion_events` | `ingestion_receipts` for idempotency and `audit_events` for audit history |
| `scanner_rule_catalog` | Version-controlled source manifest, not a database table |

## Status and role vocabulary

- Run: `awaiting_report`, `running`, `completed`, `partial`, `failed`, `cancelled`, `rejected`.
- Engine: `success`, `skipped`, `failed`, `timed_out`; skipped rows require a reason.
- Organization role: `owner`, `maintainer`, `viewer`.
- Repository onboarding: `pending`, `verified`, `disabled`.
- Pairing: `pending`, `consumed`, `expired`, `revoked`; only one pending pairing per repository.
- Finding category: `sast`, `secret`, `dependency`, `unknown`. Pairing/category enum values are implementation interpretations where the ERD does not enumerate allowed values; D-005 records this for contract review.
- Triage: `open`, `acknowledged`, `investigating`, `false_positive`, `accepted_risk`, `fixed`. A reopen is a new `open` event.

## Access model

- Anonymous has no access to the `public` schema or table grants.
- Authenticated users read organization-scoped rows through RLS membership helpers. A user cannot see another tenant's repositories, scan runs, findings, evidence, triage, dependency inventory, correlations, or artifact metadata.
- Authenticated users may update only their own `profiles.display_name` and append triage as an owner or maintainer with a matching actor ID. Triages cannot be updated or deleted.
- Authenticated users cannot insert or mutate scan runs, scanner executions, findings, pairing state, workflow allowlists, receipts, or audit events directly.
- `service_role` cannot directly insert or mutate the Stage 06 ingestion tables; it can execute only the restricted atomic ingestion RPC for this write path. Keep the key in Edge Function secrets, never in the web bundle or customer-owned workflow.
- `private` schema helpers use `SECURITY DEFINER`, an empty `search_path`, fully qualified objects, and membership joins that avoid RLS recursion. The schema is not included in the PostgREST exposed schemas.
- `scan_runs.workflow_ref` records the exact workflow claim, and `repository_workflows` allows only the exact workflow/ref established at pairing. The first binding also requires the template path on the configured default branch.

## Data limits and privacy

- Hash columns validate lower-case SHA-256 hex. Pairing stores only a nonce hash; ingestion stores only payload/claim digests.
- Evidence paths reject absolute paths, drive prefixes, backslashes, and `..` path segments. Excerpts are capped at 4,096 UTF-8 bytes as a provisional storage bound; confirm the final product limit before release.
- Finding messages and engine errors are capped at 4,000 characters. The ingestion handler redacts common credential formats and rejects sensitive text in identity/path fields; this defense-in-depth does not replace the Stage 04 sanitizer or prove all secrets can be recognized.
- Coverage is stored as sanitized JSON on `scan_runs`. The version 1 report has no package inventory, so `dependency_inventory` rows are not fabricated from advisory findings.
- Artifacts contain metadata only. Raw source, full scanner output, matched secrets, bearer tokens, and service keys must not be stored.
- No retention period is configured in this migration. Retention and deletion policy remain open pending D-011.

## Local commands

From the repository root, after installing Supabase CLI and starting its local dependencies:

```powershell
pnpm exec supabase start
pnpm exec supabase db reset
pnpm exec supabase test db
```

The user applied migration `20261028000100` to the linked Supabase project. SQL Editor checks confirmed the 18 Stage 03 tables have RLS enabled and the tenant suite passed. Migration `20261028000200` and `sentinel-ingest` have not been applied/deployed. Docker and Deno are not available locally, so local database/Edge Runtime behavior is **NOT VERIFIED**. Use `pnpm run sentinel:ingest:check` for the isolated Node shell suite; it does not replace a Supabase Edge Runtime or PostgreSQL integration test. Do not run `supabase/seed.sql` against the hosted project; it contains synthetic local-only accounts.
