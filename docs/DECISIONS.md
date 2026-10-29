# Sentinel Security Scanner Decision Log

**Tanggal awal:** 27 Oktober 2026  
**Tujuan:** mencatat baseline terkunci, pertentangan spesifikasi, dan keputusan yang masih perlu ditetapkan sebelum implementasi terkait.

## Cara membaca status

- **Baseline terkunci:** ditetapkan oleh AGENTS.md atau konsisten di spesifikasi yang lebih berwenang; tidak boleh diubah tanpa perubahan spesifikasi yang disengaja.
- **Rekomendasi untuk diselaraskan:** rekomendasi implementasi berdasarkan prioritas dokumen dan instruksi aktif; belum mengubah teks sumber.
- **Terbuka:** butuh keputusan stakeholder/engineering sebelum kontrak atau implementasi terkait dibekukan.
- **Disepakati:** keputusan stakeholder yang sudah diterapkan pada baseline implementasi.

## D-001 — Lokasi dokumen spesifikasi

**Status:** Terbuka  
**Temuan:** AGENTS.md menyebut delapan DOCX di docs/specs/ dan mirror teks di docs/specs/markdown/. Checkout saat ini menyimpan delapan DOCX langsung di root; kedua direktori yang dirujuk tidak ada.  
**Dampak:** onboarding agent berikutnya atau script yang mengikuti path dokumen dapat gagal menemukan sumber.  
**Rekomendasi:** tetapkan satu lokasi kanonis lalu selaraskan instruksi dan berkas. Jangan memindahkan atau menggandakan DOCX secara diam-diam; pertahankan dokumen asli dan diagram.

## D-002 — OIDC dan bukti kontrol repository

**Status:** Baseline terkunci oleh AGENTS.md; teks PRD perlu diselaraskan  
**Temuan:** PRD menaruh GitHub App/workload identity “where practical” di P1 dan mencatat OIDC versus scoped repository secret sebagai open decision. FSD, TDD, ERD, dan AGENTS.md mensyaratkan OIDC GitHub serta pairing nonce untuk proof-of-control.  
**Keputusan implementasi yang mengikuti instruksi aktif:** OIDC + nonce adalah P0. Nama owner/repo tidak cukup; scoped long-lived secret bukan fallback otomatis.  
**Alasan:** invariant keamanan proyek mengharuskan identity claims terikat ke nonce berumur pendek dan workflow/repository yang tepat.  
**Risiko tersisa:** bentuk klaim dan audience nyata harus diuji terhadap GitHub; identitas job tidak membuktikan kebenaran findings.

## D-003 — Trigger workflow dan fork pull request

**Status:** Disepakati untuk baseline Tahap 05 pada 28 Oktober 2026

**Temuan:** BRD/PRD membuka kemungkinan trigger PR dengan kebijakan aman; TDD meminta menghindari kredensial pada fork dan menjalankan hanya trusted events atau melewati report. Playbook Tahap 05 menetapkan workflow_dispatch dan push ke default branch serta melarang pull_request_target P0.

**Keputusan:** workflow menggunakan workflow_dispatch dan push ke default branch saja; tidak ada pull_request atau pull_request_target. Reporter OIDC hanya berjalan sebagai job terpisah setelah scan berhasil. Perluasan trigger memerlukan tinjauan ulang kebijakan fork dan kredensial.
**Alasan:** menjaga baseline P0 pada trusted events dan menghindari kredensial report pada kode pull request yang belum ditinjau.

## D-004 — Status run

**Status:** Disepakati 28 Oktober 2026  
**Temuan:** diagram FSD menunjukkan registered → pending run → running, sedangkan teks FSD mensyaratkan start/heartbeat terautentikasi untuk status itu. TDD menyebut awaiting_report jika status workflow tidak tersedia; ERD menyimpan awaiting_report, running, completed, partial, failed, cancelled, rejected. Dokumen juga memakai complete/completed.  
**Keputusan:** gunakan ERD sebagai vocabulary kanonis: `awaiting_report`, `running`, `completed`, `partial`, `failed`, `cancelled`, `rejected`. `skipped` hanya status scanner/engine. `running` memerlukan bukti autentik; tidak ada report berarti `awaiting_report`.  
**Alasan:** ini menjaga status dashboard tetap terikat pada bukti yang diterima dan membedakan kegagalan cakupan dari scan selesai.  
**Risiko tersisa:** definisi bukti pembatalan dan kapan status `running` dapat ditulis akan ditegakkan oleh API/ingestion tahap berikutnya.

