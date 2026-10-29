# Tahap 06 — security review ingestion

**Status:** migration `20261028000200` dan Edge Function `sentinel-ingest` telah diterapkan. Migration `20261028000300` diterapkan dan Edge Function `sentinel-api` terdaftar ACTIVE dengan `verify_jwt=true` menurut output CLI pada 29 Oktober 2026. Typecheck, build, ESLint, Prettier, dan diff-check web lulus. Security release gate tetap terbuka: belum ada request API dengan sesi user, tenant A/B test, pairing hosted pertama, workflow GitHub-hosted, atau ingestion end-to-end.

## Batas kepercayaan

```text
GitHub Actions reporter
  -- HTTPS + GitHub OIDC bearer + sanitized JSON -->
sentinel-ingest Edge Function
  -- service key disimpan di Edge env; validated fields + hashes -->
ingest_scan_report PostgreSQL RPC
  -- one transaction -->
scan run + coverage + engines + findings/evidence/advisories + receipt + audit
```

Job scanner tidak menerima token OIDC atau service key. Reporter tidak checkout source dan hanya meminta `id-token: write`. JWT GitHub bukan JWT Supabase; platform `verify_jwt` dimatikan khusus untuk `sentinel-ingest`, lalu handler melakukan verifikasi penuh sebelum memanggil database. Tidak ada write database untuk request yang gagal di tahap HTTP/schema/signature/claim.

## Kontrol yang diimplementasikan

- Issuer dan JWKS URL adalah konstanta GitHub. JWT harus memakai RS256, `kid` yang ada di JWKS, signature valid, audience URL fungsi yang exact, serta `iss`, `exp`, `nbf`, `iat` dan klaim repo/workflow/run yang diwajibkan. Header token tidak boleh memilih `jku` atau algoritma lain.
- Klaim report dibandingkan ke klaim bertanda tangan: repository ID/nama, workflow ref, run ID/attempt, commit SHA dan ref. Hanya `push` serta `workflow_dispatch` pada branch diperbolehkan.
- Pairing pertama mencari nonce berdasarkan SHA-256, lalu mengunci row nonce/repository, mencocokkan nama dan branch default, serta menerima hanya `.github/workflows/sentinel-scan.yml`. Nonce plaintext dihapus sebelum panggilan RPC. Sesudah pairing, report memakai binding GitHub ID dan workflow allowlist; maintainer dianjurkan menghapus secret nonce.
- Idempotency key = SHA-256 dari `sentinel:v1:<repository_id>:<run_id>:<run_attempt>`. Hash body mentah disimpan; retry dengan tuple, key, dan body yang sama mengembalikan scan lama. Perubahan body untuk tuple yang sama menghasilkan 409.
- Batas request 4 MiB, schema Zod strict, `application/json`, maksimal 1.000 temuan, rate limit database sementara 30 report baru/repository/menit. Exact retry diperiksa sebelum rate limit.
- Teks deskriptif mendapat redaksi tambahan untuk beberapa bentuk credential umum. Jika teks sensitif muncul pada field identity atau path, report ditolak. Path yang wajib untuk evidence harus relatif dan aman; path `composer.lock` diambil dari coverage aktual runner.
- RPC memakai `SECURITY DEFINER`, `search_path` kosong, nama objek berkualifikasi schema, dan execute hanya untuk `service_role`. DML langsung service role dicabut dari tabel ingestion. RPC menulis run/coverage, scanner execution, findings fan-out per scanner, evidence, advisories, receipt, dan audit dalam satu transaksi.
- Receipt menyimpan hanya key/digest SHA-256 dan digest klaim terpilih. Token bearer dan nonce plaintext tidak masuk ke Postgres. Response/log tidak mengembalikan isi report atau error PostgREST.

## Batas dan risiko yang masih terbuka

1. GitHub OIDC membuktikan identitas workflow, bukan kebenaran hasil. Pemilik repo masih dapat mengubah workflow dan mengirim temuan palsu. UI harus menyebut report berasal dari workflow CI.
2. Pola redaksi di handler adalah pertahanan tambahan, bukan pendeteksi semua secret. Keamanan report tetap bergantung pada parser dan sanitizer Tahap 04 serta pemeriksaan artifact sebelum upload.
3. Pairing API Tahap 07 tersedia di project hosted bersama migration 003. Nonce dikembalikan sekali, disimpan sebagai hash, dan memiliki expiry 15 menit. Belum ada request hosted dengan sesi user, tenant A/B test, atau pairing pertama.
4. Nilai rate limit 30/menit dan payload 4 MiB masih sementara; belum diuji terhadap beban/kuota Supabase.
5. Report v1 tidak berisi inventori semua package, jadi `dependency_inventory` tidak diisi secara sintetis.
6. Audience contoh pada TDD berbeda dari audience workflow Tahap 05. Implementasi memilih URL project/function, dicatat di D-017; GitHub-hosted token nyata belum diverifikasi.
7. Koneksi database, signature/JWKS live, concurrency, rollback RPC, runtime Deno, dan pemanggilan workflow GitHub-hosted belum diverifikasi. Migration dan function sudah di-deploy, tetapi ini belum membuktikan ingestion report end-to-end.
8. `sentinel-api` menggunakan JWT pengguna untuk Auth/PostgREST dan tidak memakai service-role key. Route guard dan session expiry tersedia serta typechecked; konfigurasi Auth hosted, request user JWT, dan isolasi tenant API masih NOT VERIFIED.

## Tes dan jalur verifikasi

- Shell suite: `pnpm run sentinel:ingest:check` — **PASS, 8 tests**. Ini memakai key RS256 lokal dan RPC mock. Ia tidak membutuhkan Docker, Deno, secret Supabase, atau koneksi internet; hasilnya bukan bukti Edge Runtime/PostgreSQL.
- SQL suite: `supabase/tests/database/sentinel_ingest_test.sql`. Jalankan dengan stack lokal setelah migrasi menggunakan `pnpm exec supabase test db`; perintah ini memerlukan Docker atau runtime container kompatibel.
- GitHub-hosted verification memerlukan workflow fixture yang dimiliki pengguna, project URL, dan nonce pairing dari API Tahap 07. Jangan menaruh service role key dalam workflow target.

Dokumentasi utama: [GitHub Actions OIDC](https://docs.github.com/en/actions/reference/security/oidc), [Supabase Function configuration](https://supabase.com/docs/guides/functions/function-configuration), dan [Supabase database functions](https://supabase.com/docs/guides/database/functions).
