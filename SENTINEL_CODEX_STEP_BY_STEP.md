# SENTINEL SECURITY SCANNER — CODEX IMPLEMENTATION PLAYBOOK

**Version:** 1.0 · 27 Oktober 2026  
**Fokus:** MVP Source Code Scanner untuk PHP dan Node.js (JavaScript/TypeScript)  
**Mode kerja:** Satu tahap → implementasi → tes → review → commit → tahap berikutnya.

> **Mulai di sini.** Dokumen ini berisi instruksi yang bisa langsung di-*copy-paste* ke Codex. Prompt sengaja dipecah agar setiap tahap menghasilkan kode yang bisa diperiksa, bukan satu proyek besar yang selesai tanpa pengujian.
>
> **Tidak ada AI dalam runtime Sentinel.** Codex hanya alat untuk *menulis kode* aplikasi. Aplikasi Sentinel sendiri hanya memakai deterministic scanners dan rule/advisory metadata. Tidak menggunakan model generatif, AI agent, OpenAI API, Redis, BullMQ, VPS/worker terpusat, URL scanning atau ZIP upload pada MVP.

---

## A. Dokumen sumber dan prioritas

Paket ZIP yang menyertai panduan ini sudah berisi **DOCX asli** di `docs/specs/` dan **versi teks Markdown** di `docs/specs/markdown/`, agar Codex bisa langsung membaca spesifikasinya. Markdown adalah salinan tekstual untuk coding agent (diagram gambar tetap tersedia di DOCX). Jika menemukan perbedaan, rujuk DOCX asli; jangan mengarang konten yang tidak terbaca.

| Prioritas | Dokumen | Peran |
|---|---|---|
| 1 | `Sentinel_Security_Scanner_PRD_v1_1.docx` | Scope P0/P1/P2 dan acceptance criteria |
| 2 | `Sentinel_Security_Scanner_FSD_v1_1.docx` | Functional rules dan status lifecycle |
| 3 | `Sentinel_Security_Scanner_ERD_DBA_v1_1.docx` | Entity, RLS, integritas dan transaction design |
| 4 | `Sentinel_Security_Scanner_TDD_API_Spec_v1_1.docx` | Arsitektur, auth, OIDC, API contract |
| 5 | `Sentinel_Security_Scanner_Brand_UIUX_Design_System_v1_1.docx` | Logo Concept 1, warna, tipografi, komponen |
| 6 | **`Sentinel_Security_Scanner_UX_Research_Final_v1_2.docx`** | UX review final dan screen/state specs |
| 7 | **`Sentinel_Security_Scanner_REA_UX_Investigation_Final_v1_2.docx`** | Rencana REA/UX; bukan bukti investigasi selesai |
| 8 | `Sentinel_Security_Scanner_BRD_v1_1.docx` | Business goals, constraints |

**Aturan konflik:** Dokumen `v1.2` mengungguli `v1.1` untuk UX/REA; untuk arsitektur gunakan PRD/FSD/ERD/TDD `v1.1`. Jika ada pertentangan antarspesifikasi, **jangan diam-diam memilih**: tulis `docs/DECISIONS.md` dengan konflik, rekomendasi, alasan, dan risiko. Setelah keputusan stabil, implementasikan dan uji.

### Keputusan yang tidak boleh diubah secara otomatis

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, shadcn/ui, Lucide, TanStack Query (bila dibutuhkan), React Router (bila dibutuhkan).
- **Backend ringan:** Supabase Edge Functions (Deno/TypeScript), Supabase Auth, PostgreSQL dengan RLS; bukan NestJS.
- **Worker:** GitHub Actions *di dalam repository milik pengguna yang dipindai*, bukan satu repository pusat untuk menjalankan arbitrary customer code.
- **Scanner:** Semgrep Community Edition dengan rules yang boleh digunakan, OSV-Scanner, Gitleaks CLI, Composer Audit saat ada PHP lockfile.
- **Mode scan:** Source code saja; hanya repository yang pemiliknya memasang workflow; *tidak* ada ZIP/URL scan di MVP.
- **No AI in product**, **no Redis/BullMQ**, **no dedicated VPS**; VPS UMKM/Hermes/Discord tidak boleh disentuh.
- **Brand:** Sentinel Security Scanner; navy `#102A43`, teal `#0D9488`, graphite `#334155`, off-white `#F8FAFC`, Inter dan JetBrains Mono. Logo Concept 1; SVG produksi belum final.
- **Privasi:** raw source repository, raw secret, credential, bearer token, dan raw OIDC JWT tidak disimpan dalam Supabase/log/export.

