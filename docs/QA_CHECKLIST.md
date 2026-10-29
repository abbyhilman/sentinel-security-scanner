# Sentinel Security Scanner QA Checklist

**Tanggal pembaruan:** 29 Oktober 2026
**Status saat ini:** Implementasi lokal Tahap 01–07 tersedia. Migration Tahap 03 dan 20 assertion tenant pgTAP dikonfirmasi pengguna lulus; migration 002 dan deploy `sentinel-ingest` juga dikonfirmasi. Migration 003 telah diterapkan; `sentinel-api` berstatus ACTIVE dengan `verify_jwt=true`. Typecheck, build, lint, format, dan diff-check lulus. URL Supabase dan publishable key tersimpan di `apps/web/.env.local` (diabaikan Git), lalu web dibangun ulang. Request API memakai sesi user, tenant A/B, konfigurasi Auth provider, dashboard LIVE, dan GitHub-hosted runner belum diverifikasi. Setelah preview dimuat ulang, aplikasi memakai alur Auth Supabase; login belum diuji.

## Status yang digunakan

- **PASS:** perintah atau bukti yang disebutkan berhasil dan dapat diulang.
- **FAIL:** pemeriksaan dijalankan dan menemukan kegagalan.
- **NOT VERIFIED:** tidak dapat dibuktikan di lingkungan ini atau membutuhkan layanan/akun yang belum tersedia.
- **NOT RUN:** belum dijalankan.

## Kondisi awal Tahap 00

| Area                                    | Status       | Bukti / catatan                                          |
| --------------------------------------- | ------------ | -------------------------------------------------------- |
| Baca AGENTS.md dan playbook             | PASS         | Instruksi dan fase dibaca                                |
| Baca delapan DOCX spesifikasi           | PASS         | Teks, tabel dan diagram tertanam ditinjau                |
| Markdown mirrors di docs/specs/markdown | NOT VERIFIED | Direktori tidak ada; DOCX sumber berada di root          |
| Source code aplikasi                    | NOT RUN      | Belum ada source code pada workspace                     |
| Test suite / CI / database / workflow   | NOT RUN      | Belum ada implementasi untuk dijalankan                  |
| Git repository                          | NOT VERIFIED | git status melaporkan direktori ini bukan Git repository |
| GitHub/Supabase/cloud credentials       | NOT VERIFIED | Tidak diasumsikan tersedia atau digunakan                |

## Gate Tahap 01 — fondasi

- [x] Struktur pnpm workspace sesuai baseline.
- [x] React + Vite + TypeScript strict dapat build.
- [x] packages/contracts dan packages/scanner-adapters terpisah dengan batas tanggung jawab jelas.
- [x] Supabase scaffold, template workflow docs, fixtures, docs dan CI scaffold tersedia.
- [x] Lint, typecheck, unit test runner dan build berhasil setelah dependency install dari lockfile.
- [x] .env.example hanya placeholder; file .env dan apps/web/.env.local tidak ada.
- [x] Manifest tidak memuat runtime AI/LLM, Redis, BullMQ, Next.js/NestJS app server atau worker sentral.
- [x] Dependency install berhasil setelah registry diizinkan; instalasi offline tidak dipakai sebagai bukti lulus.

Workflow CI sudah diparse oleh Prettier dan pinned actions telah dipasang. Eksekusi pada GitHub runner berstatus NOT VERIFIED karena belum ada push.

## Gate Tahap 02 — UI shell dan mock

- [x] Route overview, repositori, detail repositori, scan, temuan, detail temuan, laporan, dan pengaturan tersedia.
- [x] Semua halaman memakai typed fixtures sintetis dan banner mode demo; tidak ada request Supabase/GitHub.
- [x] State no-data, pending, loading, complete-zero, partial, failed, unauthorized, dan error ditampilkan dengan copy yang sesuai.
- [x] Repositori pending menjelaskan owner-installed workflow dan tidak menyatakan repo terverifikasi dari nama saja.
- [x] Detail scan menunjukkan status per engine; gagal/dilewati tidak ditampilkan sebagai coverage bersih.
- [x] Findings memiliki search/filter/sort, desktop table dan mobile cards; detail menampilkan lokasi serta evidence contoh tersanitasi.
- [x] Dialog onboarding demo menghasilkan halaman pending tanpa menghubungi layanan eksternal.
- [x] Inter dan JetBrains Mono di-self-host; file lisensi ikut dipublikasikan bersama asset web.
- [x] Keyboard Escape menutup menu navigasi mobile; fokus dikembalikan ke pemicu menu.
- [x] Tidak ada horizontal overflow pada 360, 390, 768, 1024, 1440 px.
- [ ] Audit manual WCAG 2.2 AA, screen reader, contrast, keyboard seluruh komponen dan uji pengguna: NOT VERIFIED.
- [ ] Screenshot tersimpan di workspace: NOT SAVED (gambar ditinjau langsung dari browser).

