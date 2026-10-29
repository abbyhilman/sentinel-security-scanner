# sentinel-ingest

`sentinel-ingest` accepts sanitized reports from the owner-installed GitHub Actions workflow. The bearer token is a GitHub Actions OIDC token, not a Supabase user JWT. Supabase's platform JWT check is disabled for this function only; `handler.ts` verifies GitHub's fixed issuer, RS256 signature/JWKS, exact project audience, time claims, repository/workflow/run identity, and report identity before making the server-only RPC request.

The handler enforces a 4 MiB body limit, JSON content type, the shared strict Zod schema, a run-tuple idempotency key, report-body SHA-256, redaction defense-in-depth, and generic error responses. It strips the plaintext pairing nonce and passes only its SHA-256 hash to `ingest_scan_report`. The RPC binds a pending repository on its first valid report and inserts the scan, scanner executions, findings/evidence/advisories, receipt, coverage, and audit event in one PostgreSQL transaction.

## Local shell check without Docker

From the repository root, run:

```powershell
pnpm run sentinel:ingest:check
```

This runs the Node/Vitest verification suite with an ephemeral local RS256 key and a mocked RPC. It does not require Docker, Deno, Supabase credentials, or a database. It checks the HTTP handler and JWT verifier only. It is not an Edge Runtime or PostgreSQL integration test.

## Deploy and database notes

- `verify_jwt = false` is scoped to this function. Do not disable JWT checks for other functions.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function's secret environment. It is never read by the workflow or browser app.
- Apply the timestamped SQL migration before deploying the function. This repository does not apply it to a hosted Supabase project automatically.
- Running `supabase functions serve` or the local database suite needs Docker/a compatible container runtime. A hosted function deploy can use the Supabase API without starting the local stack, but it changes the hosted project and requires explicit approval.
- GitHub OIDC authenticates a workflow identity; it does not verify the truth of reported findings.

