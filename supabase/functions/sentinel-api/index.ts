import { createSentinelApiHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const publishableKey =
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function isConfiguredUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

const handler =
  isConfiguredUrl(supabaseUrl) && publishableKey
    ? createSentinelApiHandler({ supabaseUrl, publishableKey })
    : null;

if (!handler)
  console.error(
    'sentinel-api is misconfigured; required public Supabase settings are unavailable.',
  );

Deno.serve((request) => {
  if (!handler) {
    return new Response(JSON.stringify({ error: 'api_temporarily_unavailable' }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  return handler(request);
});
