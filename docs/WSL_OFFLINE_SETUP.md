# Menjalankan Sentinel offline lewat WSL

Alur ini teruji pada Windows 11 dengan WSL 2, Ubuntu 24.04 x64, dan Node.js Linux 24.22.2. Sentinel dijalankan dari clone yang ada di drive Windows. Ketiga engine selesai memindai repository lokal dengan jaringan proses Linux diisolasi.

## 1. Aktifkan fitur Windows dari PowerShell Administrator

Simpan pekerjaan yang sedang terbuka. Buka Start, cari **PowerShell**, klik kanan, lalu pilih **Run as administrator**. Jalankan:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

Setelah kedua perintah berhasil, **restart Windows melalui menu Start**. Setelah masuk kembali, cek status fitur dari PowerShell Administrator. [Pemasangan fitur WSL Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install-manual)

```powershell
Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform |
    Select-Object FeatureName, State
```

Pada mesin uji, fitur masih `EnablePending` setelah restart dan Ubuntu menampilkan `HCS_E_SERVICE_NOT_AVAILABLE`. Jika status itu muncul, simpan pekerjaan, matikan Windows sepenuhnya dengan perintah berikut, lalu nyalakan kembali. Cek kembali apakah status fitur sudah `Enabled`. [Perintah shutdown Microsoft](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/shutdown)

```powershell
shutdown.exe /s /t 0
```

## 2. Pastikan Ubuntu dapat dimulai

Setelah fitur menunjukkan `Enabled`, buka PowerShell biasa.

```powershell
wsl --list --verbose
wsl -d Ubuntu-24.04 -- uname -s
```

Pastikan Ubuntu memakai WSL versi `2` dan `uname -s` mencetak `Linux`. Pakai nama distro dari daftar jika namanya berbeda. Jika Ubuntu belum terdaftar, pasang dengan `wsl --install -d Ubuntu-24.04`. Jika distro masih memakai WSL versi `1`, konversi dengan `wsl --set-version Ubuntu-24.04 2`. [Pemasangan WSL Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install)

