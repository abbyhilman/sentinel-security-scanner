# Sentinel Security Scanner

Sentinel memeriksa folder kode PHP, JavaScript, atau TypeScript dari terminal. CLI menyediakan **pemeriksaan pola cepat** dan **audit dependency melalui OSV dengan opsi `--dependencies`**. Cukup clone Sentinel dan jalankan dengan Node.js; tidak perlu menyiapkan GitHub Actions, Supabase, Docker, atau `pnpm`.

> **Cakupan terbatas:** Semgrep, Gitleaks, dan Composer Audit belum terhubung ke CLI lokal. OSV berjalan hanya jika `--dependencies` diberikan. Tidak ada temuan bukan bukti bahwa repository aman.

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

## Audit paket dan kandidat versi perbaikan

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

Pola teks bisa cocok dengan komentar, string, atau contoh kode. Report menandai mode `local-quick` dengan `coverage: limited`; hasil OSV tercatat terpisah dalam `dependencyAudit`. Semgrep, Gitleaks, dan Composer Audit belum terhubung. Saran pencegahan berasal dari pemetaan aturan yang tetap, tanpa AI saat runtime. Rencana peningkatan ada di [rencana CLI lokal](docs/LOCAL_CLI_TASK_PLAN.md).

## Jika perintah tidak berjalan

- **`node` tidak dikenali:** pasang Node.js 22.12.0 atau lebih baru, lalu buka ulang PowerShell.
- **Folder target tidak ditemukan:** pastikan path setelah `scan` adalah folder yang ada; gunakan tanda kutip jika path mengandung spasi.
- **File report sudah ada:** pakai nama baru setelah `--output`. Sentinel sengaja tidak menimpa hasil lama.
- **Menemukan nol pola:** baca ringkasan cakupan. Tambahkan `--dependencies` untuk advisory; deteksi secret oleh Gitleaks belum tersedia di CLI.

Untuk pengembang yang ingin memeriksa CLI, jalankan `node --test tests/local-cli.test.mjs tests/local-report.test.mjs`. Hasil pengujian terakhir ada di [ringkasan pengujian](docs/LOCAL_CLI_TEST_SUMMARY.md). Source dashboard, Supabase, dan workflow GitHub dari tahap sebelumnya masih ada di repo, tetapi tidak diperlukan untuk langkah terminal di atas.