## D-005 — Nama dan semantik entity database

**Status:** Disepakati 28 Oktober 2026  
**Temuan:** Prompt Tahap 03 menyebut scan_engine_runs, finding_occurrences, advisory_refs, triage_history, ingestion_events dan scanner_rule_catalog. ERD/DBA v1.1 memakai scanner_executions, findings dengan scan_id, finding_evidence, finding_triage berbasis repository/fingerprint, ingestion_receipts, dependency_inventory, advisories, advisory_aliases dan finding_advisories; ERD juga menambah repository_workflows, audit_events dan scan_artifacts.  
**Keputusan:** ERD/DBA v1.1 adalah model relasional kanonis. Pemetaan prompt implementasi: `scan_engine_runs` → `scanner_executions`; `finding_occurrences` → snapshot `findings` per scan dengan fingerprint stabil lintas scan; `advisory_refs` → `advisories`, `advisory_aliases`, dan `finding_advisories`; `triage_history` → append-only `finding_triage`; `ingestion_events` → `ingestion_receipts` untuk idempotensi dan `audit_events` untuk audit. `scanner_rule_catalog` tidak dibuat sebagai tabel. Tidak ada tabel duplikat. Nilai enum pairing `pending/consumed/expired/revoked` dan category `sast/secret/dependency/unknown` mengisi kolom ERD yang tidak merinci nilai enum; konfirmasi ulang jika kontrak API menetapkan vocabulary yang berbeda.  
**Alasan:** ERD berada di atas TDD dalam urutan spesifikasi dan mempertahankan pemisahan snapshot temuan, referensi advisory, dan keputusan triage.  
**Risiko tersisa:** tidak ada ingestion atomic sampai RPC server-side Tahap 06 dibuat dan diuji.

## D-006 — Katalog rules dan provenance lisensi

**Status:** Disepakati 28 Oktober 2026  
**Temuan:** PRD dan Prompt Tahap 03 menyebut scanner_rule_catalog; daftar entity ERD tidak mendefinisikan tabel tersebut. Semua spesifikasi mewajibkan asal, versi dan review lisensi rules Semgrep.  
**Keputusan:** katalog adalah manifest berversi di source control, bukan tabel database. Setiap eksekusi scanner akan membawa versi/digest manifest, sumber ruleset, dan status gerbang lisensi; migrasi menambahkan kolom provenance tersebut pada `scanner_executions`. Rule yang belum disetujui tidak boleh digunakan untuk rilis.  
**Alasan:** manifest dapat direview bersama perubahan kode dan tidak menggandakan katalog runtime yang belum diperlukan.  
**Risiko tersisa:** manifest dan pemeriksaan lisensinya dibuat pada Tahap 04/05; kolom provenance masih dapat bernilai `unknown` pada data lokal sampai integrasi tersedia.

## D-007 — Prioritas ekspor JSON dan SARIF

**Status:** Terbuka  
**Temuan:** PRD menaruh JSON/SARIF export di P1. FSD menyebut JSON/SARIF-compatible sanitized export dalam screen requirements; TDD menamai sanitized JSON export sebagai phase 1.  
**Rekomendasi:** tetapkan minimal JSON tersanitasi sebagai P0 hanya jika dibutuhkan oleh workflow atau acceptance gate; tunda SARIF ke P1 hingga kebutuhan dan redaction contract disetujui. Selaraskan prioritas di PRD/FSD/TDD sebelum UI/API export dibangun.  
**Risiko jika dibiarkan:** scope P0 dan bentuk data publik berubah setelah API/frontend dibuat.

## D-008 — Arti larangan Next.js

**Status:** Terbuka untuk klarifikasi teks  
**Temuan:** AGENTS.md dan playbook melarang Next.js sebagai stack aplikasi Sentinel, sementara FSD menyebut Next.js sebagai framework hint pada repository Node.js yang dapat dipindai.  
**Rekomendasi:** tulis larangan sebagai larangan memakai Next.js untuk membangun aplikasi Sentinel; konfirmasi secara eksplisit apakah repository target berbasis Next.js tetap termasuk target pemindaian Node.js/TypeScript.  
**Risiko jika dibiarkan:** larangan stack produk dapat terbaca sebagai larangan framework target.

