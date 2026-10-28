import type {
  EngineRunFixture,
  FindingFixture,
  PreviewState,
  RepositoryFixture,
  ScanFixture,
} from './types';

export const mockNotice =
  'Data contoh untuk pratinjau. Tidak diambil dari GitHub, scanner, atau Supabase.';

export const previewStateOptions: Array<{ value: PreviewState; label: string }> = [
  { value: 'default', label: 'Ringkasan demo' },
  { value: 'no-data', label: 'Belum ada data' },
  { value: 'pending', label: 'Menunggu verifikasi' },
  { value: 'loading', label: 'Memuat' },
  { value: 'complete-zero', label: 'Selesai · nol temuan' },
  { value: 'partial', label: 'Sebagian pemeriksaan gagal' },
  { value: 'failed', label: 'Scan gagal' },
  { value: 'unauthorized', label: 'Tidak memiliki akses' },
  { value: 'error', label: 'Terjadi gangguan' },
];

export const mockRepositories: RepositoryFixture[] = [
  {
    id: 'repo-api-service',
    owner: 'demo-labs',
    name: 'api-service',
    visibility: 'private',
    status: 'verified',
    primaryStack: 'PHP · Composer',
    defaultBranch: 'main',
    lastScanId: 'scan-partial',
    lastCommit: 'b31a8f1',
    lastRunAt: '28 Okt 2026, 09.14 WIB',
  },
  {
    id: 'repo-customer-portal',
    owner: 'demo-labs',
    name: 'customer-portal',
    visibility: 'private',
    status: 'verified',
    primaryStack: 'Node.js · TypeScript',
    defaultBranch: 'main',
    lastScanId: 'scan-zero',
    lastCommit: 'e82d0c4',
    lastRunAt: '27 Okt 2026, 16.42 WIB',
  },
  {
    id: 'repo-legacy-php',
    owner: 'contoh-org',
    name: 'legacy-php',
    visibility: 'private',
    status: 'pending',
    primaryStack: 'PHP',
    defaultBranch: 'main',
  },
];

const defaultEngines: EngineRunFixture[] = [
  {
    id: 'semgrep',
    label: 'Semgrep Community Edition',
    status: 'completed',
    version: 'Versi contoh',
    detail: 'Aturan contoh selesai dijalankan.',
    findingCount: 1,
  },
  {
    id: 'osv',
    label: 'OSV-Scanner',
    status: 'completed',
    version: 'Versi contoh',
    detail: 'Pemeriksaan dependensi contoh selesai.',
    findingCount: 1,
  },
  {
    id: 'gitleaks',
    label: 'Gitleaks CLI',
    status: 'failed',
    version: 'Versi contoh',
    detail: 'Contoh kegagalan: proses tidak menghasilkan laporan.',
    findingCount: 0,
  },
  {
    id: 'composer-audit',
    label: 'Composer Audit',
    status: 'skipped',
    version: 'Tidak berlaku',
    detail: 'Contoh: composer.lock tidak ditemukan.',
    findingCount: 0,
  },
];

export const mockScans: ScanFixture[] = [
  {
    id: 'scan-partial',
    repositoryId: 'repo-api-service',
    status: 'partial',
    commit: 'b31a8f1',
    branch: 'main',
    runNumber: 'DEMO-1042',
    attempt: 1,
    startedAt: '28 Okt 2026, 09.14 WIB',
    duration: '2 mnt 18 dtk',
    engines: defaultEngines,
  },
  {
    id: 'scan-zero',
    repositoryId: 'repo-customer-portal',
    status: 'completed',
    commit: 'e82d0c4',
    branch: 'main',
    runNumber: 'DEMO-1037',
    attempt: 1,
    startedAt: '27 Okt 2026, 16.42 WIB',
    duration: '1 mnt 51 dtk',
    engines: defaultEngines.map((engine) => ({
      ...engine,
      status: engine.id === 'composer-audit' ? 'skipped' : 'completed',
      detail:
        engine.id === 'composer-audit'
          ? 'Contoh: proyek ini tidak memakai Composer.'
          : 'Pemeriksaan contoh selesai.',
      findingCount: 0,
    })),
  },
  {
    id: 'scan-findings',
    repositoryId: 'repo-customer-portal',
    status: 'completed',
    commit: '419f2aa',
    branch: 'main',
    runNumber: 'DEMO-1029',
    attempt: 1,
    startedAt: '25 Okt 2026, 14.32 WIB',
    duration: '2 mnt 04 dtk',
    engines: defaultEngines.map((engine) => ({
      ...engine,
      status: engine.id === 'composer-audit' ? 'skipped' : 'completed',
      detail:
        engine.id === 'composer-audit'
          ? 'Contoh: proyek ini tidak memakai Composer.'
          : 'Pemeriksaan contoh selesai.',
      findingCount: engine.id === 'semgrep' || engine.id === 'gitleaks' ? 1 : 0,
    })),
  },
  {
    id: 'scan-failed',
    repositoryId: 'repo-api-service',
    status: 'failed',
    commit: '4f5a2d9',
    branch: 'main',
    runNumber: 'DEMO-1032',
    attempt: 2,
    startedAt: '26 Okt 2026, 11.06 WIB',
    duration: '48 dtk',
    engines: defaultEngines.map((engine) => ({
      ...engine,
      status: engine.id === 'composer-audit' ? 'skipped' : 'failed',
      detail:
        engine.id === 'composer-audit'
          ? 'Contoh: lockfile tidak tersedia.'
          : 'Contoh kegagalan tool; tidak ada kesimpulan keamanan.',
      findingCount: 0,
    })),
  },
];