GitHub Actions, live Auth, scanner dan layanan Supabase tidak diuji; semua tetap di luar Tahap 02.

## Contract, adapter dan sanitization

- [ ] Schema versi report menolak missing/unknown required fields, enum salah, nested invalid row, payload terlalu besar dan jumlah findings di atas limit terpilih.
- [ ] Fixture Semgrep, OSV-Scanner, Gitleaks CLI dan Composer Audit diparsing sesuai output versi yang dipin.
- [ ] Malformed output atau crash satu tool menghasilkan failed/partial; data valid dari tool lain tetap tersedia.
- [ ] Composer Audit skipped dengan alasan jika composer.lock tidak ada.
- [ ] Package/version yang tidak diketahui tetap unknown; tidak ditebak menjadi vulnerable atau safe.
- [ ] Fingerprint stabil antar-run untuk isu yang sama; dedupe OSV/Composer memakai alias yang terverifikasi.
- [ ] Secret sintetis tidak muncul di report ternormalisasi, artifact, stdout/stderr, logs, API response, DB, UI atau export.
- [ ] Absolute/path traversal path, HTML/script, URL non-HTTPS atau di luar allowlist dan excerpt yang melebihi limit ditolak atau dinormalisasi dengan aman.
- [ ] Versi scanner, ruleset, license approval dan provenance dapat dilacak dari run.

## Workflow GitHub Actions

- [ ] Workflow dijalankan di repository target yang memasangnya, bukan pada repository Sentinel sebagai runner sentral.
- [ ] Checkout menggunakan commit SHA yang tepat dan dicatat di report.
- [ ] Scan job hanya memiliki contents:read; reporter memiliki id-token:write minimum dan tidak checkout/mengeksekusi source.
- [ ] Scan dan reporter adalah job terpisah; reporter hanya membaca artifact JSON tersanitasi dengan batas ukuran.
- [ ] Tidak ada npm/composer install, lifecycle scripts, build/test aplikasi atau perintah source dari repository target.
- [ ] Tidak ada pull_request_target; fork pull request tidak memperoleh OIDC/report permission sensitif.
- [ ] GitHub Actions dan tool versions dipin; action refs menggunakan full commit SHA setelah diverifikasi.
- [ ] Timeout, output limits, per-tool success/failed/skipped/timed_out dan failure isolation telah diverifikasi.
- [ ] Runner link, run ID, attempt, ref, SHA dan workflow identity sesuai report.
- [ ] YAML lint dan uji pada repository fixture yang dikontrol berhasil, atau ditandai NOT VERIFIED jika akses GitHub belum ada.

## OIDC, pairing, ingestion dan database

- [ ] Signature/JWKS, algorithm allowlist, issuer, audience, exp, nbf dan iat divalidasi.
- [ ] Klaim repo ID, repository, workflow identity/ref, run ID, attempt, ref dan SHA cocok dengan report serta mapping yang disetujui.
- [ ] Repo tetap pending sebelum pairing valid; nonce acak, sekali pakai, berumur pendek, hanya hash tersimpan dan terikat ke repo/workflow.
- [ ] Token bearer/OIDC tidak muncul di log, error, artifact atau database.
- [ ] Forged token, wrong issuer/audience, expired token, mismatched repo/workflow/ref/SHA, missing claims dan reused nonce ditolak tanpa write.
- [ ] Report tanpa auth memakai jalur khusus; handler memvalidasi GitHub JWT sebelum operasi privileged.
- [ ] Exact duplicate repo/run/attempt/body mengembalikan scan yang sama; key sama dengan body berbeda ditolak 409.
- [ ] Body invalid/malformed menghasilkan 400; oversized payload menghasilkan 413; rate limit menghasilkan 429 dengan retry terbatas.
- [ ] Scan, engine runs, findings, receipt dan pairing commit secara atomik; fault pada row terakhir meninggalkan nol write parsial.
- [ ] SECURITY DEFINER RPC memakai fixed search_path, EXECUTE hanya untuk principal server yang diperlukan, dan akses anon/authenticated ditolak.
- [ ] Migrations berhasil pada database bersih; constraints/indexes/uniqueness sesuai data dictionary kanonis.
- [ ] Grants dan RLS berlaku di semua exposed tables/views; user tenant A tidak bisa read/write data tenant B.
- [ ] Owner/maintainer/viewer/anonymous dites untuk setiap permission; role dari browser tidak dipercaya.
- [ ] Triage append-only; actor, timestamp, reason dan transisi tersimpan; finding tidak dianggap fixed akibat scan partial/failed.

