-- Sentinel Stage 06: bind GitHub OIDC provenance to atomic scan ingestion.
-- The function accepts only claims already verified by sentinel-ingest; it
-- never receives or stores the bearer token or a plaintext pairing nonce.

ALTER TABLE public.scan_runs
  ADD COLUMN workflow_ref text,
  ADD COLUMN coverage_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT scan_runs_workflow_ref_length CHECK (
    workflow_ref IS NULL OR char_length(workflow_ref) BETWEEN 1 AND 512
  ),
  ADD CONSTRAINT scan_runs_coverage_object CHECK (jsonb_typeof(coverage_redacted) = 'object');

ALTER TABLE public.scanner_executions
  ADD COLUMN error_redacted text,
  ADD CONSTRAINT scanner_executions_error_length CHECK (
    error_redacted IS NULL OR char_length(error_redacted) BETWEEN 1 AND 4000
  );

ALTER TABLE public.repository_workflows
  DROP CONSTRAINT repository_workflows_ref_nonempty,
  ADD CONSTRAINT repository_workflows_ref_nonempty CHECK (
    char_length(btrim(allowed_workflow_ref)) BETWEEN 1 AND 512
    AND allowed_workflow_ref !~ '[*?]'
  );

CREATE UNIQUE INDEX repository_pairings_nonce_hash_uq
  ON public.repository_pairings (nonce_hash);

-- A service key is held only by the Edge Function. Ingestion tables are
-- writable through this function, not through arbitrary PostgREST table DML.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.scan_runs,
  public.scanner_executions,
  public.findings,
  public.finding_evidence,
  public.ingestion_receipts,
  public.dependency_inventory,
  public.advisories,
  public.advisory_aliases,
  public.finding_advisories,
  public.audit_events
FROM service_role;