## D-009 — Provenance bukan validasi kebenaran

**Status:** Baseline terkunci  
**Keputusan:** semua report dianggap input tidak tepercaya meskipun JWT OIDC valid. Validasi report dilakukan terhadap identity, schema, pairing, allowlist, batas ukuran, sanitizer dan idempotency; UI menyebut sumber sebagai laporan dari workflow CI.  
**Alasan:** workflow owner dapat dimodifikasi dan findings bisa dipalsukan oleh pemilik repository.  
**Risiko tersisa:** Sentinel tidak melakukan independent verification atau exploit testing pada MVP.

## D-010 — REA dan validasi UX

**Status:** Baseline bukti  
**Temuan:** UX Research v1.2 mengandalkan dokumentasi publik; D2 observed interaction, D3 REA dan D4 user testing belum dilakukan. REA UX Investigation v1.2 adalah playbook, bukan hasil analisis live.  
**Keputusan:** jangan menyebut UI “REA-verified” atau “validated research” tanpa evidence log dan uji pengguna yang benar-benar dilakukan.  
**Risiko tersisa:** task success, aksesibilitas manual dan hasil riset pengguna masih belum terukur.

## D-011 — Aturan operasi yang masih berupa usulan

**Status:** Terbuka sebelum beta/rilis  
**Temuan:** batas 2 MB/1000 findings, retention 90 hari, owner-only versus team scope, private repo onboarding, hosting/free-tier limits dan backup disebut sebagai usulan atau pertanyaan desain.  
**Rekomendasi:** tandai nilai provisional dalam konfigurasi dan dokumentasi; dapatkan persetujuan sebelum menganggapnya SLA atau kebijakan produk.  
**Risiko jika dibiarkan:** pembatasan payload, retensi, biaya, dan hak akses tidak memenuhi kebutuhan pengguna atau ketentuan penyedia.

## D-012 — Gate kepatuhan scanner dan hosting

**Status:** Baseline terkunci untuk MVP; bukti release belum ada  
**Keputusan:** engine Semgrep dan ruleset ditinjau terpisah; Gitleaks CLI, OSV-Scanner, Composer Audit, GitHub Actions terms, Supabase limits dan hosting ditinjau ulang sebelum rilis. Tidak ada central runner atau VPS yang dikecualikan.  
**Risiko tersisa:** terms, licensing, quota, action refs, scanner versions dan flags dapat berubah; belum diverifikasi untuk rilis.

## D-013 — Provenance workflow pada setiap run

**Status:** Disepakati untuk Tahap 06 pada 28 Oktober 2026
**Temuan:** ERD menyimpan `repository_workflows` sebagai allowlist, tetapi `scan_runs` tidak memiliki kolom/relasi yang menyatakan workflow mana yang menghasilkan setiap run. TDD meminta `workflow_ref` diverifikasi terhadap allowlist dan report/run context.  
**Keputusan:** tambahkan `scan_runs.workflow_ref` dan wajibkan kecocokan exact dengan claim OIDC serta `repository_workflows.allowed_workflow_ref`. Pairing awal menerima hanya `.github/workflows/sentinel-scan.yml` pada default branch yang dikonfigurasi. Simpan claim identity digest saja dalam receipt; JWT mentah tidak pernah dikirim ke SQL.
**Alasan:** setiap run harus mempertahankan provenance yang sudah diverifikasi tanpa membuka jalur untuk workflow lain dalam repo.
**Risiko tersisa:** pairing API Tahap 07 belum dibuat. Perubahan nama file workflow atau default branch memerlukan pembaruan allowlist yang terautentikasi.

## D-014 — Pemetaan kontrak scanner dan agregasi advisory

