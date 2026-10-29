# Sentinel Security Scanner Implementation Plan

**Status tahap terakhir:** Source Tahap 07 dan deployment migration `20261028000300_authenticated_api.sql` serta Edge Function `sentinel-api` sudah tersedia. Function aktif dengan `verify_jwt=true`. Gate 07 belum lulus; request user/tenant hosted belum diverifikasi, tenant A/B belum dites, dan dashboard lokal belum dikonfigurasi ke Supabase.

**Tanggal pembaruan:** 29 Oktober 2026

**Status:** Tahap 00–06 memiliki implementasi lokal di branch master. Pengguna menerapkan migration Tahap 03 dan mengonfirmasi seluruh 20 assertion tenant pgTAP lulus. Migration 002 dan Edge Function `sentinel-ingest` juga diterapkan. Tahap 07 kini memiliki source API terautentikasi dan integrasi frontend lokal; typecheck, build, lint, format, dan diff-check lulus pada 29 Oktober. Migration 003 diterapkan dan `sentinel-api` berstatus ACTIVE dengan `verify_jwt=true` menurut CLI. Tenant A/B untuk API, alur hosted Auth/API/pairing, dan koneksi dashboard lokal belum diverifikasi. Workflow GitHub-hosted dan ingestion end-to-end tetap belum diverifikasi. Perubahan Tahap 05–07 belum di-commit atau di-push.

## Tujuan dan batas rencana

Rencana ini menyusun urutan MVP dari spesifikasi yang tersedia. Produk menjalankan pemindaian source code PHP dan Node.js/TypeScript di GitHub Actions milik pemilik repository, lalu menyimpan temuan yang sudah disanitasi di Supabase dan menampilkannya di dashboard React/Vite. Sentinel tidak menjalankan AI saat runtime.

Tahap 00 menghasilkan rencana; Tahap 01 menyediakan fondasi monorepo; Tahap 02 menyediakan routes, design tokens, komponen, dan state UI mock. Tahap 03 menambahkan skema, grants, RLS, pgTAP test, seed lokal dan data dictionary; migration serta tenant suite hosted dikonfirmasi pengguna. Tahap 04 menyediakan contract dan adapter scanner. Tahap 05 menambahkan workflow owner-installed dan runner terisolasi. Tahap 06 menambahkan validasi OIDC di handler, sanitasi defense-in-depth, pairing, idempotency, serta migration RPC transaksi. Tahap 07 menambahkan auth/session, organisasi, API user, serta mode dashboard LIVE dengan data mock tetap dipakai hanya saat Supabase tidak dikonfigurasi.

## Sumber yang ditelaah

Delapan spesifikasi DOCX berada di root workspace: BRD v1.1, PRD v1.1, FSD v1.1, ERD/DBA v1.1, TDD/API v1.1, Brand/UIUX v1.1, UX Research FINAL v1.2, dan REA UX Investigation FINAL v1.2. Diagram dalam dokumen asli juga ditinjau.

AGENTS.md merujuk dokumen pada docs/specs/ dan menyebut mirror Markdown di docs/specs/markdown/, tetapi kedua lokasi tersebut belum tersedia. Sumber asli tidak dipindahkan pada tahap ini. Spesifikasi BRD/PRD/FSD/ERD/TDD berstatus draft atau engineering review; keputusan rilis eksternal tetap memerlukan persetujuan yang disebutkan di dalamnya.

## Baseline produk

- Frontend Sentinel: React, Vite, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide.
- Identitas dan data: Supabase Auth, PostgreSQL dengan grants dan RLS, Edge Functions TypeScript/Deno, migrations SQL.
- Eksekusi: workflow GitHub Actions dipasang dan dimiliki maintainer repository yang dipindai; job pemindai terpisah dari job pelapor.
- Pemindai: Semgrep Community Edition dengan rules yang sudah ditinjau lisensinya, OSV-Scanner, Gitleaks CLI, dan Composer Audit bila tersedia composer.lock.
- Hasil: kontrak berversi, provenance repository/workflow/run/commit, status setiap engine, evidence yang disanitasi, dan triage yang memiliki audit trail.
- Batas MVP: tidak ada AI/model/API generatif, Redis, BullMQ, Next.js/NestJS untuk aplikasi Sentinel, worker/runner sentral, pemindaian URL, ZIP upload, penyimpanan raw source, atau penyimpanan nilai secret.

