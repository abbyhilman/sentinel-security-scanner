-- Local-only RLS fixtures. These users have no password and cannot sign in.
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dev-owner@sentinel.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dev-viewer@sentinel.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dev-isolated-owner@sentinel.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Sentinel Demo Workspace', 'sentinel-demo'),
  ('20000000-0000-4000-8000-000000000002', 'Sentinel Isolated Workspace', 'sentinel-isolated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (org_id, user_id, role)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'viewer'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.repositories (id, org_id, full_name, visibility, onboarding_state)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'demo-labs/api-service',
    'private',
    'pending'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'isolated-labs/web-service',
    'public',
    'pending'
  )
ON CONFLICT (id) DO NOTHING;
