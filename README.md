# Sentinel Security Scanner

Sentinel sekarang memiliki perintah pemindaian lokal yang dapat dijalankan dari terminal. Setelah clone, tidak perlu memasang workflow di repository target atau menyiapkan Supabase untuk pemeriksaan cepat ini. Prasyaratnya Node.js 22.12 atau lebih baru.

## Mulai

```powershell
git clone https://github.com/abbyhilman/sentinel-security-scanner.git
cd sentinel-security-scanner
node sentinel.mjs scan D:\path\ke\repository
```

Jalankan `node sentinel.mjs scan .` untuk memeriksa folder saat ini. Untuk menyimpan report JSON tersanitasi:

```powershell
node sentinel.mjs scan D:\path\ke\repository --output D:\path\ke\report.json
```

Perintah dapat dipanggil dari folder lain memakai path lengkap ke `sentinel.mjs`. Tidak perlu `pnpm install`, Docker, login GitHub, atau API key untuk mode ini. Jalankan `node sentinel.mjs --help` untuk bantuan. Exit code `0` berarti tidak ada pola yang cocok, `1` berarti ada temuan yang perlu ditinjau, dan `2` berarti scan gagal.

## Cakupan saat ini

Mode `local-quick` memeriksa pola eksekusi dinamis dan query SQL mentah pada PHP, serta evaluasi kode dan eksekusi shell pada JavaScript/TypeScript. Report hanya menyimpan rule ID, path relatif, nomor baris, dan pesan; tidak menyimpan isi baris sumber atau nilai secret. Folder dependency/build dan symlink dilewati. Scan berhenti jika batas file atau temuan terlampaui.

Pemeriksaan ini berbasis pola teks. Semgrep, OSV-Scanner, Gitleaks, dan Composer Audit **belum dijalankan** oleh CLI lokal, sehingga report bertanda `coverage: limited`. Tidak ada temuan tidak berarti repository aman. Rencana untuk memperluas CLI ada di [rencana CLI lokal](docs/LOCAL_CLI_TASK_PLAN.md).

Untuk menjalankan pengujian CLI tanpa instalasi package, gunakan `node --test tests/local-cli.test.mjs`. Hasil pengujian terakhir dan batasnya ada di [ringkasan pengujian](docs/LOCAL_CLI_TEST_SUMMARY.md).

## Source lama

`apps/web`, `supabase`, dan `templates/github-workflows` masih ada sebagai implementasi tahap sebelumnya. Jalur tersebut tidak diperlukan untuk perintah lokal di atas. Keputusan perubahan arah dan batas keamanannya tercatat di [decision log](docs/DECISIONS.md).
