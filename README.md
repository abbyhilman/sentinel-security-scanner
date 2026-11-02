# Sentinel Security Scanner

Sentinel dapat memeriksa folder kode PHP, JavaScript, atau TypeScript dari terminal. Mode lokal saat ini adalah **pemeriksaan pola cepat**. Anda cukup clone Sentinel dan menjalankannya dengan Node.js; tidak perlu menyiapkan GitHub Actions, Supabase, Docker, atau `pnpm`.

> **Cakupan terbatas:** CLI lokal belum menjalankan Semgrep, OSV-Scanner, Gitleaks, atau Composer Audit. Tidak ada temuan bukan bukti bahwa repository aman.

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

Output akan menyebut jumlah file dan temuan, misalnya `positive.js:3`. Exit code `1` pada contoh ini **berarti ada temuan untuk ditinjau**, bukan program rusak.

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

Contoh satu baris temuan:

```text
positive.js:3  sentinel.quick.node-dynamic-evaluation
```

Artinya pola yang perlu ditinjau ditemukan di baris 3 `positive.js`. Buka file tersebut dan periksa konteksnya. Kecocokan pola **bukan** bukti kerentanan atau eksploitasi.

| Exit code | Arti                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| `0`       | Pemeriksaan selesai tanpa kecocokan pola. Cakupan tetap terbatas.                              |
| `1`       | Ada satu atau lebih kecocokan pola untuk ditinjau.                                             |
| `2`       | Perintah gagal, misalnya folder target salah, argumen tidak valid, atau file output sudah ada. |

Di PowerShell, lihat exit code perintah terakhir dengan `$LASTEXITCODE`. Bantuan singkat tersedia lewat `node .\sentinel.mjs --help`.

## Apa yang diperiksa

Mode `local-quick` memeriksa pola eksekusi dinamis dan query SQL mentah pada PHP, serta evaluasi kode dan pemanggilan shell pada JavaScript/TypeScript. Folder `.git`, `.sentinel-cache`, `node_modules`, `vendor`, `dist`, `build`, `coverage`, `.next`, dan symlink dilewati. File lebih dari 1 MiB dilewati; scan berhenti jika mencapai 10.000 file atau 1.000 temuan.

Pola teks bisa cocok dengan komentar, string, atau contoh kode. Empat engine penuh belum terhubung ke perintah lokal, meski sebagian executable telah diuji di lingkungan pengembangan. Report menandai mode `local-quick` dengan `coverage: limited`. Rencana peningkatan ada di [rencana CLI lokal](docs/LOCAL_CLI_TASK_PLAN.md).

## Jika perintah tidak berjalan

- **`node` tidak dikenali:** pasang Node.js 22.12.0 atau lebih baru, lalu buka ulang PowerShell.
- **Folder target tidak ditemukan:** pastikan path setelah `scan` adalah folder yang ada; gunakan tanda kutip jika path mengandung spasi.
- **File report sudah ada:** pakai nama baru setelah `--output`. Sentinel sengaja tidak menimpa hasil lama.
- **Menemukan nol pola:** baca pesan `coverage: limited`; pemeriksaan ini belum meliputi dependency advisory dan deteksi secret oleh engine penuh.

Untuk pengembang yang ingin memeriksa CLI, jalankan `node --test tests/local-cli.test.mjs`. Hasil pengujian terakhir ada di [ringkasan pengujian](docs/LOCAL_CLI_TEST_SUMMARY.md). Source dashboard, Supabase, dan workflow GitHub dari tahap sebelumnya masih ada di repo, tetapi tidak diperlukan untuk langkah terminal di atas.