---

## B. Persiapan sebelum buka Codex

1. Siapkan folder **baru** bernama `sentinel-security-scanner` dan lakukan `git init`. Jangan menggunakan repository UMKM/Hermes/Discord.
2. Buat repository GitHub **milik Sentinel** hanya untuk source web/API/templates/CI pengembangan. Saat testing scanner, gunakan repository fixture **terpisah** (milik sendiri) dan aktifkan workflow di fixture itu.
3. Pilih **Node.js LTS** yang didukung dependensi saat diimplementasikan, `pnpm`, Git, Supabase CLI. Untuk database lokal, Docker hanya bila perlu Supabase local stack. **Jangan memaksa menginstal Docker** bila hanya melakukan tahap UI mock.
4. Untuk cloud staging nanti, buat proyek Supabase Free dan simpan URL serta **publishable key** di local `.env`; jangan commit `.env`. Secret/service key hanya di lingkungan server Supabase, **tidak** di `VITE_*`, tidak di workflow target.
5. Buat akun Vercel/Netlify hanya saat tahap deployment. Periksa terms/kuota saat itu; Vercel Hobby bukan pilihan default SaaS komersial.
6. Salin `AGENTS.md` dari paket ini ke root proyek dan ketujuh/delapan dokumen di atas ke `docs/specs/`.
7. Siapkan fixture yang benar-benar aman: source PHP/JS/TS dan *dummy* secret yang jelas sintetis (`TEST_ONLY_DO_NOT_USE_...`). Jangan gunakan token nyata.

**Penting:** Koneksi GitHub yang membuktikan repository milik siapa harus dilakukan dengan pasangan identitas workflow (OIDC JWT) dan pairing nonce. Mengisi URL repository saja tidak memberikan hak scan atau verifikasi kepemilikan.

### Opsional — skill desain untuk Codex CLI

Bila ingin memakai skill yang kamu pilih, jalankan dari folder proyek setelah memeriksa README/lisensi dan apa yang diinstal:

```bash
# UI/UX Pro Max — sesuai README upstream untuk Codex
npx ui-ux-pro-max-cli init --ai codex

# Logo Design Skill — contoh bash/Git Bash (salin skill secara manual)
git clone https://github.com/kaankiziltug/logo-design-skill.git /tmp/logo-design-skill
mkdir -p .codex/skills
cp -R /tmp/logo-design-skill/skills/logo-design .codex/skills/logo-design
```

Di Windows PowerShell, perintah `cp -R` di atas bisa diganti `Copy-Item -Recurse` dan gunakan path folder sementara Windows. **Logo Concept 1 sudah dipilih**; Codex tidak perlu mengulang ideasi logo, cukup membuat SVG presisi sesuai brief dan minta persetujuan untuk final.

**REA opsional, bukan syarat MVP.** Hanya jika ingin melakukan investigasi aplikasi yang dimiliki/diizinkan secara eksplisit:

```bash
npx rea-agents setup
```

REA memerlukan kompatibilitas Node dan target analisis tertentu. Jangan klaim telah melakukan investigasi kompetitor hanya karena command setup berhasil. Lihat dokumen #5 v1.2.

---

## C. Struktur target repository