**Status:** Disepakati 28 Oktober 2026 untuk batas kontrak Tahap 04  
**Temuan:** TDD memakai nama scanner report `osv` dan `composer`, kategori `sca`, serta evidence status `detected`, `potentially_affected`, dan `unknown`. Enum database ERD memakai `osv_scanner`, `composer_audit`, kategori `dependency`, dan menyediakan dua status tambahan untuk lifecycle evidence. ERD juga mengikat setiap finding ke satu scanner execution, sementara output normalisasi perlu menggabungkan advisory yang sama dari OSV-Scanner dan Composer Audit.
**Keputusan:** report version 1 mempertahankan vocabulary TDD (`osv`, `composer`, `sca`); ingestion Tahap 06 memetakan masing-masing ke enum database (`osv_scanner`, `composer_audit`, `dependency`). Adapter hanya mengeluarkan tiga evidence status yang didukung TDD. Finding agregat membawa `scannerSources`; ingestion memecahnya menjadi satu row per scanner agar foreign key dan provenance per-engine ERD tetap terpenuhi. `findingsCount` per execution tetap menghitung output masing-masing scanner sebelum agregasi.
**Aturan deduplikasi:** gabungkan hanya SCA dengan ecosystem/package yang sama, advisory ID yang beririsan, versi yang kompatibel, path yang kompatibel, dan tepat satu kandidat. OSV menjadi finding utama jika tersedia. Konflik severity menjadi `unknown`; bukti yang tidak pasti tidak dinaikkan menjadi konfirmasi. Jika satu advisory cocok ke beberapa path monorepo, pertahankan finding terpisah.
**Normalisasi severity:** Semgrep `ERROR/WARNING/INFO` dipetakan deterministik ke `high/medium/info`; OSV dan Composer mempertahankan severity hanya jika sumber memberi label kanonis; label yang tidak dikenal dan seluruh severity Gitleaks menjadi `unknown`. Pemetaan ini bukan skor CVSS atau klaim eksploitasi.
**Alasan:** report API mengikuti TDD tanpa mengganti skema remote yang sudah diterapkan, sambil mempertahankan asal tiap engine saat ingestion.
**Risiko tersisa:** fan-out dan mapper diimplementasikan di RPC Tahap 06; integration test SQL dan contoh temuan advisory masih harus dijalankan pada database sesudah migrasi.

## D-015 — lisensi dan distribusi rules Semgrep

**Status:** Disepakati 28 Oktober 2026

