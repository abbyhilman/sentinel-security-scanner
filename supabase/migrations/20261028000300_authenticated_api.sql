-- Sentinel Stage 07: authenticated organization and repository onboarding API.
-- User-facing writes run as SECURITY DEFINER only after checking auth.uid() and
-- the caller's organization role. Pairing stores a hash, never the nonce.

CREATE FUNCTION public.create_organization(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid := pg_catalog.gen_random_uuid();
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_base_slug text;
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYLOAD';
  END IF;

  v_base_slug := pg_catalog.left(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(pg_catalog.lower(v_name), '[^a-z0-9]+', '-', 'g'),
      '-'
    ),
    140
  );
  IF v_base_slug = '' THEN
    v_base_slug := 'organization';
  END IF;
  v_slug := v_base_slug || '-' || pg_catalog.left(
    pg_catalog.replace(v_org_id::text, '-', ''),
    8
  );

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_id, v_name, v_slug);

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  INSERT INTO public.audit_events (org_id, actor_id, type, entity_id, metadata_redacted)
  VALUES (
    v_org_id,
    v_user_id,
    'organization.created',
    v_org_id,
    pg_catalog.jsonb_build_object('slug', v_slug)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_org_id,
    'name', v_name,
    'slug', v_slug
  );
END;
$function$;

