import { describe, expect, it } from 'vitest';
import {
  normalizeRepositoryPath,
  sanitizeReferenceUrl,
  sanitizeText,
  sha256Hex,
} from '../src/sanitize';

describe('sanitizers', () => {
  it('redacts credential-like strings and removes HTML tags', () => {
    const result = sanitizeText(
      'password="TEST_ONLY_DO_NOT_USE_abcdef123456" AWS_SECRET_ACCESS_KEY=TEST_ONLY_DO_NOT_USE_AWS_0000 <b>review</b> github_pat_TEST_ONLY_DO_NOT_USE_000000000000 https://user:TEST_ONLY_DO_NOT_USE_url@osv.dev/item',
    );
    expect(result).not.toContain('TEST_ONLY_DO_NOT_USE_abcdef123456');
    expect(result).not.toContain('TEST_ONLY_DO_NOT_USE_AWS_0000');
    expect(result).not.toContain('github_pat_TEST_ONLY_DO_NOT_USE_000000000000');
    expect(result).not.toContain('TEST_ONLY_DO_NOT_USE_url');
    expect(result).not.toContain('<b>');
    expect(result).toContain('[REDACTED]');
  });

  it('strips a checkout root and rejects absolute paths outside it', () => {
    expect(normalizeRepositoryPath('D:\\runner\\repo\\src\\main.ts', 'D:\\runner\\repo')).toBe(
      'src/main.ts',
    );
    expect(normalizeRepositoryPath('D:\\outside\\secret.txt', 'D:\\runner\\repo')).toBeUndefined();
    expect(normalizeRepositoryPath('src/../../secret.txt')).toBeUndefined();
    expect(normalizeRepositoryPath('src files/main.ts')).toBe('src files/main.ts');
  });

  it('allowlists HTTPS advisory sources and drops URL query and fragment', () => {
    expect(
      sanitizeReferenceUrl('https://github.com/advisories/GHSA-test?token=synthetic#details'),
    ).toBe('https://github.com/advisories/GHSA-test');
    expect(sanitizeReferenceUrl('http://github.com/advisories/GHSA-test')).toBeUndefined();
    expect(sanitizeReferenceUrl('https://attacker.example/advisory')).toBeUndefined();
    expect(sanitizeReferenceUrl('https://user:pass@osv.dev/vulnerability/TEST')).toBeUndefined();
  });

  it('creates stable SHA-256 fingerprints', async () => {
    expect(await sha256Hex('sentinel-test')).toBe(await sha256Hex('sentinel-test'));
    expect(await sha256Hex('sentinel-test')).toMatch(/^[a-f0-9]{64}$/u);
  });
});
