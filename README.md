# Sentinel Security Scanner

Sentinel memeriksa folder kode PHP, JavaScript, atau TypeScript dari terminal. CLI menyediakan **pemeriksaan pola cepat**, **mode multi-engine offline**, serta **audit OSV online opsional**. Tidak perlu menyiapkan GitHub Actions, Supabase, atau Docker. Mode cepat cukup memakai Node.js; mode offline memerlukan cache engine/database dan runtime yang dapat menjalankan engine tersebut.

> **Scan offline di Windows:** Semgrep, Gitleaks, dan OSV berhasil diuji melalui WSL 2 dengan Ubuntu 24.04 x64. Pada Windows native, Semgrep gagal dengan `socketpair` di mesin uji. Ikuti panduan untuk mengaktifkan WSL dan menjalankan ketiga engine. [Panduan WSL](docs/WSL_OFFLINE_SETUP.md)

## 1. Siapkan Node.js dan clone Sentinel

Buka PowerShell. Pastikan `node --version` menampilkan versi **22.12.0 atau lebih baru** dan `git --version` berjalan. Lalu jalankan:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\sentinel-workspace" | Out-Null
Set-Location "$HOME\sentinel-workspace"
git clone https://github.com/abbyhilman/sentinel-security-scanner.git
Set-Location .\sentinel-security-scanner
```

Folder contoh `sentinel-workspace` dibuat di direktori pengguna Windows Anda. Jika Sentinel sudah pernah di-clone, masuk ke foldernya lalu jalankan `git pull` untuk mengambil perubahan terbaru.

## 2. Coba scan pertama

Fixture Node sudah tersedia di dalam Sentinel, jadi perintah ini bisa langsung dicoba:

```powershell
node .\sentinel.mjs scan .\fixtures\node
```

Output menampilkan tabel lokasi dan jenis temuan, status setiap engine, saran pencegahan, dan ringkasan akhir. Contohnya, fixture di atas menghasilkan temuan `positive.js:3`. Exit code `1` **berarti ada temuan untuk ditinjau**, bukan program rusak.

Untuk memeriksa repository Anda sendiri, letakkan folder repository tersebut di dalam `sentinel-workspace`, sejajar dengan folder `sentinel-security-scanner`. Ganti `nama-repository-anda` dengan nama folder yang sebenarnya:

```powershell
node .\sentinel.mjs scan '..\nama-repository-anda'
```

Jika sedang berada di root repository yang ingin dipindai, panggil file Sentinel dari folder contoh tadi:

```powershell
node "$HOME\sentinel-workspace\sentinel-security-scanner\sentinel.mjs" scan .
```

Sentinel menerima **path folder lokal**, bukan URL GitHub. Jika repository target masih ada di GitHub saja, clone repository target itu ke komputer terlebih dahulu.

## 3. Simpan hasil ke JSON (opsional)

Tambahkan `--output` dan nama file yang **belum ada**:

```powershell
node .\sentinel.mjs scan '..\nama-repository-anda' --output '.\report-sentinel.json'
```

CLI menolak menimpa report yang sudah ada. Gunakan nama baru untuk scan berikutnya, misalnya `report-sentinel-2.json`. Report berisi rule ID, path relatif, nomor baris, dan pesan; nilai secret serta isi baris source tidak disertakan. Simpan report sesuai kebijakan repository Anda karena nama file/path dapat tetap sensitif.

## Membaca hasil

Contoh tabel dari fixture Node:

```text
+-----+--------------------+-------------------------+
| No  | Lokasi file:baris   | Jenis                   |
+-----+--------------------+-------------------------+
| 1   | positive.js:3      | Evaluasi kode dinamis   |
+-----+--------------------+-------------------------+
```

Artinya pola yang perlu ditinjau ditemukan di baris 3 `positive.js`. Buka file tersebut dan periksa konteksnya. Kecocokan pola **bukan** bukti kerentanan atau eksploitasi.

| Exit code | Arti                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `0`       | Pemeriksaan selesai tanpa kecocokan pola. Cakupan tetap terbatas.                                             |
| `1`       | Ada satu atau lebih kecocokan pola untuk ditinjau.                                                            |
| `2`       | Perintah atau audit dependency gagal, misalnya jaringan bermasalah, target salah, atau file report sudah ada. |

Di PowerShell, lihat exit code perintah terakhir dengan `$LASTEXITCODE`. Bantuan singkat tersedia lewat `node .\sentinel.mjs --help`.

## Scan offline tanpa mengirim data repository

Di Windows, ikuti panduan WSL untuk menyiapkan runtime Linux, cache engine, dan isolasi jaringan yang dipakai pada pengujian. Jika Node.js Linux, `tar`, dan `unzip` sudah tersedia, buka terminal Ubuntu dan masuk ke folder Sentinel. [Panduan WSL](docs/WSL_OFFLINE_SETUP.md)

```bash
node sentinel.mjs prepare-offline
```

Perintah ini mengunduh Semgrep core 1.182.0, Gitleaks 8.30.1, OSV-Scanner 2.7.0, dan **seluruh database advisory publik npm/Packagist**. Unduhan berukuran beberapa ratus MB. Perintah tidak menerima path aplikasi atau mengirim nama/versi paket pengguna. Archive tool diverifikasi memakai SHA-256 yang dikunci dari rilis resmi; snapshot database memakai generation dan checksum metadata publik, lalu SHA-256 lokal disimpan untuk pemeriksaan integritas.

Setelah semua status persiapan menunjukkan `CACHED`, jalankan scan dengan path Linux ke repository lokal.

```bash
node sentinel.mjs scan /mnt/d/Projects/aplikasi-saya --offline --output ./report-offline.json
```

`--offline` memakai cache lokal dan tidak melakukan unduhan atau query advisory online. Jika cache hilang/rusak, engine diberi status gagal; tidak ada fallback online. Semgrep core memakai rules Sentinel lokal yang digest-nya diverifikasi, Gitleaks memakai konfigurasi lokal dengan redaksi secret, dan OSV memakai `--offline` dengan snapshot database yang diverifikasi. Script/build/install aplikasi tidak dijalankan. Tanggal snapshot database ditampilkan karena advisory setelah tanggal itu belum tercakup.

Laporan mencatat hasil setiap engine. Engine gagal menghasilkan `SEBAGIAN GAGAL` dan exit code `2`, meskipun engine lain menghasilkan temuan. Gitleaks memeriksa working tree, termasuk file lokal seperti `.env`; **riwayat Git belum diperiksa**. File besar, symlink, serta folder dependency/build berada di luar cakupan. Rules Semgrep yang disertakan masih terbatas. Mode ini tidak menjamin seluruh kerentanan ditemukan.

### Membaca langkah update

Bagian **Langkah update manual** mengelompokkan advisory berdasarkan lockfile, paket, dan versi terpasang. Setiap advisory menampilkan kandidat versi perbaikannya dari snapshot OSV. Jika versi belum diketahui, periksa advisory dan changelog sebelum memilih tindakan.

- **Langsung.** Periksa manifest dan bagian deklarasi yang ditampilkan, misalnya `devDependencies`. Pilih versi yang kompatibel dengan runtime dan peer dependency, lalu update deklarasi. Jika satu kandidat yang sama tercatat untuk semua advisory pada dependency langsung npm atau Composer, Sentinel dapat menampilkan contoh perintah untuk dijalankan setelah verifikasi.
- **Transitif.** Sentinel membaca paket induk dari lockfile npm modern dan Composer. Untuk rentang npm sederhana seperti `^0.16.47`, laporan juga menandai kandidat yang berada di luar rentang induk. Jalankan perintah penelusuran yang ditampilkan, lalu cari rilis paket induk yang sudah menerima versi perbaikan. Misalnya, jika `mermaid` masih membatasi `katex` ke cabang lama, periksa versi `mermaid` yang menerima versi perbaikan.
- **Rantai belum dipastikan.** Pada pnpm, Yarn, atau lockfile npm lama, pakai perintah penelusuran yang ditampilkan untuk memastikan versi dan workspace pemiliknya. Deklarasi di manifest sebelah lockfile bisa berbeda dengan dependency yang dipakai workspace lain.

Jalankan langkah manual dari folder lockfile yang tercantum. Setelah update, tinjau diff lockfile, jalankan tes aplikasi, lalu scan ulang. Scan hanya membaca target. Perintah update yang dijalankan sendiri bisa memerlukan registry atau cache paket. Pakai `--output` untuk menyimpan seluruh rencana di `dependencyAudit.updates`.

Linux memerlukan glibc yang kompatibel dengan wheel Semgrep. Pengujian ketiga engine memakai Ubuntu 24.04 x64 di WSL 2 dan Node.js Linux 24.22.2.

Untuk memperbarui snapshot, jalankan kembali `prepare-offline` saat internet tersedia. Snapshot lama tetap berada di cache. Jangan menggabungkan `--offline` dengan `--dependencies`; CLI menolak kombinasi tersebut.

## Audit paket online dan kandidat versi perbaikan

Jalankan dari folder Sentinel:

```powershell
node .\sentinel.mjs scan '..\nama-repository-anda' --dependencies --output '.\report-dependency.json'
```

Opsi `--dependencies` memerlukan internet dan mengizinkan pengiriman identitas serta versi paket dari lockfile ke layanan advisory OSV. Nama paket internal mungkin ikut terkirim. Source code dan nilai secret tidak dikirim oleh jalur audit ini. Tanpa opsi ini, scan pola berjalan lokal tanpa query advisory.

Saat pertama dipakai, Sentinel mengunduh **OSV-Scanner 2.7.0** dari rilis resmi GitHub ke `.sentinel-cache/osv/`, lalu memeriksa SHA-256 yang dikunci di source. Penggunaan berikutnya memakai cache dan tetap memverifikasi checksum. Windows, Linux, dan macOS pada x64/ARM64 didukung oleh pemetaan binary; pengujian langsung saat ini dilakukan di Windows x64.

Lockfile yang dicari adalah `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, dan `composer.lock`, termasuk di subfolder di luar folder yang diabaikan. Audit tidak menjalankan instalasi, build, atau script aplikasi. Konfigurasi pengecualian OSV milik repository tidak diterapkan agar advisory tidak tersembunyi oleh konfigurasi target.

