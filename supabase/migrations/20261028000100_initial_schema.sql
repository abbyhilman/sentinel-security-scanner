-- Sentinel Stage 03: canonical ERD/DBA v1.1 schema, tenant isolation, and grants.
-- All customer-workflow ingestion writes remain closed until the validated
-- sentinel-ingest RPC is implemented in Stage 06.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TYPE public.organization_role AS ENUM ('owner', 'maintainer', 'viewer');
CREATE TYPE public.repository_onboarding_state AS ENUM ('pending', 'verified', 'disabled');
CREATE TYPE public.repository_pairing_status AS ENUM ('pending', 'consumed', 'expired', 'revoked');
CREATE TYPE public.scan_status AS ENUM (
  'awaiting_report', 'running', 'completed', 'partial', 'failed', 'cancelled', 'rejected'
);
CREATE TYPE public.scanner_name AS ENUM ('semgrep', 'osv_scanner', 'gitleaks', 'composer_audit');
CREATE TYPE public.scanner_status AS ENUM ('success', 'skipped', 'failed', 'timed_out');
CREATE TYPE public.finding_category AS ENUM ('sast', 'secret', 'dependency', 'unknown');
CREATE TYPE public.finding_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info', 'unknown');
CREATE TYPE public.evidence_status AS ENUM (
  'detected', 'potentially_affected', 'unknown', 'not_tested', 'not_affected'
);
CREATE TYPE public.triage_disposition AS ENUM (
  'open', 'acknowledged', 'investigating', 'false_positive', 'accepted_risk', 'fixed'
);
CREATE TYPE public.advisory_alias_type AS ENUM ('cve', 'ghsa', 'osv', 'other');
CREATE TYPE public.license_gate_status AS ENUM ('approved', 'blocked', 'unknown');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_display_name_length CHECK (
    display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 120
  )
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug extensions.citext NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT organizations_slug_format CHECK (slug::text ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')
);

CREATE TABLE public.organization_members (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  role public.organization_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE public.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  github_repository_id bigint,
  full_name text NOT NULL,
  visibility text NOT NULL DEFAULT 'unknown',
  default_branch text,
  onboarding_state public.repository_onboarding_state NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repositories_github_id_positive CHECK (
    github_repository_id IS NULL OR github_repository_id > 0
  ),
  CONSTRAINT repositories_name_format CHECK (
    char_length(full_name) BETWEEN 3 AND 200
    AND full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
  ),
  CONSTRAINT repositories_visibility CHECK (visibility IN ('public', 'private', 'internal', 'unknown')),
  CONSTRAINT repositories_branch_length CHECK (
    default_branch IS NULL OR char_length(default_branch) BETWEEN 1 AND 255
  ),
  CONSTRAINT repositories_verified_requires_github_id CHECK (
    onboarding_state <> 'verified' OR github_repository_id IS NOT NULL
  ),
  CONSTRAINT repositories_pending_has_no_github_binding CHECK (
    onboarding_state <> 'pending' OR github_repository_id IS NULL
  )
);

CREATE UNIQUE INDEX repositories_verified_github_id_uq
  ON public.repositories (github_repository_id)
  WHERE github_repository_id IS NOT NULL;
CREATE UNIQUE INDEX repositories_org_full_name_uq
  ON public.repositories (org_id, lower(full_name));

CREATE TABLE public.repository_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories (id) ON DELETE RESTRICT,
  nonce_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  status public.repository_pairing_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repository_pairings_nonce_hash_sha256 CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT repository_pairings_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT repository_pairings_consumed_state CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL)
    OR (status <> 'consumed' AND consumed_at IS NULL)
  )
);
CREATE UNIQUE INDEX repository_pairings_one_pending_per_repo_uq
  ON public.repository_pairings (repo_id)
  WHERE status = 'pending' AND consumed_at IS NULL;
CREATE INDEX repository_pairings_repo_expiry_idx
  ON public.repository_pairings (repo_id, expires_at DESC);