```text
sentinel-security-scanner/
├─ AGENTS.md
├─ README.md
├─ docs/
│  ├─ specs/                     # dokumen sumber yang benar-benar tersedia
│  ├─ DECISIONS.md               # ADR/pertentangan spesifikasi
│  ├─ QA_CHECKLIST.md
│  └─ SECURITY_REVIEW.md
├─ apps/
│  └─ web/                       # Vite + React + TS + shadcn/ui
│     ├─ src/components/
│     ├─ src/features/{auth,repositories,scans,findings,reports}/
│     ├─ src/lib/
│     └─ src/routes/
├─ packages/
│  ├─ contracts/                 # Zod/types, versioned envelope, DTO
│  └─ scanner-adapters/          # adapters+redaction+fixture tests
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  │  ├─ sentinel-api/           # end-user JWT + membership
│  │  └─ sentinel-ingest/        # Github OIDC verification (NOT Supabase JWT)
│  └─ tests/                     # pgTAP/RLS/security
├─ templates/
│  └─ github-workflows/
│     └─ sentinel-scan.yml       # owner installs into OWN repo
├─ fixtures/
│  ├─ php/
│  ├─ node/
│  └─ expected-findings/
├─ .github/workflows/            # CI for Sentinel app itself
├─ .env.example                  # placeholders ONLY
├─ package.json
└─ pnpm-workspace.yaml
```

**Catatan:** template GitHub Actions adalah kode yang disalin ke repo pengguna **setelah** peninjauan. Jangan deploy template sebagai workflow scanner sentral yang memindai arbitrary repos.

---

## D. Cara menggunakan prompt di Codex

- Jalankan **satu prompt/tahap per percakapan kerja**. Boleh lanjut di percakapan sama setelah review, tapi jangan langsung menempel semua tahap.
- Setelah setiap tahap, minta Codex menunjukkan: **file berubah, alasan, perintah tes, hasil tes, celah/risk, dan commit/branch yang disarankan**.
- **Boleh** Codex menghasilkan dummy data dan mocked APIs untuk UI awal. **Tidak boleh** mengaku sudah connect Supabase/GitHub cloud atau menampilkan hasil scan nyata jika belum.
- Jangan berikan secret atau service key lewat chat. Jika Codex butuh credentials, buat `.env` lokal atau konfigurasi platform sendiri.
- Jika sesuatu tidak dapat dites dalam lingkungan saat ini, Codex harus menandai `NOT VERIFIED` dan menyediakan instruksi tes manual; bukan menebak `PASS`.
- Review hasil tiap tahap sebelum minta Codex mengerjakan tahap berikutnya.

### PROMPT 00 — Baca spesifikasi, audit, dan rencana kode (tanpa coding)

```text
Kamu adalah Staff Software Engineer + Product Security Engineer untuk proyek Sentinel Security Scanner.

Baca AGENTS.md dan semua dokumen nyata di docs/specs/ (BRD v1.1, PRD v1.1, Brand/UIUX v1.1, UX Research FINAL v1.2, REA FINAL v1.2, FSD v1.1, ERD/DBA v1.1, TDD/API v1.1). Jika DOCX tidak terbaca, berhenti untuk dokumen tersebut dan minta konversi ke Markdown; jangan mengarang isinya.

Tugas tahap ini: TIDAK mengubah kode. Buat docs/IMPLEMENTATION_PLAN.md, docs/DECISIONS.md, docs/QA_CHECKLIST.md. Turunkan P0/P1/P2, dependency graph, user stories, threat model ringkas, data-flow trust boundaries, backlog sprint, test strategy. Tandai keputusan yang bertentangan.

Baseline wajib: React + Vite + TS, Supabase Auth/Postgres/RLS/Edge, GitHub Actions di repository owner, Semgrep CE/OSV/Gitleaks CLI/Composer audit; NO AI runtime, NO Redis/BullMQ, NO Next.js/NestJS, NO ZIP/URL scanning, NO central runner, NO use of existing UMKM VPS.

Hasilkan daftar ketidakpastian (terutama GitHub OIDC claims, pairing nonce, report ingestion, scanner rules licensing), blocker yang perlu keputusan pengguna, dan urutan implementasi. Jangan berasumsi punya akses cloud. Akhiri dengan acceptance gate untuk Tahap 01.
```

