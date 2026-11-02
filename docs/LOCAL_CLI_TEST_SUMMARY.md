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