## Prioritas kemampuan

### P0 — MVP

1. Login Supabase Auth, organisasi dan membership, serta izin owner/maintainer/viewer.
2. Pendaftaran repository sebagai pending; nama atau URL repository saja tidak membuktikan kepemilikan.
3. Pairing satu kali dengan nonce acak, berumur pendek, disimpan sebagai hash dan diikat ke repository serta workflow yang diizinkan.
4. Workflow owner-installed dengan checkout SHA yang eksplisit, izin minimum, pemindaian tiap tool secara terpisah, batas waktu dan output, tanpa menjalankan install/build/test script repository.
5. Deteksi PHP/Composer, Node.js/npm/yarn/pnpm dan repository campuran; tool yang tidak berlaku mencatat skipped beserta alasan.
6. Kontrak laporan berversi dan adapter Semgrep, OSV-Scanner, Gitleaks CLI, serta Composer Audit; normalisasi severity, certainty, fingerprint, advisory, versi dan provenance.
7. Sanitizer sebelum artifact, log, ingestion, database, UI, dan export. Raw secret, bearer/OIDC token, raw source dan baris sumber sensitif tidak boleh lolos.
8. Ingestion OIDC GitHub yang memvalidasi signature/JWKS, issuer, audience, waktu, klaim repository/workflow/run/ref/SHA, pairing, schema, batas payload dan anti-replay.
9. Satu transaksi database untuk run, status engine, temuan tersanitasi, receipt, dan pairing bila berlaku; duplicate identik idempotent, duplicate berbeda ditolak.
10. Grants/RLS deny-by-default dan pengujian isolasi tenant.
11. Dashboard dengan mock bertipe sebelum integrasi API; onboarding, repository, scan detail, findings, finding detail, reports dan settings. Status kosong, pending, loading, partial, failed, unauthorized dan error harus dibedakan.
12. UI yang dapat digunakan pada lebar 360–1440 px, keyboard/ARIA, fokus terlihat, reduced motion dan label status yang tidak hanya mengandalkan warna.

### P1 — setelah jalur MVP aman

- GitHub App onboarding bila benar-benar mengurangi langkah manual tanpa melemahkan bukti kontrol repository.
- Delta scans, assignment dan triage yang lebih kaya.
- SARIF export bila dipilih setelah konflik prioritas ekspor diselesaikan.
- Penambahan perilaku organisasi atau notifikasi hanya setelah batas MVP dan kebutuhan izin jelas.

### P2 — di luar MVP

URL scanning, ZIP upload, bahasa tambahan, pemindaian atau eksekusi repository pada worker sentral, dan layanan scanner terpusat. Item ini tidak boleh masuk ke implementasi MVP.

## Alur produk dan batas kepercayaan

1. Pengguna masuk melalui Supabase Auth dan memilih organisasi.
2. Pengguna mendaftarkan owner/repo; status tetap pending.
3. Dashboard menerbitkan pairing nonce satu kali. Pemilik memasang workflow yang ditinjau pada repository miliknya.
4. Job scan mengambil commit SHA tertentu dengan izin read-only, mendeteksi manifests, menjalankan scanner yang relevan secara terisolasi, lalu menormalisasi dan menyensor output.
5. Artifact yang boleh diunduh job pelapor hanya JSON tersanitasi yang dibatasi ukurannya. Job pelapor meminta GitHub OIDC saat mengirim laporan dan tidak menerima service-role key.
6. Edge Function memvalidasi token GitHub secara penuh, mengikat klaim ke repo/workflow/ref/run yang diizinkan, memeriksa pairing/replay, lalu memanggil satu RPC transaksi Postgres.
7. Browser membaca data dengan user JWT dan policy RLS; membership tenant diperiksa di seluruh akses dan mutasi.