**Gate 00:** Rencana nyata tersedia, backlog MVP masuk akal, tidak ada scope creep, mismatch dokumen tercatat.

### PROMPT 01 — Scaffold monorepo dan quality baseline

```text
Implementasikan Tahap 01 sesuai docs/IMPLEMENTATION_PLAN.md dan AGENTS.md.

Buat pnpm workspace: apps/web (Vite + React + TypeScript strict), packages/contracts, packages/scanner-adapters, supabase/migrations, supabase/functions/sentinel-api, supabase/functions/sentinel-ingest, templates/github-workflows, fixtures, docs. Buat eslint, prettier, test runner (Vitest), env schema, GitHub CI lint/typecheck/test/build, .env.example, .gitignore, README setup.

Jangan memasang Next.js, NestJS, Prisma runtime di Edge, Redis, BullMQ, AI SDK, dan library yang belum digunakan. Pastikan pnpm install, lint, typecheck, tests, build bekerja; kalau network tidak memungkinkan tulis NOT VERIFIED. Gunakan versi dependencies yang kompatibel dan lockfile.

Laporkan file berubah, commands dijalankan, hasil, dan risiko tersisa. Jangan lanjut ke tahap berikutnya.
```

**Gate 01:** project build, CI minimal, TypeScript strict, no secrets committed, repo terstruktur.

### PROMPT 02 — Brand tokens, UI shell dan mock states

```text
Implementasikan Tahap 02 UI/UX profesional sesuai Brand/UIUX v1.1 + UX Research FINAL v1.2 + REA FINAL v1.2. Jika skill ui-ux-pro-max sudah terinstal, gunakan prinsipnya; jangan menjadikannya dependency runtime. Gunakan React + Vite + TS, Tailwind, shadcn/ui, Lucide, accessible components. Tokens: #102A43 Navy, #0D9488 Teal, #334155 Graphite, #F8FAFC background, #E2E8F0 border; fonts Inter + JetBrains Mono.

Buat app shell dan routes: /overview, /repositories, /repositories/:id, /scans/:id, /findings, /findings/:id, /reports, /settings. Awali seluruh view dari typed dummy data terisolasi dalam fixtures/mock; JANGAN panggil Supabase dulu. Buat onboarding 'register repo -> install owner workflow -> pending verification', scan detail per tool status, finding detail yang sanitized, findings table/filter desktop dan compact cards mobile. Mode: no data, pending, loading, complete-zero, partial, failed, unauthorized, error.

UI harus seperti enterprise security product karya frontend expert: tipografi presisi, spacing rapih, jelas, responsif; jangan gradient/glow/glass/robot/AI illustration atau vanity metrics. Teks UI Bahasa Indonesia. Komponen keyboard accessible, WCAG 2.2 AA target, reduced-motion. SVG logo Concept 1 jika referensi source tersedia; JANGAN mengarang logo sebagai 'final' bila hanya ada deskripsi. Screenshot/test viewport 360,390,768,1024,1440 jika browser tersedia.

Beri hasil per halaman, audit accessibility, screenshot path, tes, limitasi dan apa yang belum terverifikasi. Jangan lanjut tahap lain.
```

**Gate 02:** UX usable dummy end-to-end, visual konsisten, status/coverage jujur, responsive; tidak ada request ke API real.

### PROMPT 03 — Supabase migrations, Auth, RLS, tenancy