export const mockFindings: FindingFixture[] = [
  {
    id: 'finding-query-construction',
    repositoryId: 'repo-api-service',
    scanId: 'scan-partial',
    severity: 'high',
    title: 'Input pengguna digunakan saat menyusun kueri',
    category: 'Injeksi kueri',
    detector: 'Semgrep Community Edition',
    ruleId: 'php.lang.security.query-construction',
    path: 'src/Repository/UserRepository.php',
    line: 84,
    evidenceStatus: 'sanitized',
    confidence: 'potential',
    triage: 'open',
    lastDetected: '28 Okt 2026',
    advisory: undefined,
    excerpt: ['$query = buildQuery($filter);', '$result = $database->execute($query);'],
    history: [
      {
        date: '28 Okt 2026, 09.16 WIB',
        state: 'Terdeteksi',
        actor: 'Scan DEMO-1042',
        note: 'Indikasi dari aturan statis; perlu ditinjau oleh developer.',
      },
    ],
  },
  {
    id: 'finding-package-advisory',
    repositoryId: 'repo-api-service',
    scanId: 'scan-partial',
    severity: 'medium',
    title: 'Paket memiliki advisory yang perlu ditinjau',
    category: 'Dependensi rentan',
    detector: 'OSV-Scanner',
    ruleId: 'GHSA-DEMO-0000',
    path: 'composer.lock',
    line: 0,
    evidenceStatus: 'metadata_only',
    confidence: 'needs_review',
    triage: 'investigating',
    lastDetected: '28 Okt 2026',
    advisory: 'Advisory contoh · tautan belum tersedia',
    excerpt: ['Paket: vendor/library (contoh)', 'Versi: tidak diverifikasi'],
    history: [
      {
        date: '28 Okt 2026, 09.16 WIB',
        state: 'Terdeteksi',
        actor: 'Scan DEMO-1042',
        note: 'Metadata advisory merupakan data contoh.',
      },
      {
        date: '28 Okt 2026, 10.02 WIB',
        state: 'Sedang ditinjau',
        actor: 'Anggota demo',
        note: 'Catatan triage contoh; tidak tersimpan ke server.',
      },
    ],
  },
  {
    id: 'finding-secret-indicator',
    repositoryId: 'repo-customer-portal',
    scanId: 'scan-findings',
    severity: 'critical',
    title: 'Indikasi credential terdeteksi pada file konfigurasi',
    category: 'Indikasi secret',
    detector: 'Gitleaks CLI',
    ruleId: 'generic-api-key',
    path: 'src/config/service.ts',
    line: 22,
    evidenceStatus: 'sanitized',
    confidence: 'needs_review',
    triage: 'acknowledged',
    lastDetected: '25 Okt 2026',
    advisory: undefined,
    excerpt: [
      'const serviceCredential = [NILAI DIHAPUS]',
      '// Nilai sensitif disensor pada pratinjau ini.',
    ],
    history: [
      {
        date: '25 Okt 2026, 14.32 WIB',
        state: 'Terdeteksi',
        actor: 'Scan DEMO-1019',
        note: 'Nilai yang cocok sudah dihapus dari bukti.',
      },
      {
        date: '25 Okt 2026, 15.10 WIB',
        state: 'Diakui',
        actor: 'Anggota demo',
        note: 'Contoh histori untuk menunjukkan audit trail.',
      },
    ],
  },
  {
    id: 'finding-weak-randomness',
    repositoryId: 'repo-customer-portal',
    scanId: 'scan-findings',
    severity: 'low',
    title: 'Sumber nilai acak mungkin tidak sesuai konteks keamanan',
    category: 'Kualitas keamanan',
    detector: 'Semgrep Community Edition',
    ruleId: 'javascript.lang.security.weak-randomness',
    path: 'src/utils/token.ts',
    line: 31,
    evidenceStatus: 'sanitized',
    confidence: 'unknown',
    triage: 'open',
    lastDetected: '24 Okt 2026',
    excerpt: ['const token = Math.random().toString(36);'],
    history: [
      {
        date: '24 Okt 2026, 08.25 WIB',
        state: 'Terdeteksi',
        actor: 'Scan DEMO-0991',
        note: 'Perlu ditinjau sesuai penggunaan token.',
      },
    ],
  },
];

export const getRepository = (id: string) =>
  mockRepositories.find((repository) => repository.id === id);

export const getScan = (id: string) => mockScans.find((scan) => scan.id === id);

export const getFinding = (id: string) => mockFindings.find((finding) => finding.id === id);

export const getFindingsForRepository = (repositoryId: string) =>
  mockFindings.filter((finding) => finding.repositoryId === repositoryId);

export const getScanRepository = (scan: ScanFixture) => getRepository(scan.repositoryId);