**Penting:** OIDC membuktikan identitas job GitHub, bukan integritas/kebenaran isi laporan. Repository owner dapat mengubah workflow dan mengirim laporan yang dibuat-buat. UI dan export harus menyebut provenance sebagai laporan dari workflow CI dan tidak menyebut hasilnya sebagai bukti eksploitasi independen.

## Dependency graph dan urutan pengerjaan

Urutan berikut mengikuti fase playbook; setiap fase berhenti untuk review sebelum fase berikutnya.

1. **Tahap 00 — spesifikasi dan keputusan:** tetapkan nama entity, vocabulary status, trigger, batas ekspor dan batas payload yang belum konsisten.
2. **Tahap 01 — fondasi monorepo:** workspace pnpm, Vite/React/TypeScript strict, contracts, scanner-adapters, Supabase scaffold, template workflow, fixtures, CI, env example dan README.
3. **Tahap 02 — UI shell dengan mock:** routes, design tokens dan seluruh state UI; tidak ada request Supabase.
4. **Tahap 03 — migrations, Auth dan RLS:** entity kanonis, grants, policy, constraints, indexes, tenant tests dan seed sintetis.
5. **Tahap 04 — contracts, adapters dan sanitizer:** schema berversi, deteksi stack, parsing output, fingerprint, dedupe dan redaction tests.
6. **Tahap 05 — workflow owner-installed:** workflow pinned dan dibatasi; pemindaian serta pelaporan dipisah; dokumentasi instalasi; tidak ada auto-push ke repository pengguna.
7. **Tahap 06 — OIDC ingestion:** verifikasi token, pairing, idempotency, atomic RPC dan negative tests. Ini security release blocker.
8. **Tahap 07 — API terautentikasi dan integrasi UI:** sesi user, membership, RLS-backed reads/mutations, pagination dan transisi MOCK/LIVE yang eksplisit.
9. **Tahap 08 — triage, lifecycle dan export:** audit append-only; partial scan tidak menandai temuan fixed.
10. **Tahap 09 — hardening:** jalankan security, adapter, RLS, OIDC, accessibility, responsive dan alur fixture; catat PASS/FAIL/NOT VERIFIED beserta bukti.
11. **Tahap 10 — staging:** hanya menyiapkan rencana deployment sampai izin eksplisit dan kredensial tersedia. Tidak ada deployment otomatis.

Dependensi utama: Tahap 03 dan 04 harus menyepakati kontrak sebelum Tahap 06; Tahap 05 membutuhkan adapter/sanitizer; integrasi Tahap 07 bergantung pada migrations, RLS dan API contract; Tahap 09 memerlukan semua jalur P0.

## User stories dan acceptance ringkas

| ID    | Pengguna dan kebutuhan                               | Acceptance                                                                                                 |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| US-01 | Pemilik menghubungkan repository miliknya            | Pendaftaran hanya membuat pending; verified setelah OIDC + pairing yang cocok                              |
| US-02 | Developer menjalankan scan pada event yang diizinkan | SHA/run/attempt tercatat; tool gagal tidak menghilangkan hasil tool lain                                   |
| US-03 | Developer menilai evidence                           | Lokasi, rule/tool, versi, provenance dan status evidence terlihat; secret selalu disensor                  |
| US-04 | Reviewer melakukan triage                            | Perubahan berizin membutuhkan alasan untuk false positive/accepted risk dan menghasilkan history immutable |
| US-05 | Maintainer memahami coverage                         | Status tiap engine terlihat; nol temuan tidak berarti repository aman; versi tak diketahui tetap unknown   |
| US-06 | Anggota tenant melihat data sesuai izin              | RLS menolak akses baca/tulis antar-organisasi; viewer tidak dapat pairing atau mengubah triage             |

## Threat model ringkas

