# Scanner Python native

Pada 12 November 2026, pengguna meminta satu pintu masuk Python yang berjalan langsung dari PowerShell, lalu commit, push, dan pengujian terhadap kode lokal di folder proyek.

`scanner.py` memakai standard library Python 3.10+ untuk inventory, empat pemeriksaan pola PHP/JS/TS, normalisasi temuan, dan tabel laporan. Gitleaks 8.30.1 dan OSV 2.7.0 berjalan sebagai executable native dari cache terverifikasi. OSV memeriksa snapshot npm/Packagist offline. Jalur Python menggunakan `mode: local-native-offline`; Semgrep diberi status `not_requested` agar pola native tetap memiliki identitas engine sendiri.

`--prepare` menerima konfigurasi cache, tanpa target repository, untuk mengambil engine dan snapshot publik. Scan tidak mengunduh apa pun. Cache CLI Node yang sudah ada dapat dipakai kembali. `--skip-worktrees` melewati penanda linked worktree untuk seluruh inventory dan Gitleaks. CLI menolak penimpaan report, menghapus nilai secret dan source dari output, dan memakai exit code 2 saat engine gagal.

Uji awal Windows x64 memakai Python 3.13.3, delapan tes Python, dan 20 tes CLI Node. Scan native awal `ui-magic-box-06` menyelesaikan pola source, Gitleaks, serta OSV, dengan kedua worktree dilewati. Hasil awalnya 171 file source, 11 indikasi Gitleaks, dan 0 kecocokan advisory. Tes terkontrol memblokir jaringan Python selama scan. Status jaringan executable mengikuti konfigurasi offline masing-masing engine; uji tersebut bukan packet capture atau isolasi jaringan OS.

Persiapan nyata dari cache kosong berhasil memverifikasi dan menyimpan engine native serta kedua database. Cache baru kemudian dipakai untuk audit contoh dengan path berspasi dan worktree sintetis. Panduan menghubungkan KaTeX ke Mermaid serta minimatch ke TypeScript ESLint dan menandai kandidat fix di luar rentang induk. Nama dan versi paket target tetap dibaca lokal pada tahap scan.

CI menjalankan tes Python melalui `python3 -m unittest discover -s tests -p test_native_scanner.py -v`. Hasil Quality dan pengujian pasca-push dicatat pada laporan tugas serta report lokal tersanitasi. Binary Linux/macOS tersedia pada pemetaan cache, tetapi uji langsung jalur Python saat implementasi dilakukan di Windows x64.

Batas yang tetap berlaku meliputi pola source yang terbatas, false positive, snapshot advisory yang bertanggal, penelusuran workspace pnpm/Yarn yang membutuhkan verifikasi manual, dan riwayat Git yang belum diperiksa. Pemeliharaan versi engine harus memperbarui versi serta checksum bersamaan dan mengulang tes redaksi serta audit offline.