Jika fitur sudah `Enabled` tetapi Ubuntu masih gagal dimulai, periksa **Task Manager → Performance → CPU → Virtualization**. PowerShell juga bisa menampilkan status hypervisor dan layanan yang dipakai WSL. [Troubleshooting WSL Microsoft](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting#installation-issues)

```powershell
Get-CimInstance Win32_ComputerSystem | Select-Object HypervisorPresent
Get-Service vmcompute, WslService | Select-Object Name, Status
```

## 3. Siapkan runtime Linux di cache proyek

Buka PowerShell di root clone Sentinel, yaitu folder yang berisi `sentinel.mjs`, lalu ambil perubahan terbaru dengan `git pull --ff-only`. Jika belum punya clone, ikuti petunjuk clone di README. Jalankan blok berikut untuk mengunduh Node.js Linux dan `unzip` Ubuntu x64 ke `.sentinel-cache/wsl-runtime`. Blok ini memeriksa SHA-256 kedua arsip sebelum mengekstraknya di WSL.

```powershell
$ErrorActionPreference = 'Stop'
$distro = 'Ubuntu-24.04'
$sentinelWindows = (Get-Location).Path
if (-not (Test-Path -LiteralPath '.\sentinel.mjs' -PathType Leaf)) {
    throw 'Jalankan dari root clone Sentinel.'
}

$sentinelLinux = wsl.exe -d $distro --cd $sentinelWindows -- pwd
if ($LASTEXITCODE -ne 0) { throw 'Ubuntu belum bisa mengakses folder Sentinel.' }
$sentinelLinux = $sentinelLinux.Trim()

$runtimeWindows = Join-Path $sentinelWindows '.sentinel-cache\wsl-runtime'
$runtimeLinux = "$sentinelLinux/.sentinel-cache/wsl-runtime"
New-Item -ItemType Directory -Path $runtimeWindows -Force | Out-Null

$nodeArchive = 'node-v24.22.2-linux-x64.tar.xz'
$unzipArchive = 'unzip_6.0-28ubuntu4.1_amd64.deb'
$artifacts = @(
    @{
        Name = $nodeArchive
        Url = "https://nodejs.org/dist/v24.22.2/$nodeArchive"
        Sha256 = '48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75'
    }
    @{
        Name = $unzipArchive
        Url = "https://archive.ubuntu.com/ubuntu/pool/main/u/unzip/$unzipArchive"
        Sha256 = 'a505b9d491386167bd8e14e3383315a4a7d6539e4406745901ccf009a7988271'
    }
)
foreach ($artifact in $artifacts) {
    $archivePath = Join-Path $runtimeWindows $artifact.Name
    if (-not (Test-Path -LiteralPath $archivePath)) {
        Invoke-WebRequest -Uri $artifact.Url -OutFile $archivePath
    }
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $artifact.Sha256) {
        throw "Checksum tidak cocok untuk $($artifact.Name)."
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeWindows 'node-v24.22.2-linux-x64/bin/node'))) {
    wsl.exe -d $distro --cd $runtimeLinux -- tar -xJf $nodeArchive
    if ($LASTEXITCODE -ne 0) { throw 'Ekstraksi Node.js gagal.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $runtimeWindows 'unzip/usr/bin/unzip'))) {
    wsl.exe -d $distro --cd $runtimeLinux -- dpkg-deb -x $unzipArchive unzip
    if ($LASTEXITCODE -ne 0) { throw 'Ekstraksi unzip gagal.' }
}

$scanPath = "PATH=$runtimeLinux/node-v24.22.2-linux-x64/bin:$runtimeLinux/unzip/usr/bin:/usr/bin:/bin"
wsl.exe -d $distro --cd $sentinelLinux -- env $scanPath node --version
wsl.exe -d $distro --cd $sentinelLinux -- env $scanPath node -p process.platform
```

Pastikan keluarannya `v24.22.2` dan `linux`. Gunakan sesi PowerShell yang sama untuk langkah berikutnya agar variabel path tetap tersedia. [Rilis Node.js](https://nodejs.org/dist/v24.22.2/) dan [paket unzip Ubuntu](https://packages.ubuntu.com/noble/unzip)

## 4. Unduh cache engine dan database publik

Jalankan saat internet tersedia. Sentinel memverifikasi arsip engine dan mengunduh snapshot penuh advisory publik npm dan Packagist. Unduhan bisa mencapai beberapa ratus MB. Pada tahap ini Sentinel hanya menerima perintah persiapan cache.

```powershell
wsl.exe -d $distro --cd $sentinelLinux -- env $scanPath node sentinel.mjs prepare-offline
```

Lanjut saat Semgrep, Gitleaks, OSV, dan database menampilkan `CACHED`. Jalankan lagi langkah ini ketika perlu memperbarui snapshot advisory.

## 5. Scan repository Windows dengan mode offline

Masukkan path Windows repository saat diminta. WSL menerjemahkannya ke path Linux. `unshare --net` membuat namespace jaringan tersendiri untuk proses scan.

```powershell
$targetWindows = Read-Host 'Path Windows repository yang akan dipindai'
$targetLinux = wsl.exe -d $distro --cd $targetWindows -- pwd
if ($LASTEXITCODE -ne 0) { throw 'Folder target tidak dapat dibuka di WSL.' }
$targetLinux = $targetLinux.Trim()
$reportPath = ".sentinel-cache/report-offline-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"

wsl.exe -d $distro --cd $sentinelLinux -- unshare --net -- env $scanPath node sentinel.mjs scan $targetLinux --offline --output $reportPath
Write-Output "Exit code $LASTEXITCODE"
if (Test-Path -LiteralPath $reportPath) { Write-Output "Report $reportPath" }
```

Jika `unshare` menampilkan `Operation not permitted`, sesi Ubuntu Anda tidak punya izin membuat namespace jaringan. Untuk menjalankan mode cache lokal tanpa isolasi dari OS, hapus `unshare --net --` dari perintah dan tetap gunakan `--offline`. Gunakan sesi yang berizin jika isolasi jaringan dari OS menjadi syarat.

Periksa status masing-masing engine. Exit code `0` berarti pemeriksaan selesai tanpa temuan pada cakupannya. Exit code `1` berarti pemeriksaan selesai dengan temuan untuk ditinjau. Exit code `2` menandakan kegagalan perintah atau engine. JSON tersimpan di folder cache Sentinel.

## Hasil pengujian

Pada 7 November 2026, Semgrep mendeteksi pola `eval` pada fixture tiga file. Gitleaks mendeteksi dummy secret dengan nilai yang disensor, dan OSV menemukan advisory untuk lockfile sintetis dari snapshot lokal. Pada scan repository uji, ketiga engine melaporkan `SUCCESS` dengan jaringan proses diisolasi.