| Ancaman                                                  | Dampak                                      | Kontrol minimum                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pengguna mendaftarkan repository orang lain              | Klaim ownership palsu                       | Nama repo bukan bukti; pairing nonce dan klaim OIDC repository_id/workflow                                                 |
| Token OIDC palsu, kedaluwarsa atau salah audience        | Ingestion tanpa identitas workflow yang sah | Verifikasi signature, issuer, JWKS, alg allowlist, aud, exp, nbf, iat dan klaim wajib                                      |
| Replay atau payload berubah untuk run yang sama          | Duplikasi atau pengubahan history           | Unique repo/run/attempt, digest payload, receipt; replay identik idempotent dan konflik 409                                |
| Laporan dari workflow owner yang dimodifikasi            | Temuan dapat direkayasa                     | Perlakukan JSON sebagai untrusted; tampilkan provenance CI, allowlist workflow/ref; OIDC bukan bukti kebenaran hasil       |
| Secret masuk artifact, log, database atau export         | Kebocoran credential                        | Redact sebelum artifact dan logging, deny pola secret, fixtures sintetis dan pemeriksaan seluruh sink                      |
| Kode repository tidak tepercaya dieksekusi               | Script berbahaya pada runner/job berizin    | Jangan jalankan install/build/test script; pisahkan job scan dan reporter; permission minimum; hindari pull_request_target |
| Akses lintas tenant                                      | Kebocoran repo/temuan privat                | RLS + grants pada semua exposed relation/view, membership checks server-side dan tes negatif tenant                        |
| Tool/action/ruleset berbahaya atau lisensinya tak sesuai | Supply-chain, pelanggaran penggunaan        | Pin versi/commit, checksum bila sesuai, review asal/lisensi rules secara terpisah                                          |
| Scanner/API/kuota gagal tetapi UI tampak bersih          | Keputusan risiko menyesatkan                | Status partial/failed/skipped/unknown eksplisit; tidak ada badge “aman”                                                    |

## Ketidakpastian dan blocker sebelum implementasi terkait

- Uji klaim OIDC yang benar-benar disediakan GitHub Actions untuk workflow target, termasuk issuer, audience, workflow identity, repository_id, run/attempt, ref dan SHA.
- Putuskan cara distribusi workflow (salinan YAML atau reusable workflow yang dipin) dan exact allowlist workflow/ref.
- Tetapkan event P0 dan kebijakan fork PR sebelum menulis YAML. Playbook menetapkan workflow_dispatch + push ke default branch; upload dari fork yang tidak dipercaya harus ditiadakan sampai ada desain aman.
- Rekonsiliasi entity/tabel dan arti “finding snapshot” versus fingerprint lintas scan sebelum migrations.
- Tetapkan satu vocabulary untuk awaiting_report/running/completed/partial/failed/cancelled/rejected.
- Putuskan apakah scanner_rule_catalog adalah tabel, manifest versioned di repo, atau representasi lain; catat provenance dan lisensinya.
- Rekonsiliasi prioritas sanitized JSON/SARIF export.
- Verifikasi rules Semgrep yang benar-benar boleh digunakan untuk model produk yang direncanakan; lisensi engine dan ruleset dinilai terpisah.
- Konfirmasi payload cap, rate limit, retention 90 hari yang masih berupa usulan, backup, kebijakan private repo, serta model owner/member.
- Selesaikan mismatch lokasi spesifikasi: semua DOCX sekarang berada di root, sedangkan AGENTS.md merujuk docs/specs/ dan mirror Markdown yang tidak tersedia.

## Strategi verifikasi