CREATE TABLE public.repository_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.repositories (id) ON DELETE RESTRICT,
  allowed_workflow_ref text NOT NULL,
  allowed_ref_pattern text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repository_workflows_ref_nonempty CHECK (
    char_length(btrim(allowed_workflow_ref)) BETWEEN 1 AND 500
    AND allowed_workflow_ref !~ '[*?]'
  ),
  CONSTRAINT repository_workflows_ref_pattern_length CHECK (
    allowed_ref_pattern IS NULL OR char_length(allowed_ref_pattern) BETWEEN 1 AND 500
  )
);
CREATE UNIQUE INDEX repository_workflows_identity_uq
  ON public.repository_workflows (
    repository_id,
    allowed_workflow_ref,
    coalesce(allowed_ref_pattern, '')
  );

CREATE TABLE public.scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.repositories (id) ON DELETE RESTRICT,
  github_run_id bigint NOT NULL,
  run_attempt integer NOT NULL,
  commit_sha varchar(64) NOT NULL,
  ref text NOT NULL,
  event_name text NOT NULL,
  status public.scan_status NOT NULL DEFAULT 'awaiting_report',
  report_schema_version integer NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  payload_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scan_runs_github_run_positive CHECK (github_run_id > 0),
  CONSTRAINT scan_runs_attempt_positive CHECK (run_attempt > 0),
  CONSTRAINT scan_runs_commit_sha CHECK (commit_sha ~ '^[0-9A-Fa-f]{40}([0-9A-Fa-f]{24})?$'),
  CONSTRAINT scan_runs_ref_nonempty CHECK (char_length(ref) BETWEEN 1 AND 500),
  CONSTRAINT scan_runs_event_nonempty CHECK (char_length(event_name) BETWEEN 1 AND 100),
  CONSTRAINT scan_runs_schema_version_positive CHECK (report_schema_version > 0),
  CONSTRAINT scan_runs_payload_hash CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT scan_runs_timestamps_ordered CHECK (
    started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at
  ),
  CONSTRAINT scan_runs_status_timestamps CHECK (
    (status IN ('awaiting_report', 'running') AND completed_at IS NULL)
    OR (status IN ('completed', 'partial', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    OR status = 'rejected'
  ),
  CONSTRAINT scan_runs_running_has_start CHECK (status <> 'running' OR started_at IS NOT NULL),
  CONSTRAINT scan_runs_run_attempt_uq UNIQUE (repository_id, github_run_id, run_attempt)
);
CREATE INDEX scan_runs_repo_completed_idx
  ON public.scan_runs (repository_id, completed_at DESC NULLS LAST, id DESC);

CREATE TABLE public.scanner_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_runs (id) ON DELETE RESTRICT,
  scanner public.scanner_name NOT NULL,
  version text NOT NULL,
  status public.scanner_status NOT NULL,
  elapsed_ms integer,
  findings_count integer NOT NULL DEFAULT 0,
  skip_reason text,
  ruleset_version text,
  ruleset_digest char(64),
  ruleset_source text,
  license_gate public.license_gate_status NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scanner_executions_scan_scanner_uq UNIQUE (scan_id, scanner),
  CONSTRAINT scanner_executions_version_nonempty CHECK (char_length(btrim(version)) BETWEEN 1 AND 100),
  CONSTRAINT scanner_executions_elapsed_nonnegative CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
  CONSTRAINT scanner_executions_count_nonnegative CHECK (findings_count >= 0),
  CONSTRAINT scanner_executions_skipped_reason CHECK (
    status <> 'skipped' OR char_length(btrim(coalesce(skip_reason, ''))) > 0
  ),
  CONSTRAINT scanner_executions_ruleset_digest CHECK (
    ruleset_digest IS NULL OR ruleset_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT scanner_executions_ruleset_version_digest_pair CHECK (
    (ruleset_version IS NULL AND ruleset_digest IS NULL)
    OR (ruleset_version IS NOT NULL AND ruleset_digest IS NOT NULL)
  ),
  CONSTRAINT scanner_executions_ruleset_version_length CHECK (
    ruleset_version IS NULL OR char_length(btrim(ruleset_version)) BETWEEN 1 AND 200
  ),
  CONSTRAINT scanner_executions_ruleset_source_length CHECK (
    ruleset_source IS NULL OR char_length(btrim(ruleset_source)) BETWEEN 1 AND 500
  ),
  CONSTRAINT scanner_executions_approved_ruleset_has_provenance CHECK (
    license_gate <> 'approved'
    OR (ruleset_version IS NOT NULL AND ruleset_digest IS NOT NULL AND ruleset_source IS NOT NULL)
  )
);

CREATE TABLE public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  fingerprint char(64) NOT NULL,
  scanner public.scanner_name NOT NULL,
  rule_id text NOT NULL,
  category public.finding_category NOT NULL,
  severity public.finding_severity NOT NULL,
  evidence_status public.evidence_status NOT NULL,
  title text NOT NULL,
  message_redacted text NOT NULL,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT findings_execution_fk FOREIGN KEY (scan_id, scanner)
    REFERENCES public.scanner_executions (scan_id, scanner) ON DELETE RESTRICT,
  CONSTRAINT findings_scan_scanner_fingerprint_uq UNIQUE (scan_id, scanner, fingerprint),
  CONSTRAINT findings_fingerprint_sha256 CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT findings_rule_id_length CHECK (char_length(btrim(rule_id)) BETWEEN 1 AND 255),
  CONSTRAINT findings_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  CONSTRAINT findings_message_length CHECK (char_length(message_redacted) <= 4000),
  CONSTRAINT findings_source_url_https CHECK (
    source_url IS NULL OR (source_url ~ '^https://' AND char_length(source_url) <= 2048)
  )
);
CREATE INDEX findings_scan_severity_idx ON public.findings (scan_id, severity, id);
CREATE INDEX findings_fingerprint_idx ON public.findings (fingerprint, scan_id);