## UI, aksesibilitas dan reporting

- [ ] Seluruh halaman dimulai dari typed mock sebelum API aktif; UI tidak menyebut mock sebagai hasil GitHub/scanner nyata.
- [ ] Route dan state untuk onboarding, pending, verified, loading, empty, complete-zero, partial, failed, unauthorized dan error tersedia.
- [ ] Status scan dan engine tidak hanya dibedakan dengan warna; coverage, tool version, ruleset, evidence status dan provenance terlihat.
- [ ] Zero findings ditulis sebagai hasil scan yang berhasil, bukan klaim keamanan repository.
- [ ] Secret finding tidak menampilkan matched value atau baris raw source.
- [ ] Finding detail memuat lokasi, SHA, scanner/rule atau package/advisory, evidence status, sanitized excerpt dan triage history jika tersedia.
- [ ] Export hanya data sanitized, menyebut status/coverage/provenance, memiliki pagination/size bounds dan membutuhkan membership.
- [ ] Keyboard navigation, focus ring, labels, ARIA, dialog focus trap/escape, screen reader announcements dan contrast ditinjau.
- [ ] prefers-reduced-motion dihormati.
- [ ] Viewport 360, 390, 768, 1024 dan 1440 px tidak menyebabkan horizontal overflow; table menjadi kartu pada layar kecil.
- [ ] Synthetic secret tidak muncul di screenshot, browser console atau export.
- [ ] Logo Concept 1 belum disebut final sampai SVG produksi, varian 16px/monokrom, similarity/trademark dan approval selesai.

## Skenario end-to-end pra-rilis

- [ ] PHP fixture dengan composer.lock berjalan; Composer Audit dan OSV status serta dedupe benar.
- [ ] Node fixture dengan lockfile/advisory terverifikasi melaporkan package/version/advisory dengan provenance.
- [ ] Mixed monorepo menjalankan tool yang relevan tanpa duplicate scan atas lockfile yang sama.
- [ ] Gitleaks menemukan dummy secret; nilai sintetis tidak mencapai log, artifact, DB, UI atau export.
- [ ] Semgrep gagal sementara OSV sukses; run berstatus partial dan findings OSV tetap tampil.
- [ ] Workflow belum terpasang atau pairing expired; repo tetap pending dan UI memberi langkah perbaikan.
- [ ] Run exact replay tidak membuat findings/run duplikat; conflicting replay ditolak.
- [ ] User tenant B gagal membaca repository/run/finding tenant A meskipun mengetahui UUID.
- [ ] OIDC palsu atau klaim repository salah ditolak tanpa persistence.
- [ ] Supabase/GitHub quota atau outage terlihat sebagai provider/workflow issue, bukan nol findings atau hasil aman.
- [ ] Long path, banyak findings, unknown dependency version, cancellation dan scanner skipped diuji.
- [ ] Satu perjalanan first scan dari registrasi sampai dashboard diverifikasi untuk PHP dan Node.

## Gate rilis

- [ ] Seluruh P0 test suite dijalankan atau setiap blocker ditandai NOT VERIFIED dengan alasan dan langkah manual.
- [ ] Tidak ada critical security issue terbuka; review RLS, OIDC, idempotency, redaction dan workflow privilege selesai.
- [ ] Lisensi engine, ruleset, action dan kuota runner ditinjau ulang untuk penggunaan yang direncanakan.
- [ ] Threat model, data flow, retention, backup, delete behavior dan provider limits terdokumentasi.
- [ ] UX Research/REA hanya disebut tervalidasi jika evidence log dan uji pengguna benar-benar tersedia.
- [ ] Tidak ada deployment, workflow push ke repository pengguna, atau paid infrastructure tanpa approval eksplisit.