Tabel dependency berisi **paket dan versi terpasang**, **ID advisory dan level dari OSV**, serta **kandidat versi fix per advisory**. Referensi OSV dan lokasi lockfile dicantumkan di bawah tabel. Jika advisory tidak mencantumkan fix atau versinya tidak dapat dibandingkan (misalnya prerelease), hasilnya `Belum diketahui`; Sentinel tidak mengarang rekomendasi.

Kandidat fix bukan versi terbaru dan belum tentu menyelesaikan seluruh advisory paket itu. Pilih cabang versi yang kompatibel, perbarui dependency langsung atau induk dependency transitif melalui package manager proyek, regenerasi lockfile, lalu jalankan test aplikasi dan audit ulang. CLI tidak memperbarui dependency secara otomatis.

Paket npm yang dianggap lokal oleh OSV tidak dihitung sebagai paket yang berhasil diaudit. Ini juga dapat terjadi pada lockfile tanpa kolom `resolved`. Jumlah paket tersebut ditampilkan. Lockfile hilang atau tanpa paket yang dapat diperiksa menghasilkan `SKIPPED`; kegagalan jaringan, checksum, timeout, atau output engine menghasilkan `FAILED` dan exit code `2`.

Tabel menampilkan maksimal 20 temuan source dan 20 advisory agar terminal tetap terbaca. `--output` menyimpan seluruh hasil tersanitasi beserta saran pencegahan, status audit, dan kandidat versi fix ke JSON.

