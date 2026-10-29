import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const pageCursorSchema = z
  .object({ createdAt: z.string().datetime({ offset: true }), id: uuidSchema })
  .strict();
export const findingSeverityFilterSchema = z.enum([
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'unknown',
]);
export const findingScannerFilterSchema = z.enum(['semgrep', 'osv', 'gitleaks', 'composer']);
export const findingTriageFilterSchema = z.enum([
  'open',
  'acknowledged',
  'investigating',
  'false_positive',
  'accepted_risk',
  'fixed',
]);

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(80),
        message: z.string().min(1).max(240),
        requestId: z.string().uuid(),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const pageInfoSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    nextCursor: z.string().max(512).nullable(),
  })
  .strict();

export const organizationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160),
    slug: z.string().min(1).max(160),
    role: z.enum(['owner', 'maintainer', 'viewer']).optional(),
  })
  .strict();

export const organizationsResponseSchema = z.object({ data: z.array(organizationSchema) }).strict();

export const dataResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: item }).strict();

export const createOrganizationInputSchema = z
  .object({ name: z.string().trim().min(1).max(160) })
  .strict();

export const registerRepositoryInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    fullName: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    defaultBranch: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9_./-]+$/)
      .refine((value) => !/(^\/|\/$|\/\/|(^|\/)\.\.?($|\/)|\.lock$)/u.test(value)),
  })
  .strict();

export const repositorySchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    fullName: z.string().min(3).max(200),
    visibility: z.enum(['public', 'private', 'internal', 'unknown']),
    defaultBranch: z.string().min(1).max(255),
    status: z.enum(['pending_pairing', 'verified', 'disabled']),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    workflows: z
      .array(
        z
          .object({
            workflowRef: z.string().min(1).max(512),
            refPattern: z.string().max(500).nullable(),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .optional(),
    lastRun: z
      .object({
        id: z.string().uuid(),
        githubRunId: z.string().min(1),
        status: z.enum([
          'awaiting_report',
          'running',
          'completed',
          'partial',
          'failed',
          'cancelled',
          'rejected',
        ]),
        createdAt: z.string().datetime({ offset: true }),
        completedAt: z.string().datetime({ offset: true }).nullable(),
        commitSha: z.string().min(1),
        ref: z.string().min(1),
      })
      .nullable()
      .optional(),
  })
  .strict();

export const createRepositoryResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    fullName: z.string().min(3).max(200),
    defaultBranch: z.string().min(1).max(255),
    status: z.literal('pending_pairing'),
    pairingExpiresAt: z.null(),
  })
  .strict();

export const pairingResponseSchema = z
  .object({
    repositoryId: z.string().uuid(),
    nonce: z.string().min(32).max(128),
    expiresAt: z.string().datetime({ offset: true }),
    workflowFile: z.literal('.github/workflows/sentinel-scan.yml'),
  })
  .strict();

export const scannerExecutionApiSchema = z
  .object({
    scanner: z.enum(['semgrep', 'osv', 'gitleaks', 'composer']),
    version: z.string().min(1).max(100),
    status: z.enum(['success', 'skipped', 'failed', 'timed_out']),
    elapsedMs: z.number().int().nonnegative().nullable(),
    findingsCount: z.number().int().nonnegative(),
    skipReason: z.string().nullable(),
    errorRedacted: z.string().nullable(),
    rulesetVersion: z.string().nullable(),
    rulesetDigest: z.string().nullable(),
    rulesetSource: z.string().nullable(),
    licenseGate: z.enum(['approved', 'blocked', 'unknown']),
  })
  .strict();

export const scanRunSchema = z
  .object({
    id: z.string().uuid(),
    repositoryId: z.string().uuid(),
    repositoryFullName: z.string().min(3).max(200).optional(),
    githubRunId: z.string().min(1),
    runAttempt: z.number().int().positive(),
    commitSha: z.string().min(40).max(64),
    ref: z.string().min(1).max(500),
    eventName: z.string().min(1).max(100),
    status: z.enum([
      'awaiting_report',
      'running',
      'completed',
      'partial',
      'failed',
      'cancelled',
      'rejected',
    ]),
    reportSchemaVersion: z.number().int().positive(),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    workflowRef: z.string().max(512).nullable(),
    coverage: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime({ offset: true }),
    engines: z.array(scannerExecutionApiSchema).optional(),
  })
  .strict();

export const findingEvidenceApiSchema = z
  .object({
    filePath: z.string().min(1).max(1024),
    lineStart: z.number().int().positive().nullable(),
    lineEnd: z.number().int().positive().nullable(),
    redactedExcerpt: z.string().nullable(),
    packageName: z.string().nullable(),
    version: z.string().nullable(),
  })
  .strict();

export const findingAdvisoryApiSchema = z
  .object({
    source: z.string().min(1).max(80),
    sourceAdvisoryId: z.string().min(1).max(255),
    title: z.string().nullable(),
    severity: z.string().nullable(),
    aliases: z.array(z.object({ alias: z.string(), type: z.string() }).strict()),
  })
  .strict();

export const findingApiSchema = z
  .object({
    id: z.string().uuid(),
    scanId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    repositoryFullName: z.string().min(3).max(200),
    githubRunId: z.string().min(1),
    runAttempt: z.number().int().positive(),
    commitSha: z.string().min(40).max(64),
    ref: z.string().min(1).max(500),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    scanner: findingScannerFilterSchema,
    ruleId: z.string().min(1).max(255),
    category: z.enum(['sast', 'secret', 'sca', 'unknown']),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info', 'unknown']),
    evidenceStatus: z.enum(['detected', 'potentially_affected', 'unknown', 'not_applicable']),
    title: z.string().min(1).max(500),
    messageRedacted: z.string().max(4000),
    sourceUrl: z.string().url().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    triage: z.enum([
      'open',
      'acknowledged',
      'investigating',
      'false_positive',
      'accepted_risk',
      'fixed',
    ]),
    evidence: z.array(findingEvidenceApiSchema),
    advisories: z.array(findingAdvisoryApiSchema),
  })
  .strict();

export const organizationOverviewSchema = z
  .object({
    repositoryCount: z.number().int().nonnegative(),
    verifiedRepositoryCount: z.number().int().nonnegative(),
    pendingRepositoryCount: z.number().int().nonnegative(),
    openFindingCount: z.number().int().nonnegative(),
    recentRuns: z.array(
      z
        .object({
          id: z.string().uuid(),
          repositoryId: z.string().uuid(),
          repositoryFullName: z.string().min(3).max(200),
          githubRunId: z.string().min(1),
          runAttempt: z.number().int().positive(),
          commitSha: z.string().min(40).max(64),
          ref: z.string().min(1).max(500),
          status: z.enum([
            'awaiting_report',
            'running',
            'completed',
            'partial',
            'failed',
            'cancelled',
            'rejected',
          ]),
          completedAt: z.string().datetime({ offset: true }).nullable(),
          createdAt: z.string().datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict();

export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type ScanRun = z.infer<typeof scanRunSchema>;
export type FindingApiRecord = z.infer<typeof findingApiSchema>;
export type OrganizationOverview = z.infer<typeof organizationOverviewSchema>;
export type FindingEvidenceApi = z.infer<typeof findingEvidenceApiSchema>;
export type PairingResponse = z.infer<typeof pairingResponseSchema>;

export const pagedResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), page: pageInfoSchema }).strict();
