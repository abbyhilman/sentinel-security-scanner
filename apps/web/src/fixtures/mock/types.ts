export type RepositoryStatus = 'pending' | 'verified' | 'disabled';

export type EngineStatus = 'completed' | 'failed' | 'skipped' | 'timed_out' | 'unknown';

export type ScanStatus =
  'awaiting_report' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'rejected';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';

export type FindingTriage =
  'open' | 'acknowledged' | 'investigating' | 'false_positive' | 'accepted_risk' | 'fixed';

export interface RepositoryFixture {
  id: string;
  owner: string;
  name: string;
  visibility: 'private' | 'public' | 'internal' | 'unknown';
  status: RepositoryStatus;
  primaryStack: string;
  defaultBranch: string;
  lastScanId?: string;
  lastCommit?: string;
  lastRunAt?: string;
  fullName?: string;
}

export interface EngineRunFixture {
  id: string;
  label: string;
  status: EngineStatus;
  version: string;
  detail: string;
  findingCount: number;
  elapsedMs?: number | null;
  errorRedacted?: string | null;
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
  repositoryFullName?: string;
  githubRunId?: string;
  workflowRef?: string | null;
  coverage?: Record<string, unknown>;
  completedAt?: string | null;
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
  repositoryFullName?: string;
  commitSha?: string;
  sourceUrl?: string | null;
  createdAt?: string;
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