```text
Implementasikan Tahap 03 mengikuti ERD/DBA v1.1 dan TDD/API v1.1. Buat SQL migrations Supabase untuk profiles, organizations, organization_members, repositories, pairing state, scan_runs, scan_engine_runs, findings, finding_occurrences, advisory_refs, triage_history, ingestion_events, scanner_rule_catalog sesuai spesifikasi. Hindari tabel/entity baru kecuali dicatat di docs/DECISIONS.md.

Tambahkan constraints FK, indexes, unique GitHub run tuple, unique occurrence fingerprint scoped properly, enum/check constraints, updated_at approach, grants dan RLS untuk semua exposed tables/views. Tulis security-definer helper bila diperlukan dengan fixed search_path, revoke public execute, dan anti-policy-recursion. Model Supabase Auth: user UUID dari auth.users. Buat RLS tests minimal tenant A vs B, owner vs member, anonymous denied, forbidden write, duplicate run. Seed dummy development fixtures tanpa secrets. Tidak boleh mengasumsikan cloud Supabase sudah terhubung.

Output: migration files, data dictionary, scripts/commands untuk supabase start/db reset/test (jika CLI tersedia), hasil tes, missing policy. Jangan deploy ke production otomatis.
```

**Gate 03:** deny-by-default RLS, migrations idempotent di clean DB, integritas benar, multi-tenant denied tests.

### PROMPT 04 — Scanner contracts, adapter, sanitizer, fixtures

```text
Implementasikan Tahap 04 dalam packages/contracts dan packages/scanner-adapters. Buat versioned Zod schemas untuk report envelope, scanner execution, finding/evidence, engine status, confidence/evidence status, references, GitHub run provenance.

Buat pure parsers/adapters untuk Semgrep JSON, OSV-Scanner JSON, Gitleaks CLI JSON, Composer Audit JSON. Jangan eksekusi scanner dari API/Edge. Tambahkan framework/language manifest detection untuk PHP/Composer, Node/npm/yarn/pnpm dan monorepo. Normalize severity + evidence certainty; dedupe advisory aliases/overlapping OSV+Composer; stable fingerprint across scans. Output sanitized: hilangkan secret value, raw match, full source lines yang mengandung secret, absolute paths, arbitrary HTML; URL references hanya https allowlisted/validated. Scanner gagal => partial; no findings != safe.

Buat fixture sintetik untuk PHP/Node (positive, negative, missing lockfile, malformed output, duplicate finding, secret redaction), unit tests dari setiap tool, property-based/fuzz tests untuk sanitizer bila masuk akal. Jika format tool version tidak diketahui, tulis isolated adapter TODO dan fail closed; jangan fabricate fixtures sebagai hasil nyata. Tambahkan provenance tool_version/ruleset_version.
```

**Gate 04:** parsers robust, schema rejects invalid payload, secret tak pernah muncul di normalized result.

### PROMPT 05 — Owner-installed GitHub Actions workflow (uji repo milik sendiri)

```text
Implementasikan Tahap 05: templates/github-workflows/sentinel-scan.yml dan dokumentasi install ke repository milik user. Workflow harus menjalankan Semgrep CE, OSV-Scanner, Gitleaks CLI, Composer Audit bila composer.lock tersedia; tool versions dan action refs harus dipin ke versi/digest yang diverifikasi. Periksa dokumentasi resmi terbaru sebelum menetapkan flags.

Default event MVP: workflow_dispatch + push ke default branch. Jangan implement pull_request_target. Gunakan permissions contents:read pada job scan; hindari npm install/composer install dan seluruh build/test scripts dari repository yang dipindai. Gunakan timeout, output limits, failure isolation; setiap tool punya success/failed/skipped/timed_out. Job scan menghasilkan hanya JSON yang telah disanitasi. Pisahkan job pelapor dari checkout untrusted; reporter punya id-token:write minimum dan hanya membaca sanitized artifact. Laporan OIDC dikirim ke Sentinel ingestion HTTPS, dengan audience yang sesuai, TANPA Supabase service-role key di repository target.

Buat README copy-paste setup, permissions, pairing, cara start manual, risiko fork PR, artifact retention. CI lint YAML dan uji satu repo fixture yang benar-benar kamu kontrol (jika punya GitHub akses). Bila belum bisa menguji GitHub Hosted Runner, beri label NOT VERIFIED dan langkah manual. Jangan push workflow ke repository pengguna secara otomatis.
```