## Perintah dan hasil yang tercatat pada Tahap 00

| Pemeriksaan                           | Hasil                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Inventaris file dan dokumen           | PASS — DOCX spesifikasi tersedia di root                               |
| Ekstraksi teks/tabel DOCX             | PASS — dilakukan dengan runtime Python workspace                       |
| Tinjauan diagram tertanam             | PASS — alur arsitektur, workflow dan ERD ditinjau                      |
| Test aplikasi, lint, typecheck, build | NOT RUN — belum ada source code pada tahap itu                         |
| Git status                            | NOT VERIFIED — direktori belum merupakan Git repository pada tahap itu |

## Perintah dan hasil yang tercatat pada Tahap 01

| Perintah / pemeriksaan                          | Hasil                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| node --version                                  | PASS — v24.18.0                                                          |
| pnpm --version                                  | PASS — 10.13.1                                                           |
| pnpm install --frozen-lockfile                  | PASS — dependency berhasil dipasang dari lockfile                        |
| pnpm format                                     | PASS                                                                     |
| pnpm check                                      | PASS — format:check, lint, typecheck, 4 tests, dan Vite production build |
| Vite production build                           | PASS — menghasilkan dist/index.html dan asset bundle                     |
| Git branch dan remote                           | PASS — branch master, origin URL sesuai permintaan                       |
| Remote branch refs                              | PASS — belum ada refs saat diperiksa; remote tidak ditulis               |
| GitHub Actions CI                               | NOT VERIFIED — workflow belum dipush atau dijalankan pada hosted runner  |
| Supabase, scanner workflow, OIDC dan end-to-end | NOT RUN — fase implementasinya belum dikerjakan                          |

## Perintah dan hasil yang tercatat pada Tahap 02

| Perintah / pemeriksaan                           | Hasil                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| pnpm run format                                  | PASS                                                                                         |
| pnpm run lint                                    | PASS                                                                                         |
| pnpm run typecheck                               | PASS                                                                                         |
| pnpm run test                                    | PASS — 4 test yang sudah ada; tidak ada UI test baru                                         |
| pnpm run build                                   | PASS — Vite production build                                                                 |
| Browser route smoke                              | PASS — 8 route utama memuat judul dan banner mock                                            |
| Browser preview states                           | PASS — 8 state UI terlihat sesuai copy                                                       |
| Filter severity dan onboarding demo              | PASS — filter menyaring ke temuan critical; alur berakhir pada repositori pending            |
| Keyboard menu mobile                             | PASS — Escape menutup drawer                                                                 |
| Responsive overflow                              | PASS — document/body tidak melampaui viewport 360, 390, 768, 1024, 1440 px                   |
| Font loading                                     | PASS — Inter Variable dan JetBrains Mono Variable dimuat dari asset lokal pada lima viewport |
| Browser console errors                           | PASS — 0 error setelah route smoke dan pemeriksaan font                                      |
| WCAG 2.2 AA / screen reader / user testing / REA | NOT VERIFIED / NOT RUN                                                                       |
| Screenshot file                                  | NOT SAVED                                                                                    |

## Gate Tahap 03 — database, Auth dan RLS

