BEGIN;
SELECT plan(20);

SELECT ok(
  (
    SELECT count(*) = 18
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND relation_row.relname = ANY (ARRAY[
        'profiles', 'organizations', 'organization_members', 'repositories',
        'repository_pairings', 'repository_workflows', 'scan_runs',
        'scanner_executions', 'findings', 'finding_evidence', 'finding_triage',
        'ingestion_receipts', 'dependency_inventory', 'advisories',
        'advisory_aliases', 'finding_advisories', 'audit_events', 'scan_artifacts'
      ])
      AND relation_row.relkind = 'r'
  ),
  'all 18 canonical ERD tables exist'
);

SELECT ok(
  (
    SELECT count(*) = 18 AND bool_and(relation_row.relrowsecurity)
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND relation_row.relname = ANY (ARRAY[
        'profiles', 'organizations', 'organization_members', 'repositories',
        'repository_pairings', 'repository_workflows', 'scan_runs',
        'scanner_executions', 'findings', 'finding_evidence', 'finding_triage',
        'ingestion_receipts', 'dependency_inventory', 'advisories',
        'advisory_aliases', 'finding_advisories', 'audit_events', 'scan_artifacts'
      ])
      AND relation_row.relkind = 'r'
  ),
  'RLS is enabled on every canonical table'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.repositories', 'SELECT'),
  'anonymous role has no repository read grant'
);
SELECT ok(
  NOT has_schema_privilege('anon', 'public', 'USAGE'),
  'anonymous role cannot access the public schema'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.repositories', 'SELECT'),
  'authenticated role can read through RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.scan_runs', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.scanner_executions', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.findings', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.ingestion_receipts', 'INSERT'),
  'authenticated role cannot write ingestion tables directly'
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'viewer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('11000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('11000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'maintainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb);

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'Tenant A', 'tenant-a'),
  ('21000000-0000-4000-8000-000000000002', 'Tenant B', 'tenant-b');
INSERT INTO public.organization_members (org_id, user_id, role)
VALUES
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner'),
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'viewer'),
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000004', 'maintainer'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000003', 'owner');
INSERT INTO public.repositories (id, org_id, full_name, visibility, onboarding_state)
VALUES
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001',
   'tenant-a/app', 'private', 'pending'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002',
   'tenant-b/app', 'private', 'pending');
INSERT INTO public.scan_runs (
  id, repository_id, github_run_id, run_attempt, commit_sha, ref, event_name,
  status, report_schema_version, started_at, completed_at, payload_hash
)
VALUES
  ('41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
   701, 1, repeat('a', 40), 'refs/heads/main', 'push', 'completed', 1,
   '2026-10-28 00:00:00+00', '2026-10-28 00:01:00+00', repeat('b', 64)),
  ('41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002',
   702, 1, repeat('c', 40), 'refs/heads/main', 'push', 'completed', 1,
   '2026-10-28 00:00:00+00', '2026-10-28 00:01:00+00', repeat('d', 64));
INSERT INTO public.scanner_executions (scan_id, scanner, version, status, findings_count)
VALUES ('41000000-0000-4000-8000-000000000001', 'semgrep', '1.0.0', 'success', 1);
INSERT INTO public.findings (
  scan_id, fingerprint, scanner, rule_id, category, severity, evidence_status,
  title, message_redacted
)
VALUES (
  '41000000-0000-4000-8000-000000000001', repeat('e', 64), 'semgrep',
  'php.lang.security.test-rule', 'sast', 'high', 'detected',
  'Synthetic test finding', 'Sanitized synthetic message'
);

SELECT set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.repositories),
  1,
  'tenant A owner reads only its repository'
);
SELECT is(
  (SELECT count(*)::integer FROM public.scan_runs),
  1,
  'tenant A owner reads only its scan run'
);
SELECT is(
  (SELECT count(*)::integer FROM public.profiles),
  1,
  'profile reads are limited to the authenticated user'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.repositories WHERE id = '31000000-0000-4000-8000-000000000001'),
  1,
  'viewer can read repositories in its organization'
);
SELECT is(
  (SELECT count(*)::integer FROM public.repositories WHERE id = '31000000-0000-4000-8000-000000000002'),
  0,
  'viewer cannot read another tenant repository'
);
SELECT throws_ok(
  $$INSERT INTO public.finding_triage (repository_id, fingerprint, disposition, actor_user_id)
    VALUES ('31000000-0000-4000-8000-000000000001', repeat('e', 64), 'open',
      '11000000-0000-4000-8000-000000000002')$$,
  '42501',
  NULL,
  'viewer cannot append triage'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.finding_triage (repository_id, fingerprint, disposition, actor_user_id)
    VALUES ('31000000-0000-4000-8000-000000000001', repeat('e', 64), 'open',
      '11000000-0000-4000-8000-000000000001')$$,
  'owner can append triage for its repository'
);
SELECT throws_ok(
  $$INSERT INTO public.finding_triage (repository_id, fingerprint, disposition, actor_user_id)
    VALUES ('31000000-0000-4000-8000-000000000001', repeat('9', 64), 'open',
      '11000000-0000-4000-8000-000000000001')$$,
  '42501',
  NULL,
  'owner cannot triage a fingerprint absent from the repository'
);
SELECT is(
  (SELECT count(*)::integer FROM public.latest_finding_triage),
  1,
  'latest triage view is visible to the repository member'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.finding_triage (repository_id, fingerprint, disposition, actor_user_id)
    VALUES ('31000000-0000-4000-8000-000000000001', repeat('e', 64), 'investigating',
      '11000000-0000-4000-8000-000000000004')$$,
  'maintainer can append triage for its repository'
);
SELECT throws_ok(
  $$UPDATE public.finding_triage SET disposition = 'fixed' WHERE fingerprint = repeat('e', 64)$$,
  '42501',
  NULL,
  'triage history cannot be updated by authenticated users'
);

RESET ROLE;
SELECT throws_ok(
  $$INSERT INTO public.scan_runs (
      repository_id, github_run_id, run_attempt, commit_sha, ref, event_name,
      status, report_schema_version, started_at, completed_at, payload_hash
    ) VALUES (
      '31000000-0000-4000-8000-000000000001', 701, 1, repeat('f', 40),
      'refs/heads/main', 'push', 'completed', 1,
      '2026-10-28 00:00:00+00', '2026-10-28 00:01:00+00', repeat('0', 64)
    )$$,
  '23505',
  NULL,
  'duplicate GitHub run tuple is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.scan_runs (
      repository_id, github_run_id, run_attempt, commit_sha, ref, event_name,
      status, report_schema_version
    ) VALUES (
      '31000000-0000-4000-8000-000000000001', 703, 1, repeat('f', 40),
      'refs/heads/main', 'push', 'completed', 1
    )$$,
  '23514',
  NULL,
  'completed run requires a completion timestamp'
);
SELECT throws_ok(
  $$INSERT INTO public.repositories (org_id, github_repository_id, full_name, onboarding_state)
    VALUES ('21000000-0000-4000-8000-000000000001', 987654321, 'tenant-a/unproven', 'pending')$$,
  '23514',
  NULL,
  'pending repository cannot be bound to a GitHub ID before pairing'
);

-- Raise an error if any assertion failed, including when SQL Editor only shows
-- the last statement's result set.
SELECT * FROM finish(true);
ROLLBACK;
