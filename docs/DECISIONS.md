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

**Status:** Rekomendasi untuk diselaraskan sebelum Tahap 05  
**Temuan:** BRD/PRD membuka kemungkinan trigger PR dengan kebijakan aman; TDD meminta menghindari kredensial pada fork dan menjalankan hanya trusted events atau melewati report. Playbook Tahap 05 menetapkan workflow_dispatch dan push ke default branch serta melarang pull_request_target P0.  
**Rekomendasi:** gunakan workflow_dispatch + push ke default branch untuk baseline P0. Jangan kirim report dengan permission OIDC dari pull request fork sampai threat model dan trigger policy ditetapkan.  
**Risiko jika dibiarkan:** secret/identity dapat terekspos ke kode yang tidak dipercaya, atau scan dan report bisa terikat ke event/repository yang salah.

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

**Status:** Terbuka sebelum Tahap 06  
**Temuan:** ERD menyimpan `repository_workflows` sebagai allowlist, tetapi `scan_runs` tidak memiliki kolom/relasi yang menyatakan workflow mana yang menghasilkan setiap run. TDD meminta `workflow_ref` diverifikasi terhadap allowlist dan report/run context.  
**Rekomendasi:** sebelum ingestion dibuat, verifikasi bentuk klaim GitHub yang tersedia dan putuskan apakah `scan_runs` perlu menyimpan workflow identity yang sudah divalidasi. Jika disimpan, gunakan claim terpilih yang telah disanitasi; jangan pernah menyimpan JWT mentah.  
**Risiko jika dibiarkan:** dashboard dan audit sulit menunjukkan workflow spesifik yang mengirim laporan ketika satu repository memiliki lebih dari satu workflow yang diizinkan.

## D-014 — Pemetaan kontrak scanner dan agregasi advisory

**Status:** Disepakati 28 Oktober 2026 untuk batas kontrak Tahap 04  
**Temuan:** TDD memakai nama scanner report `osv` dan `composer`, kategori `sca`, serta evidence status `detected`, `potentially_affected`, dan `unknown`. Enum database ERD memakai `osv_scanner`, `composer_audit`, kategori `dependency`, dan menyediakan dua status tambahan untuk lifecycle evidence. ERD juga mengikat setiap finding ke satu scanner execution, sementara output normalisasi perlu menggabungkan advisory yang sama dari OSV-Scanner dan Composer Audit.
**Keputusan:** report version 1 mempertahankan vocabulary TDD (`osv`, `composer`, `sca`); ingestion Tahap 06 memetakan masing-masing ke enum database (`osv_scanner`, `composer_audit`, `dependency`). Adapter hanya mengeluarkan tiga evidence status yang didukung TDD. Finding agregat membawa `scannerSources`; ingestion memecahnya menjadi satu row per scanner agar foreign key dan provenance per-engine ERD tetap terpenuhi. `findingsCount` per execution tetap menghitung output masing-masing scanner sebelum agregasi.
**Aturan deduplikasi:** gabungkan hanya SCA dengan ecosystem/package yang sama, advisory ID yang beririsan, versi yang kompatibel, path yang kompatibel, dan tepat satu kandidat. OSV menjadi finding utama jika tersedia. Konflik severity menjadi `unknown`; bukti yang tidak pasti tidak dinaikkan menjadi konfirmasi. Jika satu advisory cocok ke beberapa path monorepo, pertahankan finding terpisah.
**Normalisasi severity:** Semgrep `ERROR/WARNING/INFO` dipetakan deterministik ke `high/medium/info`; OSV dan Composer mempertahankan severity hanya jika sumber memberi label kanonis; label yang tidak dikenal dan seluruh severity Gitleaks menjadi `unknown`. Pemetaan ini bukan skor CVSS atau klaim eksploitasi.
**Alasan:** report API mengikuti TDD tanpa mengganti skema remote yang sudah diterapkan, sambil mempertahankan asal tiap engine saat ingestion.
**Risiko tersisa:** mapper dan fan-out belum diimplementasikan sampai Tahap 06; kontrak harus menjadi input wajib untuk tes ingestion dan rekonsiliasi hitungan.

## Keputusan yang masih terbuka

1. Bentuk persis klaim OIDC yang tersedia pada workflow pelapor, workflow/ref allowlist, dan D-013.
2. Distribusi workflow: copied YAML atau reusable workflow yang commit-pinned.
3. Kebijakan private repository dan perpindahan kepemilikan.
4. Ruleset yang disetujui, versi tool/action, payload/rate limits, excerpt limit final, dan retention/backup.
5. Prioritas JSON/SARIF export.

Tidak ada konflik yang diselesaikan diam-diam. Pembaruan ke spesifikasi sumber harus mengikuti keputusan pemilik produk/engineering dan review keamanan.