**Gate 05:** YAML valid, scanned repo = host repo, tidak menjalankan app source, report artifact tersanitasi.

### PROMPT 06 — OIDC verifier, secure report ingestion, atomic RPC

```text
Implementasikan Tahap 06 di Supabase Edge Function sentinel-ingest. Request memakai bearer GitHub Actions OIDC JWT, yang BUKAN JWT Supabase. Konfigurasikan entrypoint auth sesuai dokumentasi Supabase terkini; jika verify_jwt=false diperlukan untuk non-Supabase JWT, handler WAJIB memvalidasi JWT GitHub secara penuh SEBELUM operasi apapun: issuer, JWKS signature, algorithm allowlist, audience, iat/nbf/exp, repository_id, workflow_ref, run_id, run_attempt, sha/ref serta pending pairing nonce/expiry. Gagal autentikasi -> reject, no writes.

Lakukan size/rate/schema constraints, strict content-type, no raw secret, idempotency via (repo_id, run_id, attempt) + SHA-256 body digest, replay guard. Pairing harus hanya bisa mengklaim repo melalui bukti workflow dari repo yang sama, tidak cukup memasukkan URL. Simpan scan+engine+findings+receipt secara atomik dalam satu Postgres function transaksi yang diaudit, fixed search_path dan restricted grants. OIDC token tidak boleh dicatat. Status confirmed vulnerability tidak boleh diklaim hanya karena OIDC valid (token hanya identity).

Implementasikan unit/integration tests: forged token, mismatched repo, wrong aud, expired, reused nonce, duplicate exact (200 same id), conflicting duplicate (409), oversized payload (413), cross-tenant, secret fixture. Buat docs/SECURITY_REVIEW.md dan jelaskan trust boundary. Jika tidak ada signing fixture, uji dengan local JWK test key yang tidak pernah dipakai di production.
```

**Gate 06:** valid OIDC→pairing→atomic ingest terbukti via tes; invalid request tak menyimpan apapun. **Ini security release blocker.**

### PROMPT 07 — Authenticated Edge API + frontend integration

```text
Implementasikan Tahap 07: sentinel-api Edge Functions atau RLS-backed supabase queries mengikuti TDD/API v1.1. Endpoints P0: create/list organizations, register/pair repository, list repo, repo detail, scan runs, scan detail, filtered/paged findings, finding detail, sanitized JSON export jika P0 spec mengharuskan. Seluruh user operations memakai valid Supabase Auth session dan membership checks; publishable key frontend saja; no service key client side.

Hubungkan apps/web via typed client + TanStack Query bila dibutuhkan. Pertahankan mock adapter untuk story/dev, tetapi berikan jelas MOCK vs LIVE. Tambahkan route guards, session expiry handling, RLS error handling, paginated lists, loading/empty/error states, invalid pairing instructions. Seluruh endpoints dan schemas harus sesuai packages/contracts. Tidak boleh mengasumsikan ada real scan yang selesai; gunakan DB fixture untuk UI test. Buat test integration dengan tenant A/B.
```

**Gate 07:** end-user tenancy aman, UX dapat menampilkan run/finding yang benar, pairing tidak bisa dipalsukan dari browser.

### PROMPT 08 — Triage, scan lifecycle, export

```text
Implementasikan Tahap 08 berdasarkan FSD v1.1 dan UX Research v1.2. Buat transitions untuk open, acknowledged, investigating, false_positive, accepted_risk, fixed dan reopen sesuai spesifikasi. Mutasi wajib permissions, reason untuk risk acceptance/false positive, append-only triage_history. Jangan otomatis mark fixed jika scan terbaru partial/failed/skipped. Identical issue across SHA uses stable fingerprint; occurrence history tiap scan tetap immutable.

Pada scan detail tampilkan per engine status+version+error code dan tautan GitHub Actions; output JSON/SARIF (bila sesuai P0) selalu sanitized dan mencantumkan provenance + coverage disclaimers. Tambahkan filter/sort/search/pagination dan responsive accessibility tests; no P1 advanced assignee/notifications kecuali jelas diminta.
```