CREATE FUNCTION public.ingest_scan_report(
  p_report jsonb,
  p_pairing_nonce_hash text,
  p_idempotency_key text,
  p_payload_hash text,
  p_oidc_claim_digest text,
  p_oidc_claims jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_repository_id bigint;
  v_run_id bigint;
  v_run_attempt integer;
  v_repo_id uuid;
  v_org_id uuid;
  v_pairing_id uuid;
  v_scan_id uuid;
  v_existing_scan_id uuid;
  v_existing_key text;
  v_existing_payload_hash text;
  v_db_scanner public.scanner_name;
  v_execution jsonb;
  v_finding jsonb;
  v_source jsonb;
  v_advisory jsonb;
  v_finding_id uuid;
  v_advisory_id uuid;
  v_alias text;
  v_alias_type public.advisory_alias_type;
  v_advisory_source text;
  v_category public.finding_category;
  v_recent_count integer;
  v_status public.scan_status;
  v_scanner_status public.scanner_status;
  v_license_gate public.license_gate_status;
  v_event_name text;
  v_workflow_ref text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_claim_repository text;
  v_claim_sha text;
  v_claim_ref text;
  v_claim_workflow_ref text;
  v_claim_event text;
  v_report_repository text;
  v_report_workflow_ref text;
  v_report_sha text;
  v_report_ref text;
  v_first_binding boolean := false;
BEGIN
  IF p_report IS NULL OR jsonb_typeof(p_report) <> 'object'
    OR p_oidc_claims IS NULL OR jsonb_typeof(p_oidc_claims) <> 'object'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[0-9a-f]{64}$'
    OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
    OR p_oidc_claim_digest IS NULL OR p_oidc_claim_digest !~ '^[0-9a-f]{64}$'
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_report');
  END IF;

  v_claim_repository := p_oidc_claims ->> 'repository';
  v_claim_sha := p_oidc_claims ->> 'sha';
  v_claim_ref := p_oidc_claims ->> 'ref';
  v_claim_workflow_ref := p_oidc_claims ->> 'workflow_ref';
  v_claim_event := p_oidc_claims ->> 'event_name';
  v_report_repository := p_report #>> '{repository,fullName}';
  v_report_workflow_ref := p_report #>> '{github,workflowRef}';
  v_report_sha := p_report #>> '{github,sha}';
  v_report_ref := p_report #>> '{github,ref}';

  IF p_oidc_claims ->> 'issuer' IS DISTINCT FROM 'https://token.actions.githubusercontent.com'
    OR coalesce(p_oidc_claims ->> 'repository_id', '') !~ '^\d{1,20}$'
    OR coalesce(p_oidc_claims ->> 'run_id', '') !~ '^\d{1,20}$'
    OR coalesce(p_oidc_claims ->> 'run_attempt', '') !~ '^\d{1,3}$'
    OR v_claim_repository IS NULL
    OR v_claim_repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
    OR v_claim_sha IS NULL OR v_claim_sha !~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'
    OR v_claim_ref IS NULL OR v_claim_ref !~ '^refs/heads/[A-Za-z0-9_./-]{1,480}$'
    OR v_claim_workflow_ref IS NULL OR char_length(v_claim_workflow_ref) > 512
    OR v_claim_event IS NULL
    OR v_claim_event NOT IN ('push', 'workflow_dispatch')
    OR (p_oidc_claims ->> 'run_attempt')::integer < 1
    OR (p_oidc_claims ->> 'run_attempt')::integer > 100
    OR (p_oidc_claims ->> 'repository_id')::numeric < 1
    OR (p_oidc_claims ->> 'repository_id')::numeric > 9223372036854775807
    OR (p_oidc_claims ->> 'run_id')::numeric < 1
    OR (p_oidc_claims ->> 'run_id')::numeric > 9223372036854775807
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'repository_mismatch');
  END IF;

  IF p_report ->> 'schemaVersion' IS DISTINCT FROM '1'
    OR coalesce(p_report #>> '{repository,id}', '') !~ '^\d{1,20}$'
    OR coalesce(p_report #>> '{github,runId}', '') !~ '^\d{1,20}$'
    OR coalesce(p_report #>> '{github,runAttempt}', '') !~ '^\d{1,3}$'
    OR p_report #>> '{repository,id}' IS DISTINCT FROM p_oidc_claims ->> 'repository_id'
    OR lower(p_report #>> '{repository,fullName}') IS DISTINCT FROM lower(v_claim_repository)
    OR p_report #>> '{github,runId}' IS DISTINCT FROM p_oidc_claims ->> 'run_id'
    OR p_report #>> '{github,runAttempt}' IS DISTINCT FROM p_oidc_claims ->> 'run_attempt'
    OR lower(v_report_sha) IS DISTINCT FROM lower(v_claim_sha)
    OR v_report_ref IS DISTINCT FROM v_claim_ref
    OR v_report_workflow_ref IS DISTINCT FROM v_claim_workflow_ref
    OR p_report #>> '{summary,status}' IS NULL
    OR p_report #>> '{summary,status}' NOT IN ('completed', 'partial', 'failed')
    OR jsonb_typeof(p_report -> 'scannerExecutions') <> 'array'
    OR jsonb_typeof(p_report -> 'findings') <> 'array'
    OR jsonb_typeof(p_report -> 'coverage') <> 'object'
    OR jsonb_array_length(p_report -> 'scannerExecutions') NOT BETWEEN 1 AND 4
    OR jsonb_array_length(p_report -> 'findings') > 1000
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_report -> 'findings') AS finding_row(value)
      WHERE finding_row.value ->> 'filePath' IS NULL
    )
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_report');
  END IF;

  IF p_pairing_nonce_hash IS NOT NULL AND p_pairing_nonce_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pairing_invalid');
  END IF;

  v_repository_id := (p_oidc_claims ->> 'repository_id')::bigint;
  v_run_id := (p_oidc_claims ->> 'run_id')::bigint;
  v_run_attempt := (p_oidc_claims ->> 'run_attempt')::integer;
  v_event_name := v_claim_event;
  v_workflow_ref := v_claim_workflow_ref;
  v_started_at := (p_report #>> '{summary,startedAt}')::timestamptz;
  v_completed_at := (p_report #>> '{summary,completedAt}')::timestamptz;
  v_status := CASE p_report #>> '{summary,status}'
    WHEN 'completed' THEN 'completed'::public.scan_status
    WHEN 'partial' THEN 'partial'::public.scan_status
    ELSE 'failed'::public.scan_status
  END;

  -- The repository row is locked before both idempotency and rate-limit checks.
  -- An already verified repository does not need to present a consumed nonce.
  SELECT repository_row.id, repository_row.org_id
  INTO v_repo_id, v_org_id
  FROM public.repositories AS repository_row
  WHERE repository_row.github_repository_id = v_repository_id
    AND lower(repository_row.full_name) = lower(v_claim_repository)
    AND repository_row.onboarding_state = 'verified'
  FOR UPDATE OF repository_row;

  IF NOT FOUND THEN
    IF p_pairing_nonce_hash IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'pairing_required');
    END IF;

    SELECT repository_row.id, repository_row.org_id, pairing_row.id
    INTO v_repo_id, v_org_id, v_pairing_id
    FROM public.repository_pairings AS pairing_row
    JOIN public.repositories AS repository_row ON repository_row.id = pairing_row.repo_id
    WHERE pairing_row.nonce_hash = p_pairing_nonce_hash
      AND pairing_row.status = 'pending'
      AND pairing_row.consumed_at IS NULL
      AND pairing_row.expires_at > pg_catalog.clock_timestamp()
      AND repository_row.onboarding_state = 'pending'
      AND lower(repository_row.full_name) = lower(v_claim_repository)
    FOR UPDATE OF pairing_row, repository_row;

    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1 FROM public.repository_pairings AS pairing_row
        WHERE pairing_row.nonce_hash = p_pairing_nonce_hash
      ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'pairing_invalid');
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'repository_mismatch');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.repositories AS repository_row
      WHERE repository_row.github_repository_id = v_repository_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'repository_mismatch');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.repositories AS repository_row
      WHERE repository_row.id = v_repo_id
        AND repository_row.default_branch IS NOT NULL
        AND v_claim_ref = 'refs/heads/' || repository_row.default_branch
        AND lower(v_claim_workflow_ref) = lower(
          v_claim_repository || '/.github/workflows/sentinel-scan.yml@' || v_claim_ref
        )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'workflow_not_allowed');
    END IF;
    v_first_binding := true;
  END IF;

  -- Exact body retries return the original identifier before nonce checks.
  SELECT scan_row.id, receipt_row.payload_hash, receipt_row.idempotency_key
  INTO v_existing_scan_id, v_existing_payload_hash, v_existing_key
  FROM public.ingestion_receipts AS receipt_row
  JOIN public.scan_runs AS scan_row ON scan_row.id = receipt_row.scan_id
  WHERE receipt_row.idempotency_key = p_idempotency_key
  FOR UPDATE OF scan_row;
  IF FOUND THEN
    IF v_existing_key = p_idempotency_key
      AND v_existing_payload_hash = p_payload_hash
      AND EXISTS (
        SELECT 1 FROM public.scan_runs AS scan_row
        WHERE scan_row.id = v_existing_scan_id
          AND scan_row.repository_id = v_repo_id
          AND scan_row.github_run_id = v_run_id
          AND scan_row.run_attempt = v_run_attempt
          AND scan_row.workflow_ref = v_workflow_ref
      )
    THEN
      RETURN jsonb_build_object('ok', true, 'scan_id', v_existing_scan_id, 'replayed', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
  END IF;

  SELECT scan_row.id, scan_row.payload_hash
  INTO v_existing_scan_id, v_existing_payload_hash
  FROM public.scan_runs AS scan_row
  WHERE scan_row.repository_id = v_repo_id
    AND scan_row.github_run_id = v_run_id
    AND scan_row.run_attempt = v_run_attempt
  FOR UPDATE OF scan_row;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
  END IF;

  IF NOT v_first_binding THEN
    IF EXISTS (
      SELECT 1 FROM public.repositories AS repository_row
      WHERE repository_row.id = v_repo_id
        AND repository_row.onboarding_state <> 'verified'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'workflow_not_allowed');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.repository_workflows AS workflow_row
      WHERE workflow_row.repository_id = v_repo_id
        AND workflow_row.allowed_workflow_ref = v_workflow_ref
        AND workflow_row.enabled
        AND (
          workflow_row.allowed_ref_pattern IS NULL
          OR workflow_row.allowed_ref_pattern = v_claim_ref
        )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'workflow_not_allowed');
    END IF;
  END IF;

  SELECT count(*)::integer
  INTO v_recent_count
  FROM public.scan_runs AS scan_row
  WHERE scan_row.repository_id = v_repo_id
    AND scan_row.created_at >= pg_catalog.clock_timestamp() - interval '1 minute';
  IF v_recent_count >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;

  IF v_first_binding THEN
    UPDATE public.repositories
    SET github_repository_id = v_repository_id,
        onboarding_state = 'verified'
    WHERE id = v_repo_id;
    UPDATE public.repository_pairings
    SET status = 'consumed', consumed_at = pg_catalog.clock_timestamp()
    WHERE id = v_pairing_id;
    INSERT INTO public.repository_workflows (
      repository_id, allowed_workflow_ref, allowed_ref_pattern, enabled
    ) VALUES (v_repo_id, v_workflow_ref, v_claim_ref, true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.scan_runs (
    repository_id,
    github_run_id,
    run_attempt,
    commit_sha,
    ref,
    event_name,
    status,
    report_schema_version,
    started_at,
    completed_at,
    payload_hash,
    workflow_ref,
    coverage_redacted
  ) VALUES (
    v_repo_id,
    v_run_id,
    v_run_attempt,
    lower(v_claim_sha),
    v_claim_ref,
    v_event_name,
    v_status,
    1,
    v_started_at,
    v_completed_at,
    p_payload_hash,
    v_workflow_ref,
    p_report -> 'coverage'
  ) RETURNING id INTO v_scan_id;

  FOR v_execution IN
    SELECT execution_row.value
    FROM pg_catalog.jsonb_array_elements(p_report -> 'scannerExecutions') AS execution_row(value)
  LOOP
    v_db_scanner := CASE v_execution ->> 'scanner'
      WHEN 'semgrep' THEN 'semgrep'::public.scanner_name
      WHEN 'osv' THEN 'osv_scanner'::public.scanner_name
      WHEN 'gitleaks' THEN 'gitleaks'::public.scanner_name
      WHEN 'composer' THEN 'composer_audit'::public.scanner_name
      ELSE NULL
    END;
    IF v_db_scanner IS NULL THEN
      RAISE EXCEPTION 'Invalid scanner execution in report' USING ERRCODE = '22023';
    END IF;
    v_scanner_status := (v_execution ->> 'status')::public.scanner_status;
    v_license_gate := coalesce(v_execution ->> 'licenseGate', 'unknown')::public.license_gate_status;
    INSERT INTO public.scanner_executions (
      scan_id, scanner, version, status, elapsed_ms, findings_count,
      skip_reason, error_redacted, ruleset_version, ruleset_digest,
      ruleset_source, license_gate
    ) VALUES (
      v_scan_id,
      v_db_scanner,
      v_execution ->> 'toolVersion',
      v_scanner_status,
      (v_execution ->> 'durationMs')::integer,
      (v_execution ->> 'findingsCount')::integer,
      v_execution ->> 'skipReason',
      v_execution ->> 'sanitizedError',
      v_execution ->> 'rulesetVersion',
      v_execution ->> 'rulesetDigest',
      v_execution ->> 'rulesetSource',
      v_license_gate
    );
  END LOOP;

  FOR v_finding IN
    SELECT finding_row.value
    FROM pg_catalog.jsonb_array_elements(p_report -> 'findings') AS finding_row(value)
  LOOP
    v_category := CASE v_finding ->> 'category'
      WHEN 'sast' THEN 'sast'::public.finding_category
      WHEN 'sca' THEN 'dependency'::public.finding_category
      WHEN 'secret' THEN 'secret'::public.finding_category
      ELSE 'unknown'::public.finding_category
    END;

    FOR v_source IN
      SELECT source_row.value
      FROM pg_catalog.jsonb_array_elements(v_finding -> 'scannerSources') AS source_row(value)
    LOOP
      v_db_scanner := CASE v_source #>> '{}'
        WHEN 'semgrep' THEN 'semgrep'::public.scanner_name
        WHEN 'osv' THEN 'osv_scanner'::public.scanner_name
        WHEN 'gitleaks' THEN 'gitleaks'::public.scanner_name
        WHEN 'composer' THEN 'composer_audit'::public.scanner_name
        ELSE NULL
      END;
      IF v_db_scanner IS NULL THEN
        RAISE EXCEPTION 'Invalid scanner source in report' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.findings (
        scan_id, fingerprint, scanner, rule_id, category, severity,
        evidence_status, title, message_redacted, source_url
      ) VALUES (
        v_scan_id,
        v_finding ->> 'fingerprint',
        v_db_scanner,
        v_finding ->> 'ruleId',
        v_category,
        (v_finding ->> 'severity')::public.finding_severity,
        (v_finding ->> 'evidenceStatus')::public.evidence_status,
        v_finding ->> 'title',
        v_finding ->> 'messageRedacted',
        v_finding #>> '{references,0}'
      ) ON CONFLICT (scan_id, scanner, fingerprint) DO NOTHING
      RETURNING id INTO v_finding_id;

      IF v_finding_id IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.finding_evidence (
        finding_id, file_path, line_start, line_end,
        redacted_excerpt, package_name, version
      ) VALUES (
        v_finding_id,
        v_finding ->> 'filePath',
        nullif(v_finding ->> 'lineStart', '')::integer,
        null,
        null,
        v_finding #>> '{package,name}',
        v_finding #>> '{package,version}'
      );

      FOR v_advisory IN
        SELECT advisory_row.value
        FROM pg_catalog.jsonb_array_elements(coalesce(v_finding -> 'advisoryIds', '[]'::jsonb))
          AS advisory_row(value)
      LOOP
        v_alias := v_advisory #>> '{}';
        IF v_alias ~* '^CVE-' THEN
          v_alias_type := 'cve'::public.advisory_alias_type;
          v_advisory_source := 'cve';
          v_alias := upper(v_alias);
        ELSIF v_alias ~* '^GHSA-' THEN
          v_alias_type := 'ghsa'::public.advisory_alias_type;
          v_advisory_source := 'github';
          v_alias := upper(v_alias);
        ELSIF v_alias ~* '^OSV-' THEN
          v_alias_type := 'osv'::public.advisory_alias_type;
          v_advisory_source := 'osv';
          v_alias := upper(v_alias);
        ELSE
          v_alias_type := 'other'::public.advisory_alias_type;
          v_advisory_source := CASE v_db_scanner
            WHEN 'composer_audit' THEN 'composer'
            ELSE 'osv'
          END;
        END IF;

        INSERT INTO public.advisories AS advisory_row (source, source_advisory_id, title, severity)
        VALUES (
          v_advisory_source,
          v_alias,
          v_finding ->> 'title',
          (v_finding ->> 'severity')::public.finding_severity
        )
        ON CONFLICT (source, source_advisory_id) DO UPDATE
        SET title = coalesce(advisory_row.title, EXCLUDED.title),
            severity = coalesce(advisory_row.severity, EXCLUDED.severity)
        RETURNING id INTO v_advisory_id;

        INSERT INTO public.advisory_aliases (advisory_id, alias, alias_type)
        VALUES (v_advisory_id, v_alias, v_alias_type)
        ON CONFLICT (alias_type, alias) DO NOTHING;

        SELECT alias_row.advisory_id INTO v_advisory_id
        FROM public.advisory_aliases AS alias_row
        WHERE alias_row.alias_type = v_alias_type AND alias_row.alias = v_alias;
        INSERT INTO public.finding_advisories (finding_id, advisory_id)
        VALUES (v_finding_id, v_advisory_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.ingestion_receipts (
    scan_id, idempotency_key, payload_hash, oidc_claim_digest
  ) VALUES (v_scan_id, p_idempotency_key, p_payload_hash, p_oidc_claim_digest);

  INSERT INTO public.audit_events (
    org_id, actor_id, type, entity_id, metadata_redacted
  ) VALUES (
    v_org_id,
    NULL,
    'scan.report_ingested',
    v_scan_id,
    jsonb_build_object(
      'repository_id', v_repository_id,
      'github_run_id', v_run_id,
      'run_attempt', v_run_attempt,
      'event_name', v_event_name,
      'workflow_ref', v_workflow_ref,
      'scan_status', v_status,
      'oidc_claim_digest', p_oidc_claim_digest
    )
  );

  RETURN jsonb_build_object('ok', true, 'scan_id', v_scan_id, 'replayed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_scan_report(jsonb, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_scan_report(jsonb, text, text, text, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.ingest_scan_report(jsonb, text, text, text, text, jsonb) IS
  'Atomically ingests a validated GitHub Actions OIDC report; callable only by the server-side sentinel-ingest function.';

NOTIFY pgrst, 'reload schema';
