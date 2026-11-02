# Ringkasan pengujian CLI lokal

**Tanggal:** 2 November 2026

**Lingkungan:** Windows PowerShell, Node.js 24.18.0, scan dijalankan dari `D:\ProjectAbby`.

## CLI pemeriksaan cepat

- `node --test tests/local-cli.test.mjs`: **6 lulus, 0 gagal**. Bantuan, exit code, fixture PHP/Node, report JSON, dummy secret, batas ukuran, folder dependency, file output yang sudah ada, dan argumen tambahan diperiksa.
- Scan fixture Node: 1 temuan di `positive.js:3`, exit code 1. Scan fixture PHP: 1 temuan di `positive.php:6`, exit code 1. Fixture tanpa pola: 0 temuan, exit code 0 dengan peringatan cakupan terbatas.
- Scan repository Sentinel: 64 file, 6 kecocokan pola, exit code 1. Kecocokan tersebut kandidat review, bukan kerentanan terkonfirmasi.
- `node --check sentinel.mjs` dan `git diff --check`: lulus pada pengujian sebelumnya.
- Symlink: **NOT VERIFIED**. Windows menolak pembuatan symlink pada environment test; assertion lain tetap berjalan.

## Bug yang diperbaiki

`scan . <folder-lain>` sebelumnya menerima dua target dan memakai target kedua. Parser sekarang menolak target tambahan. Pola perintah shell juga semula menandai metode regex `.exec()`; kasus tersebut kini dikecualikan dan diuji.

## Pemeriksaan engine lokal

Pengguna menyetujui unduhan otomatis ke cache lokal. OSV-Scanner v2.7.0 dan Gitleaks v8.30.1 diunduh dari release resmi ke `.sentinel-cache/` yang diabaikan Git; SHA-256 cocok dengan checksum release. Kedua executable berhasil menjalankan `--version`. Gitleaks memeriksa fixture Node dan melaporkan nol secret. OSV-Scanner berjalan, tetapi `pnpm-lock.yaml` sintetis tidak menghasilkan paket sehingga tidak memvalidasi advisory nyata.

Semgrep v1.182.0 berhasil dipasang ke virtual environment cache dan `--version` berjalan di luar sandbox. Pemindaian dan validasi rules gagal karena `semgrep-core` mengembalikan kesalahan `socketpair` pada environment Windows ini. Composer Audit belum dicoba karena PHP dan Composer tidak tersedia. Cache tersebut belum diintegrasikan ke CLI; unduhan otomatis setelah clone belum selesai.

## Batas kesimpulan

Pola teks dapat cocok dengan komentar, string, fixture, atau source CLI sendiri. Enam kecocokan pada repository Sentinel tidak membuktikan eksploitasi. Scan cepat belum menjalankan empat engine penuh. Jalur GitHub Actions/Supabase end-to-end tidak diuji di sini.

## Pembaruan: tabel terminal dan audit dependency opsional

2 November 2026, Windows x64 / Node.js 24.18.0:

- `pnpm check`: PASS untuk format, ESLint, TypeScript, tes CLI dan 31 tes workspace, serta build. Build dashboard masih memberi peringatan chunk >500 kB.
- Tes CLI mencakup tabel dengan wrapping, terminal control escaping, ringkasan, pencegahan, report tanpa source/secret, exit code, advisory tanpa fix, validasi paket/ekosistem untuk kandidat fix, output malformed, path di luar target, paket lokal yang dilewati, dan audit tanpa lockfile. Symlink tetap NOT VERIFIED karena Windows menolak pembuatannya.
- Bootstrap OSV 2.7.0 dari rilis resmi: PASS di Windows x64; checksum diverifikasi sebelum executable dipakai. Platform Linux/macOS dan ARM64: NOT VERIFIED.
- `node sentinel.mjs scan .sentinel-cache/audit-fixture --dependencies --output .sentinel-cache/audit-smoke-report-2.json`: PASS, exit code 1. Fixture sintetis lodash 4.17.20 dengan lockfile npm registry valid menghasilkan 5 kecocokan advisory. Kandidat fix per advisory dan tautan OSV muncul pada tabel/JSON. Tidak ada package yang diinstal.
- Fixture pertama tanpa `resolved` menghasilkan paket `source=LOCAL` yang tidak diperiksa advisory oleh OSV. Parser kini mencatat paket tersebut sebagai dilewati, bukan paket berhasil diaudit; jika semua paket dilewati, status SKIPPED. Kasus ini diuji regresi.
- Scan lokal tanpa jaringan pada repository pilihan pengguna: PASS, 342 file, 0 kecocokan pola, 9 folder diabaikan. Ini tidak membuktikan source aman.
- Audit online repository pilihan pengguna: NOT VERIFIED, diblokir pemeriksaan persetujuan otomatis sambil menunggu izin pengiriman metadata dependency ke OSV. Uji audit jaringan yang berhasil menggunakan fixture sintetis di cache Sentinel.
- Semgrep, Gitleaks, Composer Audit: belum dijalankan oleh CLI. OSV mencakup advisory yang dikenali dari lockfile yang didukung, termasuk Composer lockfile; ini bukan eksekusi Composer Audit.

Kandidat fix adalah batas perbaikan advisory, belum solver kompatibilitas antar-advisory. Pemilihan versi final, perubahan dependency, test aplikasi setelah upgrade, full-engine scan, serta pemindaian keamanan menyeluruh belum diverifikasi oleh perubahan ini.