CREATE TABLE public.finding_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.findings (id) ON DELETE RESTRICT,
  file_path text NOT NULL,
  line_start integer,
  line_end integer,
  redacted_excerpt text,
  package_name text,
  version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finding_evidence_path_normalized CHECK (
    char_length(file_path) BETWEEN 1 AND 1024
    AND file_path !~ '^/'
    AND file_path !~ '^[A-Za-z]:'
    AND file_path !~ '(^|/)\.\.(/|$)'
    AND position(chr(92) IN file_path) = 0
  ),
  CONSTRAINT finding_evidence_lines_valid CHECK (
    (line_start IS NULL AND line_end IS NULL)
    OR (line_start >= 1 AND (line_end IS NULL OR line_end >= line_start))
  ),
  CONSTRAINT finding_evidence_excerpt_byte_limit CHECK (
    redacted_excerpt IS NULL OR octet_length(redacted_excerpt) <= 4096
  ),
  CONSTRAINT finding_evidence_package_length CHECK (
    package_name IS NULL OR char_length(package_name) BETWEEN 1 AND 500
  ),
  CONSTRAINT finding_evidence_version_length CHECK (version IS NULL OR char_length(version) <= 200)
);
CREATE INDEX finding_evidence_finding_idx ON public.finding_evidence (finding_id, id);

CREATE TABLE public.finding_triage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.repositories (id) ON DELETE RESTRICT,
  fingerprint char(64) NOT NULL,
  disposition public.triage_disposition NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finding_triage_fingerprint_sha256 CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT finding_triage_reason_length CHECK (reason IS NULL OR char_length(reason) <= 2000),
  CONSTRAINT finding_triage_reason_required CHECK (
    disposition NOT IN ('false_positive', 'accepted_risk')
    OR char_length(btrim(coalesce(reason, ''))) > 0
  )
);
CREATE INDEX finding_triage_repo_fingerprint_latest_idx
  ON public.finding_triage (repository_id, fingerprint, created_at DESC, id DESC);