- Contracts: schema valid/invalid, allowlists, bounds, unknown version, stable fingerprint dan idempotency tuple.
- Adapters: fixture output Semgrep, OSV-Scanner, Gitleaks CLI dan Composer Audit; malformed output dan tool failure tidak menghapus hasil lain.
- Sanitizer: secret sintetis tidak muncul di normalized payload, artifact, log, DB, UI atau export; path, HTML, URLs dan excerpt dibatasi.
- Workflow: YAML valid; permissions minimum; SHA pinned; no install/build/test scripts; pemisahan scan/report; timeout dan output caps; tool versions/ruleset direkam.
- OIDC/ingestion: forged signature, wrong issuer/audience, expired/not-yet-valid, missing/mismatched claims, wrong repo/workflow, nonce expired/reused, oversized body, exact duplicate, conflicting duplicate.
- Database/API: migrations dari DB bersih, rollback atomicity, deny tenant A/B, role restrictions, unique run tuple dan pagination stabil.
- UI: mock states, keyboard-only, focus, labels, screen reader status, contrast, reduced motion dan viewport 360/390/768/1024/1440; tanpa fake metrics atau klaim safety.
- End-to-end: first scan PHP, first scan Node, secret redaction, partial failure dan cross-tenant/forged report denial.
- Catat tiap hasil PASS/FAIL/NOT VERIFIED dengan command dan bukti. Belum ada hasil tes implementasi dalam tahap 00.

## Hasil gate Tahap 01

**Status lokal: PASS. GitHub Actions: NOT VERIFIED karena perubahan belum dipush.**

- pnpm workspace, aplikasi Vite/React/TypeScript strict, contracts, scanner-adapters, Supabase scaffold, template docs, fixtures, docs dan CI tersedia.
- pnpm format:check, lint, typecheck, tests, dan build berhasil secara lokal.
- .env.example hanya memakai placeholder; .env dan apps/web/.env.local tidak ada.
- Manifest tidak menambahkan AI, Redis, BullMQ, Next.js/NestJS app server, atau worker sentral.
- Git lokal berada di master dan origin menunjuk URL yang diminta. Belum ada commit atau push.
- Konflik entity/status D-004 sampai D-006 sudah disepakati dan dicatat. Kontrak report tetap mengikuti Tahap 04; database migration tahap ini belum bisa dieksekusi lokal.

## Hasil gate Tahap 02

**Status lokal: PASS untuk typecheck, lint, test, build, route smoke, state mock, serta pemeriksaan overflow pada viewport 360, 390, 768, 1024, dan 1440 px.** Aksesibilitas WCAG 2.2 AA penuh, uji pengguna, dan validasi REA belum dilakukan. GitHub Actions, GitHub, Supabase, dan scanner nyata tidak dijalankan.

- Dashboard menyediakan `/overview`, `/repositories`, `/repositories/:id`, `/scans/:id`, `/findings`, `/findings/:id`, `/reports`, dan `/settings`; Inter dan JetBrains Mono di-self-host dari paket berlisensi OFL 1.1 dengan notice di bundle publik.
- Fixtures bertipe menandai seluruh data sebagai sintetis; preview meliputi no-data, pending, loading, complete-zero, partial, failed, unauthorized, dan error.
- Filter, sort, tautan navigasi, copy path, dialog onboarding, keyboard Escape, desktop table/mobile cards, serta status coverage dapat diperiksa lokal.
- Tidak ada request API nyata. Onboarding hanya menavigasi fixture pending; template workflow, ekspor, triage mutasi, auth, dan settings belum aktif.
- Layout browser diuji tanpa horizontal overflow pada lima lebar yang ditetapkan. Screenshot ditinjau di browser tetapi tidak disimpan sebagai file.
- D-004, D-005, dan D-006 disepakati untuk memulai Tahap 03 dan dicatat dalam `docs/DECISIONS.md`. Migration sudah diterapkan dan suite tenant pgTAP dijalankan penuh secara manual pada proyek Supabase hosted. `supabase db reset` dan `supabase test db` lokal tetap NOT VERIFIED karena stack lokal memerlukan container runtime. Setelah pengguna mengonfirmasi seluruh assertion hosted lulus, pekerjaan Tahap 04 dilanjutkan; hasil lokal tetap dicatat sebagai risiko.

## Hasil Tahap 03

