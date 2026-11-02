# Rencana Sentinel CLI Lokal

**Status:** CLI pemeriksaan cepat dan audit OSV opsional tersedia; empat engine penuh belum terintegrasi, 2 November 2026

**Pembaruan offline:** `prepare-offline` dan `scan --offline` sudah tersedia untuk core Semgrep, Gitleaks, serta OSV dengan database npm/Packagist lokal. Gitleaks dan OSV berhasil diuji secara offline. Semgrep native masih gagal pada Windows ini; WSL belum dapat dimulai. Pengguna memilih panduan `WSL_OFFLINE_SETUP.md` dan harus mengaktifkan fitur Windows/restart sebelum verifikasi Semgrep Linux dilanjutkan. Composer Audit terpisah belum terintegrasi. Daftar pekerjaan historis di bawah belum seluruhnya selesai.

Pembaruan: `--dependencies` menambahkan bootstrap OSV resmi dengan checksum, pemindaian lockfile, kandidat versi fix per advisory, tabel terminal, saran pencegahan, dan ringkasan. Detail penggunaan ada di README. Pengujian Windows serta batas yang belum diverifikasi dicatat di `LOCAL_CLI_TEST_SUMMARY.md`. Bagian preflight di bawah adalah catatan historis sebelum implementasi ini.

**Arah produk:** penggunaan scanner melalui terminal lokal; UI bukan alur pemakaian.
**Catatan:** `node sentinel.mjs scan <folder>` dapat langsung dipakai setelah clone pada komputer dengan Node.js 22.12+. Hasilnya diberi label `local-quick` dan `limited`.

## Kondisi sekarang

- `packages/scanner-adapters/src/workflow-runner.mjs` hanya dapat berjalan dengan metadata GitHub Actions dan menjalankan tool dalam container Docker.
- `templates/github-workflows/sentinel-runner.mjs` adalah bundle untuk workflow tersebut, bukan CLI lokal.
- Environment saat ini memiliki Node.js 24 dan pnpm. Docker, Semgrep, OSV-Scanner, Gitleaks, serta Composer belum tersedia sebagai command lokal.
- Skema report saat ini mengharuskan identitas GitHub run. CLI lokal perlu provenance baru dan tidak boleh mengarang identitas run atau repository GitHub.

## Daftar pekerjaan

1. **Selesai: kontrak CLI cepat dan report lokal** — perintah `node sentinel.mjs scan <folder>`, `--output`, bantuan `--help`, exit code, dan label cakupan terbatas.
2. **Selesai: entrypoint terminal** — Node.js standar, tanpa instalasi package atau Python.
3. **Tambahkan bootstrap engine** — pengguna menyetujui unduhan otomatis ke cache proyek. Kunci versi dan SHA-256, lalu unduh hanya paket resmi yang sudah diverifikasi. Kegagalan unduh harus membuat status engine gagal, bukan sukses.
4. **Tambahkan inventory folder lokal** — scan checkout yang dipilih, abaikan `.git`, dependency/build output, batasi file/path, dan tangani symlink dengan aman.
5. **Jalankan scanner tanpa Docker** — panggil binary lokal dengan argumen terpisah, timeout dan output cap; Composer harus memakai opsi tanpa plugin/script. Tidak menjalankan build, test, install, atau source repository.
6. **Pakai ulang adapter dan sanitizer** — normalisasi Semgrep, OSV-Scanner, Gitleaks, dan Composer Audit; nilai secret/raw line tidak boleh masuk report, terminal, atau log.
7. **Tulis report lokal** — hasil JSON tersanitasi dengan status tiap engine, coverage, tool/ruleset version, commit SHA jika tersedia, dan tanpa OIDC/claim GitHub palsu. Default tidak mengirim data ke Supabase.
8. **Tampilkan ringkasan CLI** — temuan dan engine status; partial/skipped/failed harus jelas, dan nol temuan tidak ditampilkan sebagai aman.
9. **Uji di Windows dari `D:\ProjectAbby`** — jalankan `--help`, preflight, scan fixture sintetis, redaksi dummy secret, output JSON, dan exit code.
10. **Pensiunkan UI dan onboarding workflow** — setelah jalur CLI lulus smoke lokal, hapus UI dari alur produk dan sederhanakan dokumentasi/install files. Pertahankan backend historis sampai dipastikan tidak lagi diperlukan.

## Usulan antarmuka

```powershell
node D:\ProjectAbby\sentinal\sentinel.mjs scan D:\path\ke\repository `
  --output D:\path\ke\sentinel-report.json
```

Perintah ini menjalankan pemeriksaan cepat bawaan. Cakupan empat engine penuh masih memerlukan pekerjaan pada daftar di atas; report cepat tidak menyamarkan engine yang belum dijalankan sebagai sukses.

## Risiko dan batas

- Tanpa Docker, binary berjalan langsung di komputer pengguna sehingga isolasi proses lebih rendah. CLI tetap tidak menjalankan script aplikasi repository.
- Hasil local-only belum otomatis masuk ke dashboard/database. Pengiriman report lokal memerlukan desain autentikasi/provenance terpisah dan tidak boleh menggunakan GitHub OIDC palsu atau service-role key.
- Scan cepat lokal berjalan dengan Node.js yang sudah tersedia. Scanner binaries penuh belum tersedia pada environment ini.

## Preflight terminal sebelum CLI dibuat

Dijalankan dari `D:\ProjectAbby`:

| Perintah / pemeriksaan                                                          | Hasil                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm --dir .\sentinal run`                                                     | PASS untuk membaca workspace; belum ada command `sentinel` / `scan`.                      |
| `node .\sentinal\packages\scanner-adapters\src\workflow-runner.mjs`             | FAIL sebelum scan: Node tidak menyelesaikan import TypeScript extensionless `./coverage`. |
| Pencarian executable `docker`, `semgrep`, `osv-scanner`, `gitleaks`, `composer` | Tidak tersedia pada PATH terminal saat ini.                                               |

Preflight ini mencatat kondisi awal sebelum `sentinel.mjs` dibuat.

## Smoke CLI lokal

Dari `D:\ProjectAbby`, `node .\sentinal\sentinel.mjs --help` berhasil. Scan `fixtures/node` menemukan satu pola evaluasi dinamis dan scan `fixtures/php` menemukan satu query SQL mentah. Keduanya mengembalikan exit code `1` sesuai kontrak temuan. Scan `fixtures/node/missing-lock` tidak menemukan pola dan mengembalikan `0`. Pemeriksaan sintaks `node --check` lulus. Report JSON uji tidak memuat baris source atau nilai secret. Seluruh hasil ini hanya membuktikan pemeriksaan cepat; empat engine penuh belum diuji di CLI.