**Temuan:** Lisensi engine Semgrep CE dan lisensi rules Semgrep Community/Registry adalah dua hal terpisah. Ketentuan rules Semgrep membatasi penggunaan rules Registry pada produk SaaS. Memasukkan rules tersebut ke Sentinel berisiko membuat aturan tersedia melalui layanan pemindai.
**Keputusan:** Template hanya memakai aturan buatan Sentinel sendiri, berlisensi MIT, tanpa rule pack Registry. Manifest mencatat versi dan SHA-256. Runtime membandingkan digest file dengan digest yang disetujui di bundle; mismatch memblokir Semgrep dan menandai engine gagal sampai perubahan ditinjau.
**Alasan:** distribusi rules dapat ditinjau, dilisensikan, dan dilacak terpisah dari engine.
**Risiko tersisa:** rules awal masih mencakup pola terbatas dan tidak membuktikan semua celah terdeteksi. Penambahan atau perubahan rule memerlukan review lisensi, perilaku, versi, dan digest sebelum dipakai. Ketentuan resmi: [Semgrep Rules License](https://semgrep.dev/legal/rules-license/).

## D-016 — cara distribusi workflow scanner

**Status:** Disepakati untuk Tahap 05 pada 28 Oktober 2026

**Temuan:** Workflow dan konfigurasi scanner harus dimiliki maintainer repository yang dipindai. Pilihan reusable workflow akan menambah dependensi runtime pada repository Sentinel dan mengurangi keterlihatan file yang menentukan pemindaian.

**Keputusan:** distribusikan salinan YAML beserta runner, konfigurasi, manifest, lisensi rules, dan third-party notices. Pembaruan template dipasang dan direview secara eksplisit oleh maintainer repository target; tidak ada auto-push.
**Alasan:** pemilik target dapat meninjau versi tools, rules, izin, dan perubahan workflow pada commit mereka sendiri.
**Risiko tersisa:** salinan di repository target dapat tertinggal dari template. Maintainer harus menghapus secret nonce setelah pairing pertama.

## D-017 — Audience token GitHub OIDC untuk fungsi ingestion

**Status:** Keputusan implementasi Tahap 06; konflik teks TDD dicatat
**Temuan:** contoh audience pada TDD menyebut `sentinel-ingest`, sedangkan workflow Tahap 05 meminta audience berbentuk URL fungsi project Supabase.
**Keputusan:** gunakan audience exact `https://<project-ref>.supabase.co/functions/v1/sentinel-ingest`, sama dengan nilai yang diminta template workflow. Verifier menolak audience lain dan menerima hanya string audience tunggal yang persis cocok.
**Alasan:** token dibatasi untuk project dan fungsi tujuan, serta tetap cocok dengan workflow yang telah disiapkan.
**Risiko tersisa:** contoh TDD sumber belum diperbarui; klaim audience live dari GitHub-hosted runner belum diuji.

## D-018 — Batas request ingestion awal

**Status:** Nilai implementasi sementara Tahap 06
**Keputusan:** batas body 4 MiB, maksimal 1.000 findings dari kontrak report, dan maksimal 30 report baru per repository per menit. Exact replay tidak memakai kuota baru. Batas per menit ditegakkan dalam transaksi PostgreSQL setelah row repository dikunci.
**Alasan:** batas mencegah payload/ingestion berlebihan tanpa membatasi idempotent retry.
**Risiko tersisa:** nilai ini provisional dan perlu dikalibrasi terhadap ukuran report, kuota Supabase, dan pemakaian nyata sebelum beta; jangan dianggap sebagai SLA.

## D-019 — input branch dan batas onboarding Tahap 07

**Status:** Keputusan implementasi sementara, 28 Oktober 2026

**Temuan:** Kontrak pendaftaran repository pada TDD hanya meminta `organizationId` dan `fullName`, tetapi RPC ingestion Tahap 06 mensyaratkan `default_branch` sebelum pairing pertama. Mengambil metadata repository dari GitHub akan menambah probe eksternal yang tidak diperlukan dan tidak bekerja untuk repo privat tanpa integrasi OAuth tambahan.

**Keputusan:** API meminta maintainer menyertakan `defaultBranch` sebagai nilai setup yang dideklarasikan pengguna; UI tidak menyebutnya telah diverifikasi oleh GitHub. Pairing menghasilkan nonce acak 256-bit, menyimpan hanya SHA-256, berlaku 15 menit, dan mengganti challenge pending sebelumnya. Batasi pendaftaran menjadi 10 repository per pengguna dalam 24 jam.

Pendaftaran pending dengan nama yang sama di organisasi berbeda tidak saling memblokir; nama baru dianggap sudah terikat hanya setelah ada GitHub repository ID hasil pairing. Duplikasi pending dalam satu organisasi tetap ditolak oleh constraint database.

**Risiko tersisa:** Branch yang dideklarasikan belum dibandingkan dengan konfigurasi default branch GitHub yang sebenarnya. OIDC pairing hanya membuktikan workflow berjalan dari branch/ref yang cocok dengan input ini. Batas onboarding 10/24 jam provisional.

## D-020 — read model ringkasan dan inbox organisasi

**Status:** Keputusan implementasi Tahap 07, 28 Oktober 2026

**Temuan:** PRD/FSD mensyaratkan ringkasan dan inbox temuan lintas repository, sedangkan katalog TDD hanya merinci history per repository dan findings per run.

**Keputusan:** Tambahkan read endpoint organisasi untuk overview dan findings lintas repo agar dashboard P0 tidak menggabungkan halaman terpisah atau menampilkan angka perkiraan. Semua endpoint tetap dibatasi membership, memakai RLS/user JWT, dan paginasi maksimum 100. Export JSON tetap ditunda karena prioritas P0/P1 masih terbuka pada D-007.

## Keputusan yang masih terbuka

1. Kebijakan private repository dan perpindahan kepemilikan.
2. Penambahan rules Semgrep setelah D-015, versi tool/action untuk rilis, kalibrasi payload/rate limits, excerpt limit final, dan retention/backup.
3. Prioritas JSON/SARIF export.

Tidak ada konflik yang diselesaikan diam-diam. Pembaruan ke spesifikasi sumber harus mengikuti keputusan pemilik produk/engineering dan review keamanan.