| Pemeriksaan / artefak                                      | Status                                           | Bukti / catatan                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| D-004 status run, D-005 entity model, D-006 rules manifest | PASS                                             | Disepakati dan dicatat di `docs/DECISIONS.md`                                                                                           |
| Migration skema awal                                       | PASS — remote apply                              | Pengguna menjalankan `pnpm exec supabase db push --linked`; CLI melaporkan migration berhasil diterapkan                                |
| Migration history local/remote                             | PASS                                             | `pnpm exec supabase migration list --linked` menunjukkan `20261028000100` pada local dan remote                                         |
| RLS enablement 18 tabel                                    | PASS — metadata                                  | Supabase SQL Editor read-only check: `sentinel_tables=18`, `rls_enabled=18`, `without_rls=NULL`                                         |
| Anonymous schema/table grants                              | PASS                                             | Supabase SQL Editor: anon schema access `false`, repo SELECT `false`                                                                    |
| Authenticated direct-write grants                          | PASS — privilege layer                           | Supabase SQL Editor: scan-run INSERT `false`, triage INSERT `true`                                                                      |
| Policy behavior dan tenant isolation                       | PASS — hosted pgTAP                              | Pengguna menjalankan seluruh skrip terhadap proyek Supabase; 20 assertion direncanakan dan `finish(true)` tidak melempar error          |
| Tenant dan role pgTAP                                      | PASS — hosted manual run                         | SQL Editor menampilkan assertion terakhir `ok 20`; ketika semua tes terencana lulus, `finish(true)` tidak mengembalikan baris tambahan  |
| Fixture lokal                                              | NOT VERIFIED                                     | `supabase/seed.sql` ditulis; belum dijalankan                                                                                           |
| Data dictionary                                            | PASS                                             | `docs/DATA_DICTIONARY.md` menjelaskan entity, mappings, status dan akses                                                                |
| Konfigurasi TOML                                           | PASS                                             | `tomllib` berhasil membaca `supabase/config.toml`                                                                                       |
| `pnpm check`                                               | PASS                                             | Format check, ESLint, TypeScript, 4 unit tests existing dan production build; tidak memvalidasi SQL                                     |
| Supabase CLI / Docker / psql availability                  | PARTIAL                                          | CLI tersedia sebagai dependency pnpm; Docker dan psql tidak tersedia                                                                    |
| `supabase db push --dry-run`                               | PASS                                             | Preview menampilkan hanya migration `20261028000100_initial_schema.sql`; tidak mengubah database                                        |
| `supabase db reset` / `supabase test db`                   | NOT RUN                                          | Stack lokal memerlukan container runtime; pgTAP RLS tests belum dijalankan                                                              |
| pgTAP extension pada hosted project                        | PASS — available                                 | Query `pg_extension` mengembalikan `pgtap` pada schema `extensions`                                                                     |
| pgTAP tenant suite                                         | PASS — hosted manual run                         | Pengguna mengonfirmasi seluruh `tenant_rls_test.sql` dijalankan; assertion terakhir `ok 20` dan tidak ada exception dari `finish(true)` |
| Stage 04 contracts/adapters                                | PASS terbatas pada contract dan fixture sintetis | Lihat hasil Tahap 04 di bawah; output binary scanner nyata belum diuji                                                                  |

## Gate Tahap 04 — contracts, adapters, dan sanitasi

| Pemeriksaan / artefak                                             | Status                  | Bukti / catatan                                                                                                                                                                     |
| ----------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract report v1 dan schema strict                              | PASS                    | Menolak schema version yang tidak dikenal, path absolut/traversal, host referensi di luar allowlist, execution scanner duplikat, dan provenance ruleset approved yang tidak lengkap |
| Parser Semgrep JSON                                               | PASS — fixture sintetis | Severity ERROR/WARNING/INFO dipetakan konservatif; path dan message dinormalisasi; URL tidak diizinkan dibuang                                                                      |
| Parser OSV-Scanner JSON                                           | PASS — fixture sintetis | Package, versi opsional, advisory ID/alias, references, dan status potentially affected diuji                                                                                       |
| Parser Gitleaks CLI JSON                                          | PASS — fixture sintetis | `Match`, `Secret`, dan `Line` tidak dibaca; dummy secret tidak muncul dalam hasil ter-normalisasi                                                                                   |
| Parser Composer Audit JSON                                        | PASS — fixture sintetis | Package/advisory/rentang affected dan link dinormalisasi; versi terpasang tidak direkayasa                                                                                          |
| Sanitizer credential, HTML, path, dan URL                         | PASS — unit tests       | Credential dummy tidak muncul; traversal dan path absolut di luar checkout ditolak; query/fragment dihapus                                                                          |
| Coverage PHP/Node, framework hints, nested manifests dan lockfile | PASS — unit tests       | Framework dibaca hanya dari dependencies manifest; duplikat path lockfile diabaikan; proyek tanpa lockfile ditandai                                                                 |
| Deduplikasi advisory OSV/Composer                                 | PASS — unit tests       | Alias beririsan digabung dan sumber scanner dipertahankan; konflik severity menjadi unknown; path monorepo ambigu tetap terpisah                                                    |
| Status laporan completed/partial/failed                           | PASS — unit tests       | Scanner hilang atau skip tak terduga menghasilkan partial; seluruh scanner berlaku gagal menghasilkan failed                                                                        |
| `pnpm check`                                                      | PASS                    | Prettier, ESLint, TypeScript, 8 contract tests, 15 adapter tests, dan Vite production build                                                                                         |
| Keluaran binary scanner pada fixture                              | NOT VERIFIED            | Belum menjalankan Semgrep, OSV-Scanner, Gitleaks, atau Composer; fixtures JSON sintetis menguji parser saja                                                                         |
| Fuzz/property test                                                | NOT RUN                 | Tidak ada property-based test; batas dan kasus negatif utama ditutup oleh unit tests deterministik                                                                                  |
| Supabase clean local reset dan pgTAP                              | NOT VERIFIED            | Docker tidak tersedia; hosted tenant suite terpisah berstatus PASS menurut konfirmasi pengguna                                                                                      |

