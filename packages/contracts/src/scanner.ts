import { z } from 'zod';

export const scannerNameSchema = z.enum(['semgrep', 'osv', 'gitleaks', 'composer']);
export type ScannerName = z.infer<typeof scannerNameSchema>;

export const scannerStatusSchema = z.enum(['success', 'failed', 'skipped', 'timed_out']);
export type ScannerStatus = z.infer<typeof scannerStatusSchema>;

export const findingSeveritySchema = z.enum([
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'unknown',
]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const evidenceStatusSchema = z.enum(['detected', 'potentially_affected', 'unknown']);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const findingCategorySchema = z.enum(['sast', 'sca', 'secret']);
export type FindingCategory = z.infer<typeof findingCategorySchema>;

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}

const safeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => !containsControlCharacters(value));
const relativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith('/') && !/^[a-z]:/iu.test(value))
  .refine((value) => !value.includes('\\'))
  .refine((value) => !value.split('/').some((segment) => segment === '..' || segment === '.'));
const projectPathSchema = z
  .string()
  .max(1_024)
  .refine((value) => value === '.' || relativePathSchema.safeParse(value).success);

const allowedReferenceHosts = new Set([
  'cve.org',
  'cveawg.mitre.org',
  'github.com',
  'getcomposer.org',
  'nvd.nist.gov',
  'osv.dev',
  'packagist.org',
  'semgrep.dev',
]);

export const safeReferenceSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        allowedReferenceHosts.has(url.hostname.toLowerCase()) &&
        url.username.length === 0 &&
        url.password.length === 0 &&
        url.search.length === 0 &&
        url.hash.length === 0
      );
    } catch {
      return false;
    }
  });

const packageSchema = z
  .object({
    ecosystem: safeTextSchema.max(80),
    name: safeTextSchema.max(256),
    version: safeTextSchema.max(128).optional(),
  })
  .strict();

export const scannerExecutionSchema = z
  .object({
    scanner: scannerNameSchema,
    toolVersion: safeTextSchema.max(100),
    status: scannerStatusSchema,
    durationMs: z.number().int().min(0).max(86_400_000),
    skipReason: safeTextSchema.max(500).optional(),
    sanitizedError: safeTextSchema.optional(),
    findingsCount: z.number().int().min(0).max(100_000),
    rulesetVersion: safeTextSchema.max(200).optional(),
    rulesetDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    rulesetSource: safeTextSchema.max(500).optional(),
    licenseGate: z.enum(['approved', 'blocked', 'unknown']).default('unknown'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'skipped' && !value.skipReason) {
      context.addIssue({
        code: 'custom',
        message: 'Scanner yang dilewati wajib memiliki alasan.',
        path: ['skipReason'],
      });
    }
    if (Boolean(value.rulesetVersion) !== Boolean(value.rulesetDigest)) {
      context.addIssue({
        code: 'custom',
        message: 'Versi dan digest ruleset harus tersedia bersama.',
        path: ['rulesetDigest'],
      });
    }
    if (
      value.licenseGate === 'approved' &&
      (!value.rulesetVersion || !value.rulesetDigest || !value.rulesetSource)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Ruleset yang disetujui wajib memiliki provenance lengkap.',
        path: ['licenseGate'],
      });
    }
  });

export type ScannerExecution = z.infer<typeof scannerExecutionSchema>;

export const detectionFindingSchema = z
  .object({
    scanner: scannerNameSchema,
    scannerSources: z.array(scannerNameSchema).min(1).max(4),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    ruleId: safeTextSchema.max(255),
    category: findingCategorySchema,
    severity: findingSeveritySchema,
    evidenceStatus: evidenceStatusSchema,
    title: safeTextSchema.max(500),
    messageRedacted: safeTextSchema.max(4_000),
    filePath: relativePathSchema.optional(),
    lineStart: z.number().int().min(1).optional(),
    package: packageSchema.optional(),
    advisoryIds: z.array(safeTextSchema.max(120)).max(100).optional(),
    references: z.array(safeReferenceSchema).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.scannerSources.includes(value.scanner)) {
      context.addIssue({
        code: 'custom',
        message: 'Sumber scanner utama harus ada pada scannerSources.',
        path: ['scannerSources'],
      });
    }
    if (new Set(value.scannerSources).size !== value.scannerSources.length) {
      context.addIssue({
        code: 'custom',
        message: 'Sumber scanner tidak boleh duplikat.',
        path: ['scannerSources'],
      });
    }
    if (value.category === 'sca' && !value.package) {
      context.addIssue({
        code: 'custom',
        message: 'Temuan dependensi wajib memiliki identitas package.',
        path: ['package'],
      });
    }
  });

