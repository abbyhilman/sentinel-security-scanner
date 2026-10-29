import { createClient } from '@supabase/supabase-js';
import { parsePublicEnv } from '@sentinel/contracts';

export const publicEnv = parsePublicEnv(import.meta.env);
export const supabase =
  publicEnv.supabaseUrl && publicEnv.supabasePublishableKey
    ? createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;