## Gate Tahap 05 — owner-installed workflow

| Pemeriksaan / artefak                                  | Status               | Bukti / catatan                                                                                                     |
| ------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Trigger workflow dan default branch                    | PASS — static review | Hanya `push` dan `workflow_dispatch`; job menolak ref selain default branch; tidak ada pull request trigger         |
| Permissions dan pemisahan job                          | PASS — static review | Scan `contents: read`; reporter tanpa checkout hanya `id-token: write`                                              |
| Action refs dan tool versions                          | PASS — pinned        | Action memakai commit SHA terverifikasi; image scanner menggunakan tag versi eksplisit                              |
| Semgrep license gate                                   | PASS — static review | Hanya rules Sentinel MIT; manifest dan runtime mengikat ruleset ke SHA-256 yang disetujui; lisensi dicatat di D-015 |
| Isolasi scanner, timeout, dan output cap               | PASS — static review | Container per tool, source read-only, batas resource/jaringan, log scanner dibuang, batas stdout/artifact           |
| Sanitized report dan artifact                          | PASS — static review | Parser/schema Tahap 04; artifact hanya report JSON; output mentah Gitleaks dihapus dari runner temp                 |
| Build runner bundle                                    | PASS                 | `pnpm build:workflow` berhasil membangun bundle runner dari source adapter (230.80 kB)                              |
| Format check                                           | PASS                 | `pnpm format:check`                                                                                                 |
| Lint                                                   | PASS                 | `pnpm lint`                                                                                                         |
| Typecheck                                              | PASS                 | `pnpm typecheck`                                                                                                    |
| Build web                                              | PASS                 | `pnpm build`                                                                                                        |
| JavaScript syntax runner dan reporter                  | PASS                 | `node --check` pada runner dan script reporter inline                                                               |
| YAML parse/format                                      | PASS                 | Diperiksa oleh Prettier lewat `pnpm format:check`; validasi schema pada GitHub belum diverifikasi                   |
| Eksekusi binary scanner pada repo fixture              | NOT VERIFIED         | Docker CLI tidak tersedia lokal dan tidak ada workflow fixture yang dijalankan                                      |
| GitHub-hosted runner dan YAML action schema            | NOT VERIFIED         | Workflow belum dijalankan pada GitHub; Prettier hanya memeriksa parse/format YAML                                   |
| Reporter OIDC, pairing nonce, dan Supabase ingestion   | NOT VERIFIED         | Implementasi handler/RPC ada pada Tahap 06; belum di-deploy atau diuji terhadap database linked                     |
| Deploy atau pemasangan workflow ke repository pengguna | NOT DONE             | Workflow template tidak didorong atau dipasang otomatis                                                             |

## Gate Tahap 06 — OIDC ingestion dan atomic RPC