**Gate 08:** triage audit trail benar, partial scan tidak mengubah status secara keliru, export tidak memuat secret.

### PROMPT 09 — Security QA, end-to-end test, documentation audit

```text
Implementasikan Tahap 09 hanya untuk hardening, testing, dan dokumentasi. Jalankan lint, typecheck, unit, integration (RLS, OIDC, migrations, parsers), UI keyboard/a11y, repo fixture workflow (jika akses), build dan dependency audit. Audit ulang seluruh source untuk AI SDK, Redis/BullMQ, NestJS/Next.js, URL/ZIP scanner, raw secret storage, service-role key frontend, central worker; keluarkan daftar pelanggaran.

Uji keadaan: unverified repo, expired nonce, skipped composer, Semgrep failed, 0 findings, partial scan, duplicate run, forged OIDC, cross-tenant request, very long path, 1000 findings, unknown package version, secret redaction, cancelled GitHub workflow, Supabase outage. Simpan hasil jujur di docs/QA_CHECKLIST.md per case PASS / FAIL / NOT VERIFIED dengan perintah & bukti. Perbaiki bug P0, jangan tambah fitur baru.
```

**Gate 09:** zero critical open issues, 100% P0 tests run or transparently blocked, manual security review selesai.

### PROMPT 10 — Staging deployment + release checklist (jangan deploy tanpa izin)

```text
Siapkan Tahap 10 deployment STAGING. Jangan membuat/men-deploy cloud resources sampai saya memberi izin eksplisit dan credentials disediakan melalui platform yang aman. Siapkan docs/DEPLOYMENT.md, env mapping, Supabase CLI migrations, Edge deploy commands, Vercel/Netlify static web deployment, CORS origins, custom domain opsional, CI policies, rollback, backup/export, rate-limit and quota budgets.

Vercel Hobby cocok hanya jika penggunaan sesuai noncommercial/personal terms. Untuk public/commercial SaaS berikan pilihan hosting yang sesuai. GitHub Actions hanya di repository user yang memindai code-nya sendiri. Sediakan smoke test checklist staging dengan satu fixture repo (owned). Konfirmasi tidak ada service secret di frontend/GitHub workflow. Jika deployment membutuhkan tindakan saya, berhenti pada instruksi spesifik (tanpa mengaku deploy sudah berhasil).
```

**Gate 10:** staging deployment terverifikasi lewat smoke test atau berstatus NOT DEPLOYED dengan instruksi nyata, bukan klaim selesai.

---

## E. Checklist teknis wajib sebelum release

- [ ] **Input model**: hanya `owner/repo` GitHub; tidak ada URL probing atau ZIP upload P0.
- [ ] **Trust**: repository tetap `pending` sebelum OIDC identity + nonce pairing valid.
- [ ] **GitHub runner**: scanner berjalan di repo yang dipindai, izin `contents:read`; `id-token:write` hanya job pelapor; pin actions/tools.
- [ ] **No arbitrary execution**: tidak menjalankan `npm install` lifecycle scripts, `composer install` scripts, test/build kode untrusted, atau `pull_request_target` privileged.
- [ ] **OIDC**: verify JWKS issuer aud exp nbf iat claims, repo/run/workflow binding dan replay prevention; token hanya membuktikan job identity, bukan kebenaran findings.
- [ ] **Storage**: tidak ada source archive/raw code/raw secret/raw scanner unredacted output di DB/log/export.
- [ ] **RLS**: semua tabel/endpoint exposed punya grant+policy; user org A tidak baca/tulis org B.
- [ ] **Atomicity**: ingest report selesai atau rollback; duplicate report idempotent.
- [ ] **Evidence honesty**: `potentially_affected`, `unknown`, `skipped`, `partial` tidak diklaim vulnerable confirmed atau safe.
- [ ] **Scanner licensing**: Semgrep engine *dan ruleset* diperiksa terpisah; Gitleaks **CLI** (bukan otomatis commercial action); OSV/Composer license/flags ditinjau.
- [ ] **Brand**: SVG Concept 1 produksi dievaluasi sendiri, bukan screenshot auto-traced; cek 16/24/32px dan monochrome.
- [ ] **A11y**: keyboard, focus, labels, contrast, responsive 360/390/768/1024/1440px.
- [ ] **Hosting**: batas Vercel dan Supabase Free ditinjau sebelum publik; tidak menggunakan VPS UMKM/Hermes.
- [ ] **Research**: REA UX Investigation v1.2 adalah playbook, bukan bukti REA live telah dijalankan.

