export type RepositoryStatus = 'pending' | 'verified';

export type EngineStatus = 'completed' | 'failed' | 'skipped' | 'timed_out' | 'unknown';

export type ScanStatus = 'awaiting_report' | 'completed' | 'partial' | 'failed';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export type FindingTriage = 'open' | 'acknowledged' | 'investigating';

export interface RepositoryFixture {
  id: string;
  owner: string;
  name: string;
  visibility: 'private' | 'public';
  status: RepositoryStatus;
  primaryStack: string;
  defaultBranch: string;
  lastScanId?: string;
  lastCommit?: string;
  lastRunAt?: string;
}

export interface EngineRunFixture {
  id: string;
  label: string;
  status: EngineStatus;
  version: string;
  detail: string;
  findingCount: number;
}

export interface ScanFixture {
  id: string;
  repositoryId: string;
  status: ScanStatus;
  commit: string;
  branch: string;
  runNumber: string;
  attempt: number;
  startedAt: string;
  duration: string;
  engines: EngineRunFixture[];
}

export interface FindingFixture {
  id: string;
  repositoryId: string;
  scanId: string;
  severity: FindingSeverity;
  title: string;
  category: string;
  detector: string;
  ruleId: string;
  path: string;
  line: number;
  evidenceStatus: 'sanitized' | 'metadata_only';
  confidence: 'potential' | 'needs_review' | 'unknown';
  triage: FindingTriage;
  lastDetected: string;
  advisory?: string;
  excerpt: string[];
  history: Array<{
    date: string;
    state: string;
    actor: string;
    note: string;
  }>;
}

export type PreviewState =
  | 'default'
  | 'no-data'
  | 'pending'
  | 'loading'
  | 'complete-zero'
  | 'partial'
  | 'failed'
  | 'unauthorized'
  | 'error';
