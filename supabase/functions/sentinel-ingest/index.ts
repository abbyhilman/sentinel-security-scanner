import { createIngestHandler, type IngestCommand, type IngestOutcome } from './handler.ts';
import { createGitHubOidcVerifier } from './oidc.ts';

const supabaseUrlValue = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function getIngestEndpoint(): URL | null {
  try {
    const base = new URL(supabaseUrlValue);
    if (
      base.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname) ||
      base.port ||
      base.pathname !== '/' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      return null;
    }
    return new URL('/rest/v1/rpc/ingest_scan_report', base);
  } catch {
    return null;
  }
}

const ingestEndpoint = getIngestEndpoint();
const expectedAudience = ingestEndpoint
  ? new URL('/functions/v1/sentinel-ingest', new URL(supabaseUrlValue)).toString()
  : '';

async function persist(command: IngestCommand): Promise<IngestOutcome> {
  if (!ingestEndpoint || !serviceRoleKey) throw new Error('Ingestion server is not configured.');

  const rpcResponse = await fetch(ingestEndpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      p_report: command.report,
      p_pairing_nonce_hash: command.pairingNonceHash,
      p_idempotency_key: command.idempotencyKey,
      p_payload_hash: command.payloadHash,
      p_oidc_claim_digest: command.oidcClaimDigest,
      p_oidc_claims: {
        issuer: command.claims.issuer,
        repository_id: command.claims.repositoryId,
        repository: command.claims.repository,
        workflow_ref: command.claims.workflowRef,
        run_id: command.claims.runId,
        run_attempt: command.claims.runAttempt,
        sha: command.claims.sha,
        ref: command.claims.ref,
        event_name: command.claims.eventName,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!rpcResponse.ok) throw new Error('Atomic ingestion RPC failed.');
  const outcome: unknown = await rpcResponse.json();
  if (typeof outcome !== 'object' || outcome === null || Array.isArray(outcome)) {
    throw new Error('Atomic ingestion RPC returned an invalid response.');
  }
  const result = outcome as Record<string, unknown>;
  if (
    result.ok === true &&
    typeof result.scan_id === 'string' &&
    typeof result.replayed === 'boolean'
  ) {
    return { ok: true, scanId: result.scan_id, replayed: result.replayed };
  }
  if (
    result.ok === false &&
    [
      'pairing_required',
      'pairing_invalid',
      'repository_mismatch',
      'workflow_not_allowed',
      'idempotency_conflict',
      'rate_limited',
      'invalid_report',
    ].includes(String(result.code))
  ) {
    return { ok: false, code: result.code as Extract<IngestOutcome, { ok: false }>['code'] };
  }
  throw new Error('Atomic ingestion RPC returned an unknown response.');
}

if (!expectedAudience) {
  console.error('sentinel-ingest is misconfigured; required server settings are unavailable.');
} else if (!serviceRoleKey) {
  console.error('sentinel-ingest is misconfigured; required server settings are unavailable.');
}

const handleIngest = expectedAudience
  ? createIngestHandler({
      verifyToken: createGitHubOidcVerifier({ audience: expectedAudience }),
      persist,
    })
  : undefined;

Deno.serve((request) => {
  if (!expectedAudience || !serviceRoleKey || !handleIngest) {
    return new Response(JSON.stringify({ error: 'ingestion_temporarily_unavailable' }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  return handleIngest(request);
});