CREATE FUNCTION public.register_repository(
  p_org_id uuid,
  p_full_name text,
  p_default_branch text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_default_branch text := pg_catalog.btrim(coalesce(p_default_branch, ''));
  v_repo_id uuid;
  v_recent_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF p_org_id IS NULL
    OR pg_catalog.char_length(v_full_name) NOT BETWEEN 3 AND 200
    OR v_full_name !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
    OR pg_catalog.char_length(v_default_branch) NOT BETWEEN 1 AND 255
    OR v_default_branch !~ '^[A-Za-z0-9_./-]+$'
    OR v_default_branch ~ '(^/|/$|//|(^|/)\.\.?(/|$)|\.lock$)'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYLOAD';
  END IF;
  IF NOT private.has_org_role(
    p_org_id,
    ARRAY['owner', 'maintainer']::public.organization_role[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FORBIDDEN';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('repository-registration:' || v_user_id::text, 0)
  );
  SELECT pg_catalog.count(*)::integer
  INTO v_recent_count
  FROM public.audit_events AS event_row
  WHERE event_row.actor_id = v_user_id
    AND event_row.type = 'repository.registered'
    AND event_row.created_at >= pg_catalog.clock_timestamp() - interval '24 hours';
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ONBOARDING_RATE_LIMITED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.lower(v_full_name), 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.repositories AS repository_row
    WHERE pg_catalog.lower(repository_row.full_name) = pg_catalog.lower(v_full_name)
      AND repository_row.github_repository_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'REPO_ALREADY_PAIRED';
  END IF;

  INSERT INTO public.repositories (org_id, full_name, default_branch, onboarding_state)
  VALUES (p_org_id, v_full_name, v_default_branch, 'pending')
  RETURNING id INTO v_repo_id;

  INSERT INTO public.audit_events (org_id, actor_id, type, entity_id, metadata_redacted)
  VALUES (
    p_org_id,
    v_user_id,
    'repository.registered',
    v_repo_id,
    pg_catalog.jsonb_build_object(
      'full_name', v_full_name,
      'default_branch', v_default_branch
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_repo_id,
    'organizationId', p_org_id,
    'fullName', v_full_name,
    'defaultBranch', v_default_branch,
    'status', 'pending_pairing',
    'pairingExpiresAt', NULL
  );
END;
$function$;

CREATE FUNCTION public.issue_repository_pairing(
  p_repository_id uuid,
  p_nonce_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF p_repository_id IS NULL OR p_nonce_hash IS NULL OR p_nonce_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYLOAD';
  END IF;

  SELECT repository_row.org_id
  INTO v_org_id
  FROM public.repositories AS repository_row
  WHERE repository_row.id = p_repository_id
    AND private.has_repository_access(
      repository_row.id,
      ARRAY['owner', 'maintainer']::public.organization_role[]
    )
    AND repository_row.onboarding_state = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.repositories AS repository_row
      WHERE repository_row.id = p_repository_id
        AND repository_row.onboarding_state = 'verified'
        AND private.has_repository_access(
          repository_row.id,
          ARRAY['owner', 'maintainer']::public.organization_role[]
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'REPO_ALREADY_PAIRED';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOT_FOUND';
  END IF;

  UPDATE public.repository_pairings
  SET status = 'expired'
  WHERE repo_id = p_repository_id
    AND status = 'pending'
    AND consumed_at IS NULL;

  v_expires_at := pg_catalog.clock_timestamp() + interval '15 minutes';
  INSERT INTO public.repository_pairings (repo_id, nonce_hash, expires_at)
  VALUES (p_repository_id, p_nonce_hash, v_expires_at);

  INSERT INTO public.audit_events (org_id, actor_id, type, entity_id, metadata_redacted)
  VALUES (
    v_org_id,
    v_user_id,
    'repository.pairing_issued',
    p_repository_id,
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'repositoryId', p_repository_id,
    'expiresAt', v_expires_at
  );
END;
$function$;

CREATE FUNCTION public.get_organization_overview(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_repositories integer;
  v_verified integer;
  v_pending integer;
  v_open_findings integer;
  v_recent_runs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF p_org_id IS NULL OR NOT private.is_org_member(p_org_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOT_FOUND';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE repository_row.onboarding_state = 'verified')::integer,
    pg_catalog.count(*) FILTER (WHERE repository_row.onboarding_state = 'pending')::integer
  INTO v_repositories, v_verified, v_pending
  FROM public.repositories AS repository_row
  WHERE repository_row.org_id = p_org_id;

  SELECT pg_catalog.count(*)::integer
  INTO v_open_findings
  FROM (
    SELECT DISTINCT repository_row.id, finding_row.fingerprint
    FROM public.repositories AS repository_row
    JOIN public.scan_runs AS scan_row ON scan_row.repository_id = repository_row.id
    JOIN public.findings AS finding_row ON finding_row.scan_id = scan_row.id
    LEFT JOIN public.latest_finding_triage AS triage_row
      ON triage_row.repository_id = repository_row.id
      AND triage_row.fingerprint = finding_row.fingerprint
    WHERE repository_row.org_id = p_org_id
      AND coalesce(triage_row.disposition::text, 'open') = 'open'
  ) AS open_issue;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', recent.id,
        'repositoryId', recent.repository_id,
        'repositoryFullName', recent.full_name,
        'githubRunId', recent.github_run_id,
        'runAttempt', recent.run_attempt,
        'commitSha', recent.commit_sha,
        'ref', recent.ref,
        'status', recent.status,
        'completedAt', recent.completed_at,
        'createdAt', recent.created_at
      ) ORDER BY recent.created_at DESC, recent.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_runs
  FROM (
    SELECT
      scan_row.id,
      scan_row.repository_id,
      repository_row.full_name,
      scan_row.github_run_id,
      scan_row.run_attempt,
      scan_row.commit_sha,
      scan_row.ref,
      scan_row.status,
      scan_row.completed_at,
      scan_row.created_at
    FROM public.scan_runs AS scan_row
    JOIN public.repositories AS repository_row ON repository_row.id = scan_row.repository_id
    WHERE repository_row.org_id = p_org_id
    ORDER BY scan_row.created_at DESC, scan_row.id DESC
    LIMIT 5
  ) AS recent;

  RETURN pg_catalog.jsonb_build_object(
    'repositoryCount', v_repositories,
    'verifiedRepositoryCount', v_verified,
    'pendingRepositoryCount', v_pending,
    'openFindingCount', v_open_findings,
    'recentRuns', v_recent_runs
  );
END;
$function$;

CREATE FUNCTION public.list_organization_findings(
  p_org_id uuid,
  p_run_id uuid DEFAULT NULL,
  p_repository_id uuid DEFAULT NULL,
  p_finding_id uuid DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_scanner text DEFAULT NULL,
  p_triage text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  scan_id uuid,
  repository_id uuid,
  repository_full_name text,
  github_run_id bigint,
  run_attempt integer,
  commit_sha text,
  ref text,
  fingerprint text,
  scanner text,
  rule_id text,
  category text,
  severity text,
  evidence_status text,
  title text,
  message_redacted text,
  source_url text,
  created_at timestamptz,
  triage text,
  evidence jsonb,
  advisories jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF p_org_id IS NULL OR NOT private.is_org_member(p_org_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOT_FOUND';
  END IF;
  -- 101 is reserved for the API's single-row pagination lookahead.
  IF p_limit NOT BETWEEN 1 AND 101
    OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL))
    OR (p_severity IS NOT NULL AND p_severity NOT IN (
      'critical', 'high', 'medium', 'low', 'info', 'unknown'
    ))
    OR (p_scanner IS NOT NULL AND p_scanner NOT IN ('semgrep', 'osv_scanner', 'gitleaks', 'composer_audit'))
    OR (p_triage IS NOT NULL AND p_triage NOT IN (
      'open', 'acknowledged', 'investigating', 'false_positive', 'accepted_risk', 'fixed'
    ))
    OR (p_query IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_query)) NOT BETWEEN 1 AND 100)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_FILTER';
  END IF;

  RETURN QUERY
  SELECT
    finding_row.id,
    finding_row.scan_id,
    repository_row.id,
    repository_row.full_name,
    scan_row.github_run_id,
    scan_row.run_attempt,
    scan_row.commit_sha::text,
    scan_row.ref,
    finding_row.fingerprint::text,
    finding_row.scanner::text,
    finding_row.rule_id,
    finding_row.category::text,
    finding_row.severity::text,
    finding_row.evidence_status::text,
    finding_row.title,
    finding_row.message_redacted,
    finding_row.source_url,
    finding_row.created_at,
    coalesce(triage_row.disposition::text, 'open'),
    coalesce(evidence_rows.items, '[]'::jsonb),
    coalesce(advisory_rows.items, '[]'::jsonb)
  FROM public.findings AS finding_row
  JOIN public.scan_runs AS scan_row ON scan_row.id = finding_row.scan_id
  JOIN public.repositories AS repository_row ON repository_row.id = scan_row.repository_id
  LEFT JOIN public.latest_finding_triage AS triage_row
    ON triage_row.repository_id = repository_row.id
    AND triage_row.fingerprint = finding_row.fingerprint
  LEFT JOIN LATERAL (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'filePath', evidence_row.file_path,
        'lineStart', evidence_row.line_start,
        'lineEnd', evidence_row.line_end,
        'redactedExcerpt', evidence_row.redacted_excerpt,
        'packageName', evidence_row.package_name,
        'version', evidence_row.version
      ) ORDER BY evidence_row.id
    ) AS items
    FROM public.finding_evidence AS evidence_row
    WHERE evidence_row.finding_id = finding_row.id
  ) AS evidence_rows ON true
  LEFT JOIN LATERAL (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'source', advisory_row.source,
        'sourceAdvisoryId', advisory_row.source_advisory_id,
        'title', advisory_row.title,
        'severity', advisory_row.severity::text,
        'aliases', coalesce(alias_rows.items, '[]'::jsonb)
      ) ORDER BY advisory_row.source, advisory_row.source_advisory_id
    ) AS items
    FROM public.finding_advisories AS finding_advisory_row
    JOIN public.advisories AS advisory_row ON advisory_row.id = finding_advisory_row.advisory_id
    LEFT JOIN LATERAL (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('alias', alias_row.alias, 'type', alias_row.alias_type::text)
        ORDER BY alias_row.alias_type, alias_row.alias
      ) AS items
      FROM public.advisory_aliases AS alias_row
      WHERE alias_row.advisory_id = advisory_row.id
    ) AS alias_rows ON true
    WHERE finding_advisory_row.finding_id = finding_row.id
  ) AS advisory_rows ON true
  WHERE repository_row.org_id = p_org_id
    AND (p_run_id IS NULL OR scan_row.id = p_run_id)
    AND (p_repository_id IS NULL OR repository_row.id = p_repository_id)
    AND (p_finding_id IS NULL OR finding_row.id = p_finding_id)
    AND (p_severity IS NULL OR finding_row.severity::text = p_severity)
    AND (p_scanner IS NULL OR finding_row.scanner::text = p_scanner)
    AND (p_triage IS NULL OR coalesce(triage_row.disposition::text, 'open') = p_triage)
    AND (
      p_query IS NULL
      OR pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(
          ' ', finding_row.title, finding_row.rule_id, finding_row.message_redacted,
          finding_row.source_url,
          (SELECT pg_catalog.string_agg(evidence_row.file_path, ' ')
           FROM public.finding_evidence AS evidence_row
           WHERE evidence_row.finding_id = finding_row.id)
        )),
        pg_catalog.lower(pg_catalog.btrim(p_query))
      ) > 0
    )
    AND (
      p_cursor_created_at IS NULL
      OR finding_row.created_at < p_cursor_created_at
      OR (finding_row.created_at = p_cursor_created_at AND finding_row.id < p_cursor_id)
    )
  ORDER BY finding_row.created_at DESC, finding_row.id DESC
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_organization(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_repository(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_repository_pairing(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_organization_overview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_organization_findings(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_repository(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_repository_pairing(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_organization_findings(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, timestamptz, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_organization(text) IS
  'Creates an organization and its first owner membership atomically for auth.uid().';
COMMENT ON FUNCTION public.register_repository(uuid, text, text) IS
  'Registers a pending repository after owner/maintainer membership and onboarding-limit checks.';
COMMENT ON FUNCTION public.issue_repository_pairing(uuid, text) IS
  'Rotates a pending pairing challenge; only the SHA-256 nonce hash is stored.';
COMMENT ON FUNCTION public.get_organization_overview(uuid) IS
  'Returns RLS-scoped organization counts and the five most recent scan reports.';
COMMENT ON FUNCTION public.list_organization_findings(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, timestamptz, uuid
) IS
  'Returns a membership-scoped, paginated findings inbox with sanitized evidence and advisories.';

NOTIFY pgrst, 'reload schema';
