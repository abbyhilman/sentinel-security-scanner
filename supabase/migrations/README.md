# Supabase migrations

The initial local schema is in `20261028000100_initial_schema.sql`. It follows the canonical ERD model and the accepted D-004, D-005, and D-006 decisions in `docs/DECISIONS.md`.

Before using a hosted project, run the migration and RLS tests against a clean local Supabase stack. Do not apply migrations to cloud automatically.