**Status: PARTIAL — hosted policy suite PASS; local database test NOT VERIFIED.** Pengguna menerapkan migration ke proyek Supabase cloud melalui CLI; `migration list --linked` mengonfirmasi timestamp yang sama pada local dan remote. Pemeriksaan metadata mengonfirmasi 18/18 tabel mengaktifkan RLS. SQL Editor juga mengonfirmasi anon tidak memiliki akses schema/repository, authenticated tidak dapat insert scan run, dan authenticated dapat insert triage. pgTAP tenant suite direncanakan 20 assertion dan pengguna mengonfirmasi seluruh skrip dijalankan; hasil terakhir `ok 20`, tanpa exception dari `finish(true)`. Tes `supabase db reset` dan `supabase test db` pada stack lokal tetap NOT VERIFIED karena Docker tidak tersedia.

- Entity dan nama mengikuti ERD/DBA v1.1; pemetaan prompt dicatat pada D-005 dan `docs/DATA_DICTIONARY.md`.
- RLS aktif untuk seluruh 18 tabel. Hak baca memakai membership; anonymous tidak diberi grant; direct authenticated ingestion writes ditutup.
- Owner/maintainer dapat append triage sebagai aktor dirinya sendiri; viewer hanya membaca. Data observasi dan history triage dijaga append-only.
- Seed hanya berisi pengguna/organisasi/repository sintetis lokal; user fixture tidak memiliki password.
- Tes mencakup RLS per tenant, role owner/viewer, profil sendiri, append-only triage, hak insert ingestion, dan duplikasi tuple GitHub run.
- Remote PostgreSQL berhasil menerima migration. Clean local reset dan tes pgTAP lokal tetap NOT VERIFIED karena Docker tidak tersedia. Pengguna mengonfirmasi seluruh 20 assertion pgTAP pada hosted project selesai dan tidak ada exception.

## Hasil Tahap 04

**Status implementasi: PASS untuk contract, parser, sanitasi, coverage, deduplikasi, dan unit tests sintetis. Keluaran scanner nyata: NOT VERIFIED.**

- `packages/contracts` menyediakan Zod schemas strict untuk report envelope v1, execution provenance, findings, references allowlist, dan coverage.
- `packages/scanner-adapters` menyediakan parser pure untuk Semgrep, OSV-Scanner, Gitleaks CLI, dan Composer Audit; parser tidak menjalankan scanner.
- Sanitizer menormalisasi path relatif, menolak traversal dan path absolut luar checkout, membersihkan HTML, meredaksi credential yang dikenali, membuang URL query/fragment, dan mengizinkan host referensi tertentu saja. Gitleaks `Match`, `Secret`, dan `Line` tidak dibaca.
- Coverage mendeteksi PHP/Node, framework hanya dari key dependency manifest, nested projects, lockfile berbeda, dan alasan engine yang di-skip. Status laporan membedakan completed/partial/failed; nol finding tidak dianggap aman.
- Deduplikasi advisory hanya berlaku jika package dan ID cocok tanpa konflik path/version yang diketahui; provenance semua scanner dipertahankan. Perbedaan severity menjadi `unknown`.
- Fixture PHP/Node dan JSON scanner memakai identifier/credential sintetis yang jelas bukan hasil scan aktual.
- `pnpm check` PASS: format check, ESLint, TypeScript, 23 unit tests, dan production build Vite.
- Belum menjalankan Semgrep, OSV-Scanner, Gitleaks, atau Composer terhadap fixture. Output binary dan coverage ruleset awal masih NOT VERIFIED; keputusan ruleset dicatat pada D-015.

## Hasil Tahap 05

**Status lokal: implementasi dan bundle berhasil dibangun. GitHub-hosted runner, output binary scanner, OIDC, dan ingestion: NOT VERIFIED.**