## Apa yang diperiksa

Mode `local-quick` memeriksa pola eksekusi dinamis dan query SQL mentah pada PHP, serta evaluasi kode dan pemanggilan shell pada JavaScript/TypeScript. Folder `.git`, `.sentinel-cache`, `node_modules`, `vendor`, `dist`, `build`, `coverage`, `.next`, `.output`, dan symlink dilewati. File lebih dari 1 MiB dilewati; scan berhenti jika mencapai 10.000 file atau 1.000 temuan.

Pola teks bisa cocok dengan komentar, string, atau contoh kode. Report menandai mode `local-quick` atau `local-offline` dengan `coverage: limited`; hasil OSV tercatat di `dependencyAudit`, Semgrep/Gitleaks di `sourceEngines`. Composer Audit terpisah belum dijalankan; advisory Composer lockfile dicakup OSV. Saran pencegahan berasal dari pemetaan aturan yang tetap, tanpa AI saat runtime. Rencana peningkatan ada di [rencana CLI lokal](docs/LOCAL_CLI_TASK_PLAN.md).

## Jika perintah tidak berjalan

- **`node` tidak dikenali:** pasang Node.js 22.12.0 atau lebih baru, lalu buka ulang PowerShell.
- **Folder target tidak ditemukan:** pastikan path setelah `scan` adalah folder yang ada; gunakan tanda kutip jika path mengandung spasi.
- **File report sudah ada:** pakai nama baru setelah `--output`. Sentinel sengaja tidak menimpa hasil lama.
- **Menemukan nol pola:** baca ringkasan cakupan. Untuk Gitleaks dan advisory tanpa query keluar gunakan `--offline` setelah `prepare-offline`.
- **Semgrep gagal pada Windows:** hasil tetap sebagian gagal; ikuti [panduan WSL](docs/WSL_OFFLINE_SETUP.md), lalu verifikasi hasil scan pada Linux.

Untuk pengembang yang ingin memeriksa CLI, jalankan `pnpm test:cli` (memerlukan dependensi pengembangan) atau `node --test tests/local-cli.test.mjs tests/local-report.test.mjs tests/offline.test.mjs`. Hasil pengujian terakhir ada di [ringkasan pengujian](docs/LOCAL_CLI_TEST_SUMMARY.md). Source dashboard, Supabase, dan workflow GitHub dari tahap sebelumnya masih ada di repo, tetapi tidak diperlukan untuk langkah terminal di atas.