CREATE TABLE public.ingestion_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL UNIQUE REFERENCES public.scan_runs (id) ON DELETE RESTRICT,
  idempotency_key char(64) NOT NULL UNIQUE,
  payload_hash char(64) NOT NULL,
  oidc_claim_digest char(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingestion_receipts_hashes_sha256 CHECK (
    idempotency_key ~ '^[0-9a-f]{64}$'
    AND payload_hash ~ '^[0-9a-f]{64}$'
    AND oidc_claim_digest ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE public.dependency_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_runs (id) ON DELETE RESTRICT,
  ecosystem text NOT NULL,
  package text NOT NULL,
  version text,
  lockfile_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dependency_inventory_ecosystem_length CHECK (char_length(btrim(ecosystem)) BETWEEN 1 AND 80),
  CONSTRAINT dependency_inventory_package_length CHECK (char_length(btrim(package)) BETWEEN 1 AND 500),
  CONSTRAINT dependency_inventory_version_length CHECK (version IS NULL OR char_length(version) <= 200),
  CONSTRAINT dependency_inventory_lockfile_path_length CHECK (
    char_length(lockfile_path) BETWEEN 1 AND 1024
    AND lockfile_path !~ '^/'
    AND lockfile_path !~ '^[A-Za-z]:'
    AND lockfile_path !~ '(^|/)\.\.(/|$)'
    AND position(chr(92) IN lockfile_path) = 0
  )
);
CREATE UNIQUE INDEX dependency_inventory_identity_uq
  ON public.dependency_inventory (
    scan_id, ecosystem, package, coalesce(version, ''), lockfile_path
  );

CREATE TABLE public.advisories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_advisory_id text NOT NULL,
  title text,
  severity public.finding_severity,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisories_source_nonempty CHECK (char_length(btrim(source)) BETWEEN 1 AND 80),
  CONSTRAINT advisories_source_id_nonempty CHECK (
    char_length(btrim(source_advisory_id)) BETWEEN 1 AND 255
  ),
  CONSTRAINT advisories_source_identity_uq UNIQUE (source, source_advisory_id)
);

CREATE TABLE public.advisory_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_id uuid NOT NULL REFERENCES public.advisories (id) ON DELETE RESTRICT,
  alias text NOT NULL,
  alias_type public.advisory_alias_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisory_aliases_alias_format CHECK (char_length(btrim(alias)) BETWEEN 1 AND 255),
  CONSTRAINT advisory_aliases_alias_type_uq UNIQUE (alias_type, alias)
);

CREATE TABLE public.finding_advisories (
  finding_id uuid NOT NULL REFERENCES public.findings (id) ON DELETE RESTRICT,
  advisory_id uuid NOT NULL REFERENCES public.advisories (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (finding_id, advisory_id)
);
CREATE INDEX finding_advisories_advisory_idx ON public.finding_advisories (advisory_id, finding_id);

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  type text NOT NULL,
  entity_id uuid,
  metadata_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_type_length CHECK (char_length(btrim(type)) BETWEEN 1 AND 120),
  CONSTRAINT audit_events_metadata_object CHECK (jsonb_typeof(metadata_redacted) = 'object')
);
CREATE INDEX audit_events_org_created_idx ON public.audit_events (org_id, created_at DESC, id DESC);