## F. Hasil minimum yang harus bisa didemokan

**Scenario 1 — First scan**: pemilik login → register repo → copy/aktifkan workflow di repository test → workflow menghasilkan JSON tersanitasi → GitHub OIDC + pairing berhasil → run dan per-tool coverage terlihat di Sentinel.

**Scenario 2 — PHP**: repository test Laravel/PHP memiliki `composer.lock`; Composer audit dan OSV menghasilkan advisory nyata *jika ada*; tidak ada temuan fiktif bila database advisories kosong.

**Scenario 3 — Node.js**: `package-lock.json` memiliki advisory yang diketahui; OSV menunjukkan package/version/ID+URL advisory dari sumber terverifikasi; Semgrep menemukan pola sumber bila rule valid.

**Scenario 4 — Secret safety**: fixture mengandung secret dummy. Gitleaks mendeteksi indikasi, tetapi raw secret dummy **tidak** ada di server logs, DB, UI atau exported report.

**Scenario 5 — Partial failure**: Semgrep error, OSV sukses → scan terlihat `partial`, OSV findings tetap tersedia; UI tidak menulis “kode aman”.

**Scenario 6 — Authorization**: user tenant B tidak bisa membaca repo/run/finding tenant A walau mengetahui UUID-nya; forged report tidak diterima.

---

## G. Prompt singkat untuk review tiap akhir tahap

```text
Review secara kritis implementasi tahap terakhir terhadap AGENTS.md dan docs/specs. Jangan menambah fitur. Temukan 10 risiko terbesar dan fokus pada yang bersifat high impact: auth, OIDC GitHub, RLS, idempotency, sanitizer, GitHub workflow privileges, licensing, partial scan semantics, UI accessibility, error handling. Jalankan semua test yang tersedia dan tampilkan bukti per command. Beri daftar bug P0/P1/P2, file+line referensi, test yang belum ada, apa yang harus saya review manual. Jika ada error, perbaiki yang jelas tanpa menyembunyikan test failure. Tutup dengan keputusan READY / NOT READY untuk lanjut tahap berikutnya.
```

## H. Sumber dan catatan yang harus diverifikasi ulang saat implementasi

- GitHub OIDC: https://docs.github.com/en/actions/reference/security/oidc
- GitHub security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- GitHub `pull_request_target` safety: https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
- GitHub billing/usage: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Supabase Edge Function auth: https://supabase.com/docs/guides/functions/auth
- Supabase function JWT configuration: https://supabase.com/docs/guides/functions/function-configuration
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Semgrep: https://semgrep.dev/docs/
- OSV-Scanner: https://google.github.io/osv-scanner/
- Gitleaks CLI: https://github.com/gitleaks/gitleaks
- Composer audit: https://getcomposer.org/doc/03-cli.md#audit
- REA: https://github.com/morluto/rea
- UI/UX skill: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Logo skill: https://github.com/kaankiziltug/logo-design-skill

**Keterangan final:** Panduan ini adalah rencana implementasi, bukan klaim bahwa kode, GitHub workflow, database cloud atau aplikasi produksi sudah dibuat. Tahap 00 harus dijalankan sebelum Tahap 01 untuk menemukan setiap perubahan/dependency aktual.
