# AGENTS.md — Sentinel Security Scanner

## Project mission
Build a professional, deterministic repository source-code security scanner MVP for PHP and Node.js/TypeScript that users run via a GitHub Actions workflow installed in their own repositories. Store sanitized findings, scanner coverage and audit history in Supabase; present evidence in a responsive React/Vite dashboard. **No generative AI is used by Sentinel at runtime.**

## Specification order
1. `docs/specs/Sentinel_Security_Scanner_PRD_v1_1.docx`
2. `docs/specs/Sentinel_Security_Scanner_FSD_v1_1.docx`
3. `docs/specs/Sentinel_Security_Scanner_ERD_DBA_v1_1.docx`
4. `docs/specs/Sentinel_Security_Scanner_TDD_API_Spec_v1_1.docx`
5. `docs/specs/Sentinel_Security_Scanner_Brand_UIUX_Design_System_v1_1.docx`
6. `docs/specs/Sentinel_Security_Scanner_UX_Research_Final_v1_2.docx`
7. `docs/specs/Sentinel_Security_Scanner_REA_UX_Investigation_Final_v1_2.docx`
8. `docs/specs/Sentinel_Security_Scanner_BRD_v1_1.docx`

Text-only Markdown mirrors are available at `docs/specs/markdown/` for direct consumption; diagrams remain in original DOCX. Do not invent unreadable DOCX contents. Treat v1.2 as final for UX and REA; v1.1 as final for system requirements. Document conflicts in `docs/DECISIONS.md` and do not silently alter the baseline.

## Locked technical choices
- Frontend: React + Vite + TypeScript strict; Tailwind CSS; shadcn/ui; Lucide; responsive 360px to 1440px.
- Design: Navy `#102A43`, teal `#0D9488`, graphite `#334155`, off-white `#F8FAFC`; Inter UI and JetBrains Mono for code; logo Concept 1 reference, SVG master not yet final.
- Auth/API/data: Supabase Auth, PostgreSQL/RLS, Supabase Edge Functions (Deno/TS), SQL migrations; frontend only publishable key.
- Scanner workflow: installed and owned by target repository maintainer; GitHub-hosted Actions, separate scan and report jobs, minimal permissions.
- Scanners: Semgrep Community Edition with license-reviewed rules, OSV-Scanner, Gitleaks CLI, Composer Audit if lockfile present.
- Findings: deterministic detections; source tool, rule ID, package/version, commit SHA, evidence status, engine coverage and sanitized references.

## Explicit exclusions (MVP)
**NO AI agents/models/API/remediation; NO Redis; NO BullMQ; NO NestJS/Next.js; NO dedicated VPS/central scanner worker; NO arbitrary GitHub URL probe; NO ZIP upload; NO URL scanning; NO stored raw repositories, raw source or matched secrets.** Never use the existing UMKM/Hermes/Discord VPS.

## Security invariants
1. Repository name/URL entered by a user is never sufficient proof of repository control. Use GitHub OIDC identity claims bound to a short-lived nonce and exact workflow identity.
2. GitHub OIDC proves workflow identity, **not** authenticity/correctness of findings; show provenance accordingly.
3. Supabase non-user JWT ingestion path must validate GitHub token signature, issuer, JWKS, audience, expiry, repo/workflow/run claims, pairing and idempotency before all privileged writes.
4. Ingestion atomic in Postgres transaction; no partial success after validation failures.
5. Supabase RLS, grants, tenant-isolation tests and least privilege are mandatory; no service-role key in web or customer workflow.
6. Never execute untrusted repository build/test/install scripts in privileged jobs. Do not use `pull_request_target` in P0. Avoid running arbitrary repository code.
7. Redact secret matches, source lines containing tokens, OIDC bearer token, API keys and sensitive debug logs before artifacts/DB/export.
8. Scanner partial/skipped/failed/unknown ≠ safe; never assert `100% secure` or confirmed exploitation without evidence.
9. Record source/engine/ruleset versions, license gate and evidence provenance.

## Engineering workflow
- Implement only the current prompt phase in `SENTINEL_CODEX_STEP_BY_STEP.md`; no scope creep.
- Start with typed mocks for UI; do not claim that mock data comes from GitHub or real scanner results.
- Unit tests for adapters/redaction, RLS tests for tenant isolation, OIDC negative tests, idempotency and accessibility checks before release.
- After each phase report: changed files, design decisions, commands run, pass/fail/NOT VERIFIED, remaining security risks and suggested commit.
- Never auto-deploy cloud, push user workflows, or create paid infrastructure without user approval.
- If source documents are not accessible/readable, say so; request Markdown export instead of inventing details.

## Code quality
Simple modules, strict TS, typed API contracts (Zod), small composable UI components, keyboard/ARIA and reduced-motion support. Use semantic tokens instead of scattered inline HEX values. Avoid generic AI-looking design, fake dashboard metrics, excessive shadows or glitter gradients.
