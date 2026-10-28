# Sentinel Security Scanner

Sentinel adalah MVP pemindai keamanan source code yang menggabungkan hasil SAST, dependency advisory, dan secret detection untuk repository PHP serta Node.js/TypeScript.

## Batas MVP

Pemindaian akan dijalankan oleh workflow GitHub Actions yang dipasang dan dimiliki maintainer repository target. Hasil yang disanitasi akan disimpan di Supabase dan ditampilkan di dashboard React/Vite. OIDC membuktikan identitas workflow, bukan kebenaran hasil pemindaian.

Sentinel tidak memakai AI saat runtime dan tidak menerima pemindaian URL atau ZIP. MVP juga tidak menjalankan worker sentral, Redis, BullMQ, Next.js/NestJS sebagai stack aplikasi, atau menyimpan raw source maupun nilai secret.

## Status

Tahap 01 menyiapkan monorepo dan CI. Tahap 02 menyediakan dashboard UI shell dengan data contoh sintetis; semua halaman masih dalam mode pratinjau dan tidak memanggil GitHub atau Supabase. Scanner, workflow target, database, Auth/API, dan integrasi produk belum diimplementasikan.

## Prasyarat

- Node.js 24.18.0 atau rilis kompatibel minimal 22.12.0.
- pnpm 10.13.1.
- Git.

## Setup lokal

1. Jalankan pnpm install dari root.
2. Salin .env.example ke apps/web/.env.local jika ingin menyiapkan placeholder Supabase. Gunakan publishable key saja di frontend.
3. Jalankan pnpm --filter @sentinel/web dev untuk membuka Vite.

Supabase belum dipanggil oleh aplikasi. UI menampilkan data contoh sintetis yang diberi label; angka, repositori, dan temuan bukan hasil GitHub atau scanner nyata. Environment Supabase opsional pada tahap ini; secret atau service-role key tidak boleh memakai awalan VITE_.

Font Inter dan JetBrains Mono dibundel secara lokal dari Fontsource (SIL OFL 1.1); pemberitahuan lisensi ada di `apps/web/public/licenses/`.

## Pemeriksaan

- pnpm lint
- pnpm format:check
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm check menjalankan seluruh pemeriksaan di atas.

## Struktur

- apps/web — aplikasi Vite React TypeScript.
- packages/contracts — skema dan tipe bersama.
- packages/scanner-adapters — batas package untuk adapter scanner tahap berikutnya.
- supabase — migrations dan Edge Functions tahap berikutnya.
- templates/github-workflows — dokumentasi instalasi workflow owner.
- fixtures — fixture sintetis PHP dan Node.
- docs — rencana implementasi, decision log, dan QA checklist.

Jangan memasukkan credential nyata ke fixture, log, artifact, atau contoh laporan.

