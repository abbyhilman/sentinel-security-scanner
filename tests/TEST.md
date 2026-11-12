# Native Python CLI: rencana dan hasil pengujian

## Rencana 12 November 2026

Perubahan ini memperjelas antarmuka `scanner.py` tanpa menambah dependency atau mengganti engine. Perintah folder langsung dan `--prepare` tetap didukung; antarmuka tambahan adalah `scan`, `prepare`, `doctor`, dan `--json`.

Pengujian otomatis mengikuti suite `test_native_scanner.py` yang sudah ada:

- Bantuan tanpa argumen, subcommand, penolakan opsi yang salah, dan kompatibilitas pemanggilan lama. Tidak menjalankan scan atau mengunduh pada perintah bantuan/invalid.
- JSON stdout tetap dapat diparse ketika progress ditulis ke stderr. Exit code, redaksi, dan report file mempertahankan kontrak yang sama.
- `doctor` memverifikasi checksum kedua engine dan database secara lokal tanpa menjalankan executable, jaringan, atau membuat cache yang belum ada. Cache hilang/rusak menghasilkan exit code 2.
- Persiapan `prepare --json` memakai fixture unduhan terkontrol dan menerbitkan manifest yang kompatibel dengan cache lama.
- Pesan hasil kosong membedakan audit sukses tanpa kecocokan advisory dari audit gagal atau dilewati.

Uji subprocess menggunakan Python dan file entrypoint absolut untuk membuktikan pemakaian dari luar checkout. Runtime tetap satu file, sehingga tidak ada tahap instalasi paket Python. Target dan output memakai direktori sementara terpisah.

Uji backend nyata: jalankan `doctor`, kemudian `scan` pada `D:\ProjectAbby\ui-magic-box-06` dengan `--offline --skip-worktrees`, simpan JSON tersanitasi di cache Sentinel, dan verifikasi dua worktree dilewati, engine yang berjalan, jumlah paket/advisory, serta konsistensi exit code. Nilai secret tidak boleh ditampilkan. Tidak mengubah atau menjalankan script repository target.

## Hasil 12 November 2026

| Pemeriksaan                                                      | Hasil                                           |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| Suite Python native                                              | PASS, 16 tes                                    |
| Regresi CLI Node                                                 | PASS, 20 tes                                    |
| `--help` dan `doctor` dari luar checkout                         | PASS                                            |
| Integritas cache engine/database nyata                           | PASS, ketiganya VERIFIED                        |
| Scan native offline `ui-magic-box-06`                            | PASS, exit code 1 sesuai indikasi secret        |
| JSON stdout cocok dengan `--output`                              | PASS                                            |
| Dua worktree `tmp` dilewati                                      | PASS                                            |
| Hash `.env`, `package.json`, `package-lock.json` sebelum/sesudah | PASS, tidak berubah                             |
| Renderer memakai report nyata                                    | PASS, pesan advisory kosong dan durasi tersedia |

Perintah suite:

```powershell
py -3 -m unittest discover -s tests -p test_native_scanner.py -v
node --test tests/local-cli.test.mjs tests/local-report.test.mjs tests/offline.test.mjs
```

Hasil nyata: 171 file source, 0 pola source, 11 indikasi secret untuk direview, 1 lockfile berhasil diaudit, 697 paket, dan 0 kecocokan advisory. Durasi scan 10,821 detik. Pola native, Gitleaks, dan OSV berstatus success; Semgrep berstatus not_requested. Snapshot database bertanggal 12 November 2026. Nilai secret tidak ditampilkan.

Report JSON lokal tersanitasi: `.sentinel-cache/cli-refine-ui-magic-20261112.json`. Capture stdout disimpan terpisah untuk memverifikasi kontrak JSON; log terminal dibuat dengan renderer terhadap report yang sama.

Batas verifikasi: runtime nyata diuji di Windows x64. Persiapan unduhan dalam iterasi ini diuji menggunakan fixture terkontrol, bukan mengunduh ulang snapshot publik. Perilaku offline mengikuti konfigurasi engine dan tes larangan unduhan Python; firewall egress/packet capture tidak dilakukan. Riwayat Git, Composer Audit terpisah, dan Semgrep tidak diperiksa oleh jalur Python. Pengujian ini tidak mengubah layanan cloud.
