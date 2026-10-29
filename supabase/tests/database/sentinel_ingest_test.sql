BEGIN;
SELECT plan(21);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ingest_scan_report(jsonb,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous role cannot execute the ingestion RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.ingest_scan_report(jsonb,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated role cannot execute the ingestion RPC'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.ingest_scan_report(jsonb,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'server-side service role can execute the restricted ingestion RPC'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.scan_runs', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.findings', 'INSERT'),
  'service role cannot bypass the ingestion RPC with direct table inserts'
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES (
  '61000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'stage06-owner@example.test', '', now(), '{}', '{}'
);
INSERT INTO public.organizations (id, name, slug)
VALUES
  ('62000000-0000-4000-8000-000000000001', 'Stage 06 Tenant A', 'stage06-tenant-a'),
  ('62000000-0000-4000-8000-000000000002', 'Stage 06 Tenant B', 'stage06-tenant-b');
INSERT INTO public.organization_members (org_id, user_id, role)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  'owner'
);
INSERT INTO public.repositories (id, org_id, full_name, default_branch, onboarding_state)
VALUES
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001',
   'fixture/owned-repo', 'main', 'pending'),
  ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002',
   'fixture/other-repo', 'main', 'pending'),
  ('63000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000002',
   'fixture/expired-repo', 'main', 'pending');
INSERT INTO public.repository_pairings (id, repo_id, nonce_hash, expires_at, created_at)
VALUES (
  '64000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  repeat('f', 64),
  now() + interval '15 minutes',
  now()
), (
  '64000000-0000-4000-8000-000000000002',
  '63000000-0000-4000-8000-000000000003',
  repeat('0', 64),
  now() - interval '30 minutes',
  now() - interval '1 hour'
);

CREATE TEMP TABLE stage06_input (
  report jsonb NOT NULL,
  claims jsonb NOT NULL,
  nonce_hash text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL
);
INSERT INTO stage06_input VALUES (
  '{
    "schemaVersion": 1,
    "repository": {"id": 123456789, "fullName": "fixture/owned-repo"},
    "github": {
      "runId": 987654321,
      "runAttempt": 1,
      "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "ref": "refs/heads/main",
      "workflowRef": "fixture/owned-repo/.github/workflows/sentinel-scan.yml@refs/heads/main"
    },
    "summary": {
      "status": "completed",
      "startedAt": "2026-10-28T01:59:00Z",
      "completedAt": "2026-10-28T02:00:00Z"
    },
    "scannerExecutions": [{
      "scanner": "semgrep", "toolVersion": "1.182.0", "status": "success",
      "durationMs": 100, "findingsCount": 0, "licenseGate": "unknown"
    }],
    "findings": [],
    "coverage": {
      "languages": ["typescript"], "frameworkHints": [], "projects": [],
      "applicableScanners": ["semgrep"], "skippedScanners": [],
      "missingLockfiles": [], "warnings": []
    }
  }'::jsonb,
  '{
    "issuer": "https://token.actions.githubusercontent.com",
    "repository_id": "123456789",
    "repository": "fixture/owned-repo",
    "workflow_ref": "fixture/owned-repo/.github/workflows/sentinel-scan.yml@refs/heads/main",
    "run_id": "987654321",
    "run_attempt": "1",
    "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "ref": "refs/heads/main",
    "event_name": "workflow_dispatch"
  }'::jsonb,
  repeat('f', 64),
  repeat('a', 64),
  repeat('b', 64)
);

CREATE FUNCTION pg_temp.call_ingest(
  p_report jsonb,
  p_nonce_hash text,
  p_idempotency_key text,
  p_payload_hash text,
  p_claims jsonb
)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT public.ingest_scan_report(
    p_report, p_nonce_hash, p_idempotency_key, p_payload_hash,
    repeat('c', 64), p_claims
  );
$function$;