CREATE TABLE public.scan_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_runs (id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  media_type text NOT NULL,
  sha256 char(64) NOT NULL,
  redacted boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scan_artifacts_path_safe CHECK (
    char_length(storage_path) BETWEEN 1 AND 1024
    AND storage_path !~ '^/'
    AND storage_path !~ '(^|/)\.\.(/|$)'
    AND position(chr(92) IN storage_path) = 0
  ),
  CONSTRAINT scan_artifacts_media_type CHECK (char_length(btrim(media_type)) BETWEEN 1 AND 160),
  CONSTRAINT scan_artifacts_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX scan_artifacts_scan_expiry_idx ON public.scan_artifacts (scan_id, expires_at);

CREATE FUNCTION private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER auth_user_creates_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.create_profile_for_auth_user();

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER organizations_touch_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER repositories_touch_updated_at
  BEFORE UPDATE ON public.repositories
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER repository_workflows_touch_updated_at
  BEFORE UPDATE ON public.repository_workflows
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER scan_runs_touch_updated_at
  BEFORE UPDATE ON public.scan_runs
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER advisories_touch_updated_at
  BEFORE UPDATE ON public.advisories
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

CREATE FUNCTION private.reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Rows in %.% are append-only', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER scanner_executions_append_only
  BEFORE UPDATE OR DELETE ON public.scanner_executions
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER findings_append_only
  BEFORE UPDATE OR DELETE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER finding_evidence_append_only
  BEFORE UPDATE OR DELETE ON public.finding_evidence
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER finding_triage_append_only
  BEFORE UPDATE OR DELETE ON public.finding_triage
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER ingestion_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.ingestion_receipts
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER dependency_inventory_append_only
  BEFORE UPDATE OR DELETE ON public.dependency_inventory
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER finding_advisories_append_only
  BEFORE UPDATE OR DELETE ON public.finding_advisories
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_mutation();

CREATE FUNCTION private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS member_row
    WHERE member_row.org_id = p_org_id
      AND member_row.user_id = (SELECT auth.uid())
  );
$function$;

