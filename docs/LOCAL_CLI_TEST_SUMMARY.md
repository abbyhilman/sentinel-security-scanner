# Ringkasan pengujian CLI lokal

**Tanggal:** 2 November 2026

**Lingkungan:** Windows PowerShell, Node.js 24.18.0, command scan dijalankan dari `D:\ProjectAbby`.

## Hasil

| Pemeriksaan                                    | Hasil              | Bukti                                                                                                                                                                |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bantuan dan exit code argumen salah            | PASS               | `node --test tests/local-cli.test.mjs`; `--help` = 0, perintah/target salah = 2.                                                                                     |
| Fixture Node                                   | PASS               | Satu temuan `positive.js:3`, exit code 1, report JSON `local-quick` / `limited`.                                                                                     |
| Fixture PHP                                    | PASS               | Satu temuan `positive.php:6`, exit code 1.                                                                                                                           |
| Fixture tanpa pola                             | PASS               | Nol temuan, exit code 0, pesan tetap menyatakan nol temuan bukan bukti aman.                                                                                         |
| Redaksi output                                 | PASS terbatas      | Dummy secret dalam baris source tidak muncul di stdout/report; report hanya berisi rule, path relatif, baris, dan pesan. Tidak membuktikan semua format secret aman. |
| Batas file dan folder dependency               | PASS               | File >1 MiB dihitung sebagai dilewati; `node_modules` tidak dipindai.                                                                                                |
| Report yang sudah ada                          | PASS               | `--output` tidak menimpa file yang sudah ada dan keluar dengan code 2.                                                                                               |
| Symlink                                        | NOT VERIFIED       | Windows menolak pembuatan symlink pada environment test; kode melewati entry yang dikenali sebagai symlink, tetapi perilakunya belum dibuktikan di mesin ini.        |
| Scan repository Sentinel sendiri               | PASS sebagai smoke | 64 file diperiksa, 8 kecocokan pola, exit code 1. Ini kandidat review, bukan delapan kerentanan terkonfirmasi.                                                       |
| Semgrep, OSV-Scanner, Gitleaks, Composer Audit | NOT RUN            | Binary tidak tersedia di PATH dan CLI lokal saat ini belum memanggil keempat engine tersebut.                                                                        |

## Bug yang ditemukan dan diperbaiki

`scan . <folder-lain>` sebelumnya menerima dua target dan diam-diam menggunakan target kedua. Parser sekarang menolak target tambahan. Sebelum perbaikan, suite menunjukkan 4 lulus dan 1 gagal; setelah perbaikan, `node --test tests/local-cli.test.mjs` menunjukkan **5 lulus, 0 gagal**.

## Batas kesimpulan

Pola teks dapat cocok dengan komentar, string, fixture, atau source CLI sendiri. Delapan kecocokan pada repository Sentinel tidak membuktikan eksploitasi. Scan cepat belum mencakup dependency advisory, deteksi secret oleh Gitleaks, atau analisis sintaks Semgrep. Jalur GitHub Actions/Supabase end-to-end juga tidak diuji dalam pengujian ini.