- `templates/github-workflows/sentinel-scan.yml` hanya memicu `push` ke default branch dan `workflow_dispatch` dari default branch; tidak ada pull request trigger. Job scan memiliki `contents: read`; reporter terpisah tanpa checkout hanya memiliki `id-token: write`.
- Runtime menjalankan Semgrep CE dengan rules Sentinel MIT, OSV-Scanner, Gitleaks, dan Composer Audit tanpa menjalankan install/build/test script repository. Scanner menggunakan container terpisah, read-only mount, batas resource dan waktu, serta output yang tidak dicetak ke log.
- Hanya report JSON yang dinormalisasi oleh adapter dan schema Tahap 04 yang diunggah. Output JSON mentah Gitleaks dibuat sementara di `$RUNNER_TEMP` dan dihapus; OIDC token serta pairing nonce tidak dimasukkan ke artifact.
- Aturan Semgrep memakai manifest versi/digest dan runtime memblokir digest yang berubah. Dasar lisensi dan batas coverage awal dicatat pada D-015.
- `pnpm build:workflow` berhasil menghasilkan `templates/github-workflows/sentinel-runner.mjs` berukuran 230.80 kB dari source adapter. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, dan `pnpm build` lulus secara lokal; bukti perintah dicatat di gate QA.
- Workflow belum dicoba pada hosted runner. Komputer ini tidak memiliki Docker atau GitHub CLI; tidak ada run scanner nyata atau validasi klaim OIDC.
- Endpoint ingestion backend sudah di-deploy setelah migration Tahap 06 diterapkan. Source API user terautentikasi dan dashboard LIVE Tahap 07 tersedia lokal; typecheck serta Vite production build web lulus. Migration 003 dan Edge Function `sentinel-api` telah diterapkan pada 29 Oktober; CLI mengonfirmasi function ACTIVE dengan verifikasi JWT aktif. Frontend preview kini memakai URL dan publishable key lokal, tetapi belum ada login atau request API dengan sesi user dan test tenant A/B. Tidak ada workflow yang dipasang otomatis ke repository target.

## Hasil Tahap 06

**Status: migration 002 dan Edge Function `sentinel-ingest` telah diterapkan ke Supabase berdasarkan output CLI pengguna; SQL pgTAP dan ingestion end-to-end: NOT VERIFIED.**

- `sentinel-ingest` memverifikasi GitHub OIDC RS256 dengan issuer/JWKS statis, audience URL project yang exact, klaim waktu wajib, event yang diizinkan, dan identitas repository/workflow/run/SHA/ref. Token GitHub bukan Supabase JWT; pengecekan platform dinonaktifkan hanya pada fungsi ini dan verifikasi dilakukan di handler.
- Handler membatasi body 4 MiB, menolak content-type lain, memvalidasi schema report, membandingkan semua klaim ke report, menghitung idempotency key dari repository/run/attempt, menghitung digest body dan claim, menghapus nonce plaintext, serta memberi respons generik.
- `ingest_scan_report` pada migration baru mengikat pairing hanya dengan nonce hash dan nama/ID repo hasil OIDC, memeriksa workflow allowlist, rate limit sementara 30 report baru/menit/repo, lalu menyimpan scan, coverage, engine, findings/evidence/advisories, receipt dan audit dalam satu transaksi.
- Run menyimpan `workflow_ref`; evidence path diwajibkan. Composer runner menambahkan path `composer.lock` yang benar-benar dipindai. Report version 1 tidak menyediakan dependency inventory lengkap sehingga tabel inventori tidak direkayasa.
- `pnpm run sentinel:ingest:check` menjalankan verifier/handler di Node dengan key lokal dan RPC mock; 8 test lulus. Typecheck contracts, ESLint, adapter tests (15), Prettier, reporter `node --check`, dan bundle workflow (231.33 kB) juga lulus. Ini bukan Supabase Edge Runtime atau integration test database.
- Pengujian SQL pgTAP, klaim OIDC pada GitHub-hosted runner, koneksi runtime Edge ke database, dan ingestion report end-to-end tetap NOT VERIFIED. Pengguna mengonfirmasi migration linked dan deploy Edge Function berhasil; Deno dan Docker tidak tersedia di shell ini.