SELECT is(
  pg_temp.call_ingest(
    (SELECT report FROM stage06_input),
    (SELECT nonce_hash FROM stage06_input),
    (SELECT idempotency_key FROM stage06_input),
    (SELECT payload_hash FROM stage06_input),
    (SELECT claims FROM stage06_input)
  ) ->> 'ok',
  'true',
  'valid workflow identity atomically ingests the first report'
);
SELECT ok(
  (SELECT github_repository_id = 123456789 AND onboarding_state = 'verified'
   FROM public.repositories WHERE id = '63000000-0000-4000-8000-000000000001'),
  'the exact pending repository is bound to the verified GitHub ID'
);
SELECT ok(
  (SELECT status = 'consumed' AND consumed_at IS NOT NULL
   FROM public.repository_pairings WHERE id = '64000000-0000-4000-8000-000000000001'),
  'the pairing nonce can only be consumed once'
);
SELECT ok(
  (SELECT workflow_ref = 'fixture/owned-repo/.github/workflows/sentinel-scan.yml@refs/heads/main'
      AND coverage_redacted -> 'languages' = '["typescript"]'::jsonb
   FROM public.scan_runs WHERE repository_id = '63000000-0000-4000-8000-000000000001'),
  'the run stores exact workflow provenance and sanitized coverage'
);
SELECT is(
  (SELECT count(*)::integer FROM public.scanner_executions
   WHERE scan_id = (SELECT id FROM public.scan_runs
                    WHERE github_run_id = 987654321 AND repository_id = '63000000-0000-4000-8000-000000000001')),
  1,
  'scanner execution is stored with the scan'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.ingestion_receipts WHERE idempotency_key = repeat('a', 64))
  AND EXISTS (SELECT 1 FROM public.audit_events WHERE type = 'scan.report_ingested'),
  'receipt and audit event are committed with the report'
);
SELECT is(
  pg_temp.call_ingest(
    (SELECT report FROM stage06_input),
    (SELECT nonce_hash FROM stage06_input),
    (SELECT idempotency_key FROM stage06_input),
    (SELECT payload_hash FROM stage06_input),
    (SELECT claims FROM stage06_input)
  ) ->> 'replayed',
  'true',
  'an exact retry returns the original run before nonce validation'
);
SELECT is(
  (SELECT count(*)::integer FROM public.scan_runs
   WHERE repository_id = '63000000-0000-4000-8000-000000000001'
     AND github_run_id = 987654321 AND run_attempt = 1),
  1,
  'an exact retry does not duplicate the scan run'
);
SELECT is(
  pg_temp.call_ingest(
    (SELECT report FROM stage06_input),
    (SELECT nonce_hash FROM stage06_input),
    (SELECT idempotency_key FROM stage06_input),
    repeat('d', 64),
    (SELECT claims FROM stage06_input)
  ) ->> 'code',
  'idempotency_conflict',
  'the same run tuple with a changed body conflicts'
);

WITH other_repository AS (
  SELECT
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(report, '{repository,id}', to_jsonb(123456790)),
          '{repository,fullName}', '"fixture/other-repo"'::jsonb
        ),
        '{github,workflowRef}',
        '"fixture/other-repo/.github/workflows/sentinel-scan.yml@refs/heads/main"'::jsonb
      ),
      '{github,runId}', to_jsonb(987654322)
    ) AS report,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(claims, '{repository_id}', '"123456790"'::jsonb),
          '{repository}', '"fixture/other-repo"'::jsonb
        ),
        '{workflow_ref}',
        '"fixture/other-repo/.github/workflows/sentinel-scan.yml@refs/heads/main"'::jsonb
      ),
      '{run_id}', '"987654322"'::jsonb
    ) AS claims
  FROM stage06_input
)
SELECT is(
  pg_temp.call_ingest(
    other_repository.report,
    (SELECT nonce_hash FROM stage06_input),
    repeat('e', 64),
    repeat('d', 64),
    other_repository.claims
  ) ->> 'code',
  'pairing_invalid',
  'a consumed nonce cannot bind a different pending repository'
)
FROM other_repository;
SELECT ok(
  (SELECT github_repository_id IS NULL AND onboarding_state = 'pending'
   FROM public.repositories WHERE id = '63000000-0000-4000-8000-000000000002'),
  'a nonce from tenant A cannot bind a pending repository in tenant B'
);