export type DetectionFinding = z.infer<typeof detectionFindingSchema>;

const missingLockfileSchema = z
  .object({
    projectPath: projectPathSchema,
    manifestPath: relativePathSchema,
    ecosystem: z.enum(['composer', 'node']),
    supportedLockfiles: z.array(safeTextSchema.max(80)).min(1).max(5),
  })
  .strict();

const projectCoverageSchema = z
  .object({
    projectPath: projectPathSchema,
    ecosystem: z.enum(['composer', 'node']),
    manifestPath: relativePathSchema.optional(),
    lockfiles: z.array(relativePathSchema).max(50),
    frameworkHints: z.array(safeTextSchema.max(80)).max(20),
  })
  .strict();

const skippedScannerSchema = z
  .object({
    scanner: scannerNameSchema,
    reason: safeTextSchema.max(500),
  })
  .strict();

export const reportCoverageSchema = z
  .object({
    languages: z.array(z.enum(['php', 'javascript', 'typescript'])).max(3),
    frameworkHints: z.array(safeTextSchema.max(80)).max(50),
    projects: z.array(projectCoverageSchema).max(250),
    applicableScanners: z.array(scannerNameSchema).max(4),
    skippedScanners: z.array(skippedScannerSchema).max(4),
    missingLockfiles: z.array(missingLockfileSchema).max(100),
    warnings: z.array(safeTextSchema.max(500)).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const skippedNames = value.skippedScanners.map(({ scanner }) => scanner);
    if (new Set(skippedNames).size !== skippedNames.length) {
      context.addIssue({
        code: 'custom',
        message: 'Daftar scanner yang dilewati tidak boleh duplikat.',
        path: ['skippedScanners'],
      });
    }
    if (skippedNames.some((scanner) => value.applicableScanners.includes(scanner))) {
      context.addIssue({
        code: 'custom',
        message: 'Scanner tidak boleh sekaligus berlaku dan dilewati.',
        path: ['skippedScanners'],
      });
    }
  });

export type ReportCoverage = z.infer<typeof reportCoverageSchema>;

export const reportEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: z
      .object({
        id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        fullName: z
          .string()
          .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
          .max(200),
      })
      .strict(),
    github: z
      .object({
        runId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        runAttempt: z.number().int().positive().max(100),
        sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu),
        ref: safeTextSchema.max(512),
        workflowRef: safeTextSchema.max(512),
      })
      .strict(),
    pairingNonce: z
      .string()
      .min(16)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
    summary: z
      .object({
        status: z.enum(['completed', 'partial', 'failed']),
        startedAt: z.string().datetime({ offset: true }),
        completedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    scannerExecutions: z.array(scannerExecutionSchema).min(1).max(4),
    findings: z.array(detectionFindingSchema).max(1_000),
    coverage: reportCoverageSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const scannerNames = value.scannerExecutions.map(({ scanner }) => scanner);
    if (new Set(scannerNames).size !== scannerNames.length) {
      context.addIssue({
        code: 'custom',
        message: 'Setiap scanner hanya boleh memiliki satu execution per report.',
        path: ['scannerExecutions'],
      });
    }
    if (
      new Set(value.coverage.applicableScanners).size !== value.coverage.applicableScanners.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Daftar scanner yang berlaku tidak boleh duplikat.',
        path: ['coverage', 'applicableScanners'],
      });
    }
    const executionNames = new Set(scannerNames);
    if (
      value.findings.some((finding) =>
        finding.scannerSources.some((scanner) => !executionNames.has(scanner)),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Setiap sumber finding harus memiliki scanner execution dalam report.',
        path: ['findings'],
      });
    }
    if (Date.parse(value.summary.startedAt) > Date.parse(value.summary.completedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Waktu selesai tidak boleh lebih awal dari waktu mulai.',
        path: ['summary', 'completedAt'],
      });
    }
  });

export type ReportEnvelope = z.infer<typeof reportEnvelopeSchema>;
