import { z } from 'zod';

const publicEnvSchema = z
  .object({
    appEnv: z.enum(['development', 'test', 'production']).default('development'),
    supabaseUrl: z.string().url().optional(),
    supabasePublishableKey: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.supabaseUrl) !== Boolean(value.supabasePublishableKey)) {
      context.addIssue({
        code: 'custom',
        message: 'URL dan publishable key Supabase harus diisi bersama.',
        path: ['supabaseUrl'],
      });
    }
  });

const allowedViteKeys = new Set([
  'VITE_APP_ENV',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
]);

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(input: unknown): PublicEnv {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Environment aplikasi harus berupa object.');
  }

  const raw = input as Record<string, unknown>;
  const unexpectedViteKeys = Object.keys(raw).filter(
    (key) => key.startsWith('VITE_') && !allowedViteKeys.has(key),
  );

  if (unexpectedViteKeys.length > 0) {
    throw new Error('Variabel VITE_ tidak diizinkan: ' + unexpectedViteKeys.sort().join(', '));
  }

  return publicEnvSchema.parse({
    appEnv: raw.VITE_APP_ENV ?? raw.MODE,
    supabaseUrl: raw.VITE_SUPABASE_URL || undefined,
    supabasePublishableKey: raw.VITE_SUPABASE_PUBLISHABLE_KEY || undefined,
  });
}