WITH expired_pairing AS (
  SELECT
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(report, '{repository,id}', to_jsonb(123456791)),
          '{repository,fullName}', '"fixture/expired-repo"'::jsonb
        ),
        '{github,workflowRef}',
        '"fixture/expired-repo/.github/workflows/sentinel-scan.yml@refs/heads/main"'::jsonb
      ),
      '{github,runId}', to_jsonb(987654324)
    ) AS report,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(claims, '{repository_id}', '"123456791"'::jsonb),
          '{repository}', '"fixture/expired-repo"'::jsonb
        ),
        '{workflow_ref}',
        '"fixture/expired-repo/.github/workflows/sentinel-scan.yml@refs/heads/main"'::jsonb
      ),
      '{run_id}', '"987654324"'::jsonb
    ) AS claims
  FROM stage06_input
)
SELECT is(
  pg_temp.call_ingest(
    expired_pairing.report,
    repeat('0', 64),
    repeat('7', 64),
    repeat('6', 64),
    expired_pairing.claims
  ) ->> 'code',
  'pairing_invalid',
  'an expired pairing nonce is rejected'
)
FROM expired_pairing;
SELECT ok(
  (SELECT github_repository_id IS NULL AND onboarding_state = 'pending'
   FROM public.repositories WHERE id = '63000000-0000-4000-8000-000000000003'),
  'an expired nonce leaves its repository unchanged'
);

WITH invalid_evidence AS (
  SELECT
    jsonb_set(
      jsonb_set(
        jsonb_set(report, '{github,runId}', to_jsonb(987654323)),
        '{scannerExecutions,0,findingsCount}', '1'::jsonb
      ),
      '{findings}',
      '[{
        "scanner":"semgrep", "scannerSources":["semgrep"],
        "fingerprint":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "ruleId":"test-rule", "category":"sast", "severity":"high",
        "evidenceStatus":"detected", "title":"Synthetic finding",
        "messageRedacted":"Synthetic safe message"
      }]'::jsonb
    ) AS report,
    jsonb_set(claims, '{run_id}', '"987654323"'::jsonb) AS claims
  FROM stage06_input
)
SELECT is(
  pg_temp.call_ingest(
    invalid_evidence.report,
    NULL,
    repeat('9', 64),
    repeat('8', 64),
    invalid_evidence.claims
  ) ->> 'code',
  'invalid_report',
  'a finding without a safe evidence path is rejected before inserts'
)
FROM invalid_evidence;
SELECT is(
  (SELECT count(*)::integer FROM public.scan_runs
   WHERE repository_id = '63000000-0000-4000-8000-000000000001'
     AND github_run_id = 987654323),
  0,
  'a rejected report leaves no partial scan rows'
);

DO $rate_limit$
DECLARE
  v_index integer;
  v_report jsonb;
  v_claims jsonb;
  v_result jsonb;
BEGIN
  FOR v_index IN 1..29 LOOP
    v_report := jsonb_set(
      (SELECT report FROM stage06_input),
      '{github,runId}',
      pg_catalog.to_jsonb(987654321 + v_index)
    );
    v_claims := pg_catalog.jsonb_set(
      (SELECT claims FROM stage06_input),
      '{run_id}',
      pg_catalog.to_jsonb((987654321 + v_index)::text)
    );
    v_result := pg_temp.call_ingest(
      v_report,
      NULL,
      pg_catalog.lpad(pg_catalog.to_hex(987654321 + v_index), 64, '0'),
      pg_catalog.lpad(pg_catalog.to_hex(987654421 + v_index), 64, '0'),
      v_claims
    );
    IF v_result ->> 'ok' <> 'true' THEN
      RAISE EXCEPTION 'Rate-limit fixture report % was not accepted', v_index;
    END IF;
  END LOOP;
END;
$rate_limit$;
WITH rate_limited_report AS (
  SELECT
    jsonb_set(report, '{github,runId}', to_jsonb(987654400)) AS report,
    jsonb_set(claims, '{run_id}', '"987654400"'::jsonb) AS claims
  FROM stage06_input
)
SELECT is(
  pg_temp.call_ingest(
    rate_limited_report.report,
    NULL,
    repeat('2', 64),
    repeat('3', 64),
    rate_limited_report.claims
  ) ->> 'code',
  'rate_limited',
  'the repository rate limit rejects the 31st new report in one minute'
)
FROM rate_limited_report;
SELECT is(
  (SELECT count(*)::integer FROM public.scan_runs
   WHERE repository_id = '63000000-0000-4000-8000-000000000001'),
  30,
  'a rate-limited report creates no partial scan rows'
);

SELECT * FROM finish();
ROLLBACK;
