# sentinel-api

Authenticated API for the Sentinel dashboard. Supabase verifies the user's JWT at the Edge Function boundary. The handler then confirms the session through Supabase Auth and forwards the same user JWT to PostgREST, so table policies and organization membership stay in force.

The function uses only `SUPABASE_URL` and a public key (`SUPABASE_PUBLISHABLE_KEY`, falling back to the platform's `SUPABASE_ANON_KEY`). It never reads or uses the service-role key.

Implemented routes:

- `GET/POST /v1/organizations`, `GET /v1/organizations/{id}/overview`, `GET /v1/organizations/{id}/runs`
- `GET/POST /v1/repositories`, `GET /v1/repositories/{id}`, `POST /v1/repositories/{id}/pairing`, `GET /v1/repositories/{id}/runs`
- `GET /v1/runs/{id}`, `GET /v1/runs/{id}/findings`
- `GET /v1/findings`, `GET /v1/findings/{id}`

All paginated reads cap page size at 100. Pairing challenges are random, returned once, and persisted only as SHA-256 hashes with a 15-minute expiry. The repository name and declared default branch are setup input, not GitHub-verified facts. Triage and export routes remain outside this phase.

For browser login, add each deployed dashboard origin to Supabase Auth's redirect URL allowlist. GitHub sign-in also requires the GitHub OAuth provider and callback credentials to be configured in the Supabase dashboard; local configuration does not enable those hosted provider settings.

Migration `20261028000300_authenticated_api.sql` and this function were applied to the linked project on 29 October 2026 after explicit approval. Future cloud changes still require explicit approval; this repository does not deploy them automatically.
