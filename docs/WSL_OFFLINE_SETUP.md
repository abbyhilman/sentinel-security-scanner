# Menjalankan Sentinel offline lewat WSL

Panduan ini untuk Windows 10/11 dengan WSL 2. Pada komputer yang diuji, Ubuntu sudah terdaftar tetapi gagal dimulai dengan `HCS_E_SERVICE_NOT_AVAILABLE`. Semgrep native gagal dengan `Invalid argument socketpair`. Menjalankan Semgrep di Linux adalah jalur yang akan diuji setelah WSL aktif; keberhasilannya belum diverifikasi pada komputer ini.

## 1. Aktifkan fitur Windows dari PowerShell Administrator

Simpan pekerjaan yang sedang terbuka. Buka Start, cari **PowerShell**, klik kanan, lalu pilih **Run as administrator**. Jalankan:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --update
```

Perintah DISM mengubah fitur Windows dan memerlukan Administrator. Setelah selesai, **restart Windows melalui menu Start**. Jangan menghapus atau menjalankan `wsl --unregister` terhadap distro yang sudah ada.

Sumber: [pemasangan WSL Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install) dan [pemasangan manual fitur WSL](https://learn.microsoft.com/en-us/windows/wsl/install-manual).

## 2. Pastikan Ubuntu dapat dimulai

Setelah restart, buka PowerShell biasa:

```powershell
wsl --list --verbose
wsl -d Ubuntu-24.04
```

Kolom VERSION seharusnya `2`. Jika nama distro berbeda, pakai nama yang tampil pada daftar. Jika Ubuntu belum terdaftar, pasang lewat `wsl --install -d Ubuntu-24.04`, lalu ikuti pembuatan akun Linux. Jika distro masih VERSION `1`, konversi dengan `wsl --set-version Ubuntu-24.04 2` sebelum melanjutkan.

Jika masih muncul `HCS_E_SERVICE_NOT_AVAILABLE` atau `0x80370102`, cek **Task Manager → Performance → CPU → Virtualization**. Jika tertulis Disabled, aktifkan Intel VT-x/AMD-V pada BIOS/UEFI sesuai panduan produsen komputer, lalu restart. Jangan menonaktifkan Secure Boot atau antivirus sebagai langkah coba-coba. Lihat [troubleshooting resmi WSL](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting#installation-issues).

Lanjut hanya setelah prompt Ubuntu muncul dan perintah ini berhasil:

```bash
uname -s
```

Output yang diharapkan: `Linux`. Perintah Bash di bawah dijalankan pada terminal Ubuntu, bukan PowerShell.

## 3. Siapkan Node.js Linux

Pemasangan ini membutuhkan internet, tetapi belum membaca repository aplikasi. Node.js Windows tidak menggantikan Node.js Linux.

```bash
cd "$HOME"
sudo apt update
sudo apt install -y ca-certificates curl git tar unzip
sentinel_nvm_installer="$(mktemp)"
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh -o "$sentinel_nvm_installer" && bash "$sentinel_nvm_installer"
rm -- "$sentinel_nvm_installer"
source "$HOME/.nvm/nvm.sh"
nvm install 24
node --version
node -p process.platform
```

Output platform harus `linux`. Jika muncul `win32`, jangan lanjut: terminal masih memakai Node Windows. Jika membuka tab Ubuntu baru dan `node` belum dikenali, jalankan kembali `source "$HOME/.nvm/nvm.sh"` dan `nvm use 24`.

Sumber: [Node.js pada WSL dari Microsoft](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl) dan [rilis resmi nvm v0.40.8](https://github.com/nvm-sh/nvm/releases/tag/v0.40.8).

## 4. Clone Sentinel dan unduh cache publik

Masih di Ubuntu:

```bash
mkdir -p "$HOME/sentinel-workspace"
cd "$HOME/sentinel-workspace"
git clone https://github.com/abbyhilman/sentinel-security-scanner.git
cd sentinel-security-scanner
node sentinel.mjs prepare-offline
```

Jika sudah pernah clone pada folder Linux tersebut, masuk ke folder Sentinel dan jalankan `git pull --ff-only` sebagai pengganti clone. Cache executable Windows tidak dapat menggantikan executable Linux.

`prepare-offline` mengunduh engine resmi dan database publik lengkap npm/Packagist. Unduhan sekitar beberapa ratus MB dan dapat memakan waktu. Perintah tidak menerima path repository, tidak menginventarisasi aplikasi, dan tidak melakukan query nama/versi dependency pengguna. Semua status harus `CACHED`; ini hanya membuktikan cache siap, belum membuktikan seluruh engine dapat memindai.

## 5. Scan repository Windows dengan mode offline

Masih dari folder Sentinel di Ubuntu, salin blok ini lalu masukkan path Windows repository saat diminta. Contoh path: `D:\Projects\aplikasi-saya`.

```bash
read -r -p 'Path Windows repository: ' sentinel_target_windows
sentinel_target_linux="$(wslpath -u "$sentinel_target_windows")"
node sentinel.mjs scan "$sentinel_target_linux" --offline \
  --output "./report-offline-$(date +%Y%m%d-%H%M%S).json"
echo "Exit code: $?"
```

Mode `--offline` tidak mengunduh tool/database, tidak memakai Semgrep Registry, dan tidak mengirim query paket ke OSV. Jangan menambahkan `--dependencies`: itu opsi audit online yang berbeda. OSV membaca snapshot lokal; Semgrep core membaca rules Sentinel lokal; Gitleaks memakai konfigurasi lokal yang dikendalikan Sentinel. Tidak menjalankan script/build/install aplikasi.

Periksa status **Semgrep, Gitleaks, dan OSV** pada tabel. Status engine `FAILED` membuat exit code `2` dan hasil `SEBAGIAN GAGAL`; jangan menganggap scan lengkap berhasil. Exit code `1` berarti ada temuan untuk ditinjau, `0` berarti tidak ada temuan pada cakupan yang diperiksa. Riwayat Git belum diperiksa, rules Semgrep terbatas, dan nol temuan tidak membuktikan aman.

Snapshot database bertanggal. Untuk memperbaruinya, jalankan kembali `prepare-offline` saat internet tersedia; tahap ini tetap hanya mengunduh data publik. Snapshot lama dipertahankan di cache. Jangan menyamakan database lama dengan advisory terkini.

## Bukti yang perlu dicek setelah restart

- `wsl --list --verbose` menunjukkan Ubuntu dengan VERSION 2.
- `uname -s` menunjukkan Linux; `node -p process.platform` menunjukkan linux.
- `prepare-offline` berhasil mengunduh cache Linux dan database.
- Scan fixture Node/PHP menghasilkan temuan Semgrep sesuai aturan, bukan sekadar engine `--version` berhasil.
- Dummy secret terdeteksi oleh Gitleaks dan nilainya tidak muncul pada terminal/JSON.
- Lockfile sintetis rentan menghasilkan advisory dari database lokal.

Sampai bukti ini dijalankan setelah WSL aktif, keberhasilan Semgrep di WSL tetap **NOT VERIFIED**. Aktivasi fitur Windows dan restart dilakukan pengguna, bukan otomatis oleh Sentinel.