| Pemeriksaan / artefak                                   | Status               | Bukti / catatan                                                                                      |
| ------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| GitHub issuer/JWKS tetap dan RS256 saja                 | PASS — local unit    | JWKS endpoint dipatok; RSA key fixture menandatangani token test                                     |
| Audience, issuer, `exp` / `nbf` / `iat`, klaim wajib    | PASS — local unit    | Token audience salah/kedaluwarsa/algoritma non-RS256 ditolak; GitHub-hosted claim belum diuji        |
| Report identity cocok dengan OIDC                       | PASS — local unit    | Mismatch SHA ditolak sebelum RPC mock dipanggil                                                      |
| Body 4 MiB, content-type, schema dan idempotency header | PASS — local unit    | Ukuran berlebih ditolak sebelum verifikasi token; suite memeriksa key run tuple                      |
| Redaksi credential tambahan dan nonce tidak diteruskan  | PASS — local unit    | Secret fixture diredaksi; hanya nonce SHA-256 diteruskan ke mock RPC                                 |
| Pairing, workflow allowlist, exact replay/conflict      | NOT VERIFIED         | Migration 002 telah diterapkan menurut output CLI pengguna; assertion SQL tahap ini belum dijalankan |
| Atomic insert dan tidak ada partial write               | NOT VERIFIED         | `sentinel_ingest_test.sql` tersedia; PostgreSQL tidak tersedia lokal tanpa Docker                    |
| Service role hanya memakai RPC untuk ingestion tables   | PASS — static review | Migration mencabut direct DML dan membatasi RPC; privilege runtime belum diverifikasi                |
| Rate limit repository                                   | NOT VERIFIED         | Implementasi sementara 30 laporan baru/menit; perlu uji concurrent di PostgreSQL                     |
| `pnpm run sentinel:ingest:check`                        | PASS                 | 8 tes Node/Vitest lulus tanpa Docker, Deno, credential, atau DB                                      |
| Migration linked dan Edge Function hosted               | PASS — apply/deploy  | Pengguna mengonfirmasi `db push --linked` dan deploy `sentinel-ingest` berhasil                      |
| Workflow GitHub-hosted dan ingestion end-to-end         | NOT VERIFIED         | Belum ada run workflow target yang dikonfirmasi                                                      |

## Gate Tahap 07 — authenticated API dan dashboard

| Pemeriksaan / artefak                               | Status                    | Bukti / catatan                                                                                                                                            |
| --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kontrak, migration, dan source API user             | PASS — applied/deployed   | Migration 003 diterapkan; `sentinel-api` berstatus ACTIVE dan `verify_jwt=true` menurut output CLI                                                         |
| User JWT pada Auth/PostgREST dan RLS                | NOT VERIFIED              | Source meneruskan bearer user; belum ada request hosted atau tenant A/B test                                                                               |
| Auth provider, session expiry, dan route guard      | PASS — source + typecheck | Supabase Auth, login OAuth/email, session expiry, onboarding organisasi, dan route guard terimplementasi; provider hosted belum diverifikasi               |
| UI pairing dan instruksi workflow                   | PASS — source + typecheck | Endpoint pairing ter-deploy; nonce hanya disimpan di memori tab. Pairing hosted pertama belum dijalankan                                                   |
| Halaman dashboard LIVE dan data state               | PASS — typecheck/build    | Overview, repository, scan, findings, reports, dan settings memakai API saat konfigurasi tersedia; skeleton/error/empty state tersedia                     |
| Mode MOCK vs LIVE                                   | PASS — static review      | MOCK tetap digunakan bila Supabase tidak dikonfigurasi; banner LIVE tampil saat konfigurasi aktif                                                          |
| `pnpm --filter @sentinel/web typecheck`             | PASS                      | TypeScript strict pada aplikasi web lulus, 29 Oktober 2026                                                                                                 |
| `pnpm --filter @sentinel/web build`                 | PASS                      | Vite production build lulus; ada peringatan ukuran chunk JS >500 kB                                                                                        |
| `pnpm lint` dan `pnpm format:check`                 | PASS                      | ESLint dan Prettier lulus pada workspace                                                                                                                   |
| Supabase migration 003 dry-run                      | PASS — dry-run            | Perintah hanya mengusulkan `20261028000300_authenticated_api.sql`; database tidak diubah                                                                   |
| Supabase migration 003 apply                        | PASS — CLI                | `db push --linked` menerapkan migration; `migration list --linked` mengonfirmasi timestamp lokal dan remote sama                                           |
| Edge Function `sentinel-api` deployment             | PASS — CLI                | `functions list` menunjukkan ACTIVE, versi 1, dan `verify_jwt=true`                                                                                        |
| Preview web lokal                                   | PASS                      | Build Vite berhasil dengan URL dan publishable key lokal dari `apps/web/.env.local`; muat ulang `http://127.0.0.1:4173/` untuk melihat alur login Supabase |
| Tenant A/B API dan database integration             | NOT RUN                   | Perlu test dengan sesi dua tenant; tidak dibuktikan oleh pgTAP Tahap 03                                                                                    |
| Request hosted dengan sesi user dan pairing pertama | NOT VERIFIED              | Function aktif, tetapi belum ada request API memakai sesi user atau run pairing pertama                                                                    |
| Dashboard LIVE hosted                               | NOT VERIFIED              | Konfigurasi frontend lokal sudah ada, tetapi Auth redirect/provider, login, dan request API menggunakan sesi user belum diverifikasi                       |