CREATE FUNCTION private.has_org_role(
  p_org_id uuid,
  p_roles public.organization_role[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS member_row
    WHERE member_row.org_id = p_org_id
      AND member_row.user_id = (SELECT auth.uid())
      AND (p_roles IS NULL OR member_row.role = ANY (p_roles))
  );
$function$;

CREATE FUNCTION private.has_repository_access(
  p_repository_id uuid,
  p_roles public.organization_role[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.repositories AS repository_row
    JOIN public.organization_members AS member_row
      ON member_row.org_id = repository_row.org_id
    WHERE repository_row.id = p_repository_id
      AND member_row.user_id = (SELECT auth.uid())
      AND (p_roles IS NULL OR member_row.role = ANY (p_roles))
  );
$function$;

CREATE FUNCTION private.has_scan_access(p_scan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.scan_runs AS scan_row
    JOIN public.repositories AS repository_row ON repository_row.id = scan_row.repository_id
    JOIN public.organization_members AS member_row ON member_row.org_id = repository_row.org_id
    WHERE scan_row.id = p_scan_id
      AND member_row.user_id = (SELECT auth.uid())
  );
$function$;

CREATE FUNCTION private.has_finding_access(p_finding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.findings AS finding_row
    JOIN public.scan_runs AS scan_row ON scan_row.id = finding_row.scan_id
    JOIN public.repositories AS repository_row ON repository_row.id = scan_row.repository_id
    JOIN public.organization_members AS member_row ON member_row.org_id = repository_row.org_id
    WHERE finding_row.id = p_finding_id
      AND member_row.user_id = (SELECT auth.uid())
  );
$function$;

CREATE FUNCTION private.has_repository_finding(
  p_repository_id uuid,
  p_fingerprint char(64)
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.findings AS finding_row
    JOIN public.scan_runs AS scan_row ON scan_row.id = finding_row.scan_id
    WHERE scan_row.repository_id = p_repository_id
      AND finding_row.fingerprint = p_fingerprint
  );
$function$;

REVOKE ALL ON FUNCTION private.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_profile_for_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reject_immutable_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_org_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, public.organization_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_repository_access(uuid, public.organization_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_scan_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_finding_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_repository_finding(uuid, char) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, public.organization_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_repository_access(uuid, public.organization_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_scan_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_finding_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_repository_finding(uuid, char) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dependency_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_advisories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_self ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY organizations_member_read ON public.organizations
  FOR SELECT TO authenticated USING (private.is_org_member(id));
CREATE POLICY organization_members_member_read ON public.organization_members
  FOR SELECT TO authenticated USING (private.is_org_member(org_id));
CREATE POLICY repositories_member_read ON public.repositories
  FOR SELECT TO authenticated USING (private.has_repository_access(id));
CREATE POLICY repository_workflows_member_read ON public.repository_workflows
  FOR SELECT TO authenticated USING (private.has_repository_access(repository_id));
CREATE POLICY scan_runs_member_read ON public.scan_runs
  FOR SELECT TO authenticated USING (private.has_repository_access(repository_id));
CREATE POLICY scanner_executions_member_read ON public.scanner_executions
  FOR SELECT TO authenticated USING (private.has_scan_access(scan_id));
CREATE POLICY findings_member_read ON public.findings
  FOR SELECT TO authenticated USING (private.has_scan_access(scan_id));
CREATE POLICY finding_evidence_member_read ON public.finding_evidence
  FOR SELECT TO authenticated USING (private.has_finding_access(finding_id));
CREATE POLICY finding_triage_member_read ON public.finding_triage
  FOR SELECT TO authenticated USING (private.has_repository_access(repository_id));
CREATE POLICY finding_triage_manager_append ON public.finding_triage
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_repository_access(
      repository_id,
      ARRAY['owner', 'maintainer']::public.organization_role[]
    )
    AND actor_user_id = (SELECT auth.uid())
    AND private.has_repository_finding(repository_id, fingerprint)
  );
CREATE POLICY dependency_inventory_member_read ON public.dependency_inventory
  FOR SELECT TO authenticated USING (private.has_scan_access(scan_id));
CREATE POLICY advisories_authenticated_read ON public.advisories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY advisory_aliases_authenticated_read ON public.advisory_aliases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY finding_advisories_member_read ON public.finding_advisories
  FOR SELECT TO authenticated USING (private.has_finding_access(finding_id));
CREATE POLICY audit_events_owner_read ON public.audit_events
  FOR SELECT TO authenticated
  USING (private.has_org_role(org_id, ARRAY['owner']::public.organization_role[]));
CREATE POLICY scan_artifacts_member_read ON public.scan_artifacts
  FOR SELECT TO authenticated USING (private.has_scan_access(scan_id));

CREATE VIEW public.latest_finding_triage
  WITH (security_invoker = true)
AS
SELECT DISTINCT ON (repository_id, fingerprint)
  id,
  repository_id,
  fingerprint,
  disposition,
  actor_user_id,
  reason,
  created_at
FROM public.finding_triage
ORDER BY repository_id, fingerprint, created_at DESC, id DESC;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TYPE
  public.organization_role,
  public.repository_onboarding_state,
  public.repository_pairing_status,
  public.scan_status,
  public.scanner_name,
  public.scanner_status,
  public.finding_category,
  public.finding_severity,
  public.evidence_status,
  public.triage_disposition,
  public.advisory_alias_type,
  public.license_gate_status
FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;
GRANT USAGE ON TYPE
  public.organization_role,
  public.repository_onboarding_state,
  public.repository_pairing_status,
  public.scan_status,
  public.scanner_name,
  public.scanner_status,
  public.finding_category,
  public.finding_severity,
  public.evidence_status,
  public.triage_disposition,
  public.advisory_alias_type,
  public.license_gate_status
TO authenticated, service_role;
GRANT SELECT ON TABLE
  public.profiles,
  public.organizations,
  public.organization_members,
  public.repositories,
  public.repository_workflows,
  public.scan_runs,
  public.scanner_executions,
  public.findings,
  public.finding_evidence,
  public.finding_triage,
  public.dependency_inventory,
  public.advisories,
  public.advisory_aliases,
  public.finding_advisories,
  public.audit_events,
  public.scan_artifacts
TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
GRANT INSERT ON public.finding_triage TO authenticated;
GRANT SELECT ON public.latest_finding_triage TO authenticated;

-- Only trusted Edge Functions use service_role for writes. Never place this key
-- in the web client or a customer-owned GitHub Actions workflow.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
