# Sentinel Security Scanner

Sentinel adalah MVP pemindai keamanan source code untuk repository PHP dan Node.js/TypeScript. Scanner dijalankan oleh GitHub Actions milik maintainer repository target; report yang disanitasi dikirim ke Supabase dan ditampilkan di dashboard React/Vite.

## Batas MVP

Sentinel tidak memakai AI saat runtime dan tidak menerima pemindaian URL atau ZIP. MVP tidak menjalankan worker sentral, Redis, BullMQ, Next.js/NestJS sebagai stack aplikasi, atau menyimpan raw source maupun nilai secret.

GitHub OAuth digunakan untuk autentikasi dashboard. Login GitHub **tidak** otomatis menampilkan semua repository akun. Repository target didaftarkan secara manual, lalu harus membuktikan identitas workflow melalui pairing GitHub OIDC. OIDC membuktikan identitas workflow, bukan kebenaran hasil scan.

## Status implementasi

Tahap 01–07 tersedia di workspace branch `master`. Dashboard saat ini tersambung ke API Sentinel untuk sesi dan organisasi aktif. Template GitHub Actions tersedia, tetapi belum dipasang otomatis ke repository target. Perubahan workspace belum di-commit atau di-push.

Migration dan Edge Functions Sentinel telah diterapkan ke project Supabase berdasarkan output CLI. Alur GitHub-hosted dari scan, OIDC, pairing, hingga report tersimpan **belum diverifikasi end-to-end**. Jangan menganggap report nyata tersedia sebelum workflow target berhasil.

## Memasang workflow pada repository target

1. Dari dashboard Sentinel, daftarkan repository dengan format `owner/repo` dan branch default.
2. Buka detail repository dan buat nonce pairing sementara.
3. Pasang ketujuh file workflow ke repository target, lalu commit ke branch default.
4. Tambahkan `SENTINEL_SUPABASE_URL` sebagai repository variable dan `SENTINEL_PAIRING_NONCE` sebagai repository secret pada GitHub Actions.
5. Dari repository target, buka **Actions → Sentinel Security Scan → Run workflow** pada branch default.
6. Pairing selesai setelah report pertama diterima dan status repository di dashboard menjadi terverifikasi.

Panduan lengkap dengan screenshot GitHub, kotak merah, nama kolom, dan nilai yang perlu diisi tersedia di [panduan instalasi workflow](templates/github-workflows/README.md#2-atur-variable-dan-secret-di-github). File workflow harus dipasang oleh maintainer; Sentinel tidak menulis atau mendorong file ke repository target. Pull request tidak memicu scan.

Untuk menyalin tujuh file dari PowerShell, jalankan installer dari root repository Sentinel:

```powershell
$targetRepo = 'D:\path\to\repository-target'
& '.\templates\github-workflows\install.ps1' -TargetRepo $targetRepo
```

Installer berhenti jika menemukan file yang berbeda agar tidak menimpa perubahan target tanpa sengaja. Installer hanya menyalin file; commit dan push dilakukan dari repository target.

## Prasyarat

- Node.js 24.18.0 atau rilis kompatibel minimal 22.12.0.
- pnpm 10.13.1.
- Git.

## Menjalankan dashboard lokal

1. Jalankan `pnpm install` dari root.
2. Atur `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` di `apps/web/.env.local` untuk menghubungkan dashboard ke Supabase. Biarkan kosong untuk preview.
3. Jalankan `pnpm --filter @sentinel/web dev`.

Gunakan publishable key saja di frontend. Jangan beri awalan `VITE_` pada service-role key atau secret server. Jika Supabase belum dikonfigurasi, UI menampilkan data contoh sintetis; angka, repository, dan temuan tersebut bukan hasil GitHub atau scanner nyata.

Untuk membuat bundle runner owner-installed, jalankan `pnpm build:workflow`. Docker Desktop tidak diperlukan di komputer maintainer; template berjalan pada GitHub-hosted runner.

Pemeriksaan handler ingestion lokal:

```powershell
pnpm run sentinel:ingest:check
```

Perintah tersebut memeriksa GitHub OIDC verifier dan HTTP handler menggunakan key lokal dan RPC mock. Ini bukan pemindaian repository lokal dan tidak membuktikan Edge Function/PostgreSQL memproses report GitHub end-to-end. Menjalankan Edge Function lokal atau suite database lokal memerlukan Supabase local stack dengan Docker atau container runtime.

Font Inter dan JetBrains Mono dibundel dari Fontsource (SIL OFL 1.1); pemberitahuan lisensi ada di `apps/web/public/licenses/`.

## Pemeriksaan

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm build:workflow`
- `pnpm check` menjalankan seluruh pemeriksaan di atas.

## Struktur

- `apps/web` — aplikasi Vite React TypeScript.
- `packages/contracts` — skema dan tipe bersama.
- `packages/scanner-adapters` — parser, sanitizer, deteksi cakupan, dan runner workflow.
- `supabase` — migrations dan Edge Functions.
- `templates/github-workflows` — template workflow, dokumentasi, dan panduan visual GitHub.
- `fixtures` — fixture sintetis PHP dan Node.
- `docs` — rencana implementasi, decision log, dan QA checklist.

Jangan memasukkan credential nyata ke fixture, log, artifact, screenshot, atau contoh report.
