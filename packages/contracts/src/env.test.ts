import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from './env';

describe('parsePublicEnv', () => {
  it('allows a local UI without Supabase configuration', () => {
    expect(parsePublicEnv({ MODE: 'development' })).toEqual({
      appEnv: 'development',
      supabaseUrl: undefined,
      supabasePublishableKey: undefined,
    });
  });

  it('accepts a Supabase URL and publishable key together', () => {
    expect(
      parsePublicEnv({
        MODE: 'production',
        VITE_SUPABASE_URL: 'https://sentinel.example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'public-placeholder',
      }),
    ).toMatchObject({
      appEnv: 'production',
      supabaseUrl: 'https://sentinel.example.supabase.co',
    });
  });

  it('rejects incomplete Supabase configuration', () => {
    expect(() =>
      parsePublicEnv({
        VITE_SUPABASE_URL: 'https://sentinel.example.supabase.co',
      }),
    ).toThrow();
  });

  it('rejects unapproved VITE_ variables to keep secrets out of the client bundle', () => {
    expect(() =>
      parsePublicEnv({
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only',
      }),
    ).toThrow(/VITE_SUPABASE_SERVICE_ROLE_KEY/);
  });
});
