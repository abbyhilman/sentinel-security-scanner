import { reportCoverageSchema, type ReportCoverage, type ScannerName } from '@sentinel/contracts';
import { isRecord } from './common';
import { normalizeRepositoryPath, sanitizeText } from './sanitize';

export interface RepositoryFileDescriptor {
  path: string;
  content?: string;
}

interface ProjectRecord {
  projectPath: string;
  ecosystem: 'composer' | 'node';
  manifestPath?: string;
  lockfiles: Set<string>;
  frameworkHints: Set<string>;
}

const lockfileEcosystem = new Map<string, 'composer' | 'node'>([
  ['composer.lock', 'composer'],
  ['package-lock.json', 'node'],
  ['npm-shrinkwrap.json', 'node'],
  ['yarn.lock', 'node'],
  ['pnpm-lock.yaml', 'node'],
]);

const nodeLockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'];
const phpFrameworks = new Map([
  ['laravel/framework', 'Laravel'],
  ['symfony/framework-bundle', 'Symfony'],
]);
const nodeFrameworks = new Map([
  ['express', 'Express'],
  ['next', 'Next.js'],
  ['fastify', 'Fastify'],
  ['@nestjs/core', 'NestJS'],
]);

function directoryOf(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '.' : separator === 0 ? '.' : path.slice(0, separator);
}

function isWithin(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}

function parsedManifest(content: string | undefined): Record<string, unknown> | undefined {
  if (!content) return undefined;
  try {
    const value: unknown = JSON.parse(content);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function dependencyNames(manifest: Record<string, unknown>): Set<string> {
  const result = new Set<string>();
  for (const groupName of [
    'require',
    'require-dev',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const group = manifest[groupName];
    if (isRecord(group)) {
      for (const name of Object.keys(group)) result.add(name.toLowerCase());
    }
  }
  return result;
}

function frameworkHints(
  ecosystem: 'composer' | 'node',
  manifest: Record<string, unknown> | undefined,
): Set<string> {
  const hints = new Set<string>();
  if (!manifest) return hints;
  const dependencies = dependencyNames(manifest);
  const frameworkMap = ecosystem === 'composer' ? phpFrameworks : nodeFrameworks;
  for (const [dependency, framework] of frameworkMap) {
    if (dependencies.has(dependency.toLowerCase())) hints.add(framework);
  }
  return hints;
}

function addLanguage(languages: Set<'php' | 'javascript' | 'typescript'>, path: string): void {
  const extension = path.toLowerCase().split('.').at(-1);
  if (extension === 'php') languages.add('php');
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension ?? '')) languages.add('javascript');
  if (['ts', 'tsx', 'mts', 'cts'].includes(extension ?? '')) languages.add('typescript');
}

function addProject(
  projects: Map<string, ProjectRecord>,
  ecosystem: 'composer' | 'node',
  projectPath: string,
): ProjectRecord {
  const key = `${ecosystem}:${projectPath}`;
  let project = projects.get(key);
  if (!project) {
    project = { projectPath, ecosystem, lockfiles: new Set(), frameworkHints: new Set() };
    projects.set(key, project);
  }
  return project;
}

function findNearestProject(
  projects: Map<string, ProjectRecord>,
  ecosystem: 'composer' | 'node',
  filePath: string,
): ProjectRecord | undefined {
  const directory = directoryOf(filePath);
  return [...projects.values()]
    .filter(
      (project) => project.ecosystem === ecosystem && isWithin(project.projectPath, directory),
    )
    .sort((left, right) => right.projectPath.length - left.projectPath.length)[0];
}

export function detectRepositoryCoverage(
  files: readonly RepositoryFileDescriptor[],
): ReportCoverage {
  const normalizedFiles = new Map<string, RepositoryFileDescriptor>();
  const warnings = new Set<string>();
  for (const file of files) {
    const path = normalizeRepositoryPath(file.path);
    if (!path) {
      warnings.add(
        'Satu atau lebih path file tidak aman dan tidak dimasukkan ke hasil deteksi coverage.',
      );
      continue;
    }
    if (!normalizedFiles.has(path)) normalizedFiles.set(path, { ...file, path });
  }

  const projects = new Map<string, ProjectRecord>();
  const languages = new Set<'php' | 'javascript' | 'typescript'>();
  const frameworkSet = new Set<string>();
  let supportedSourceFileCount = 0;

  for (const file of normalizedFiles.values()) {
    const lowerPath = file.path.toLowerCase();
    const baseName = lowerPath.split('/').at(-1) ?? lowerPath;
    if (['composer.json', 'package.json'].includes(baseName)) {
      const ecosystem = baseName === 'composer.json' ? 'composer' : 'node';
      const projectPath = directoryOf(file.path);
      const project = addProject(projects, ecosystem, projectPath);
      project.manifestPath = file.path;
      const manifest = parsedManifest(file.content);
      if (file.content && !manifest) {
        warnings.add(
          `Manifest ${file.path} tidak valid; framework hanya dapat dideteksi dari ekstensi file.`,
        );
      }
      for (const hint of frameworkHints(ecosystem, manifest)) {
        project.frameworkHints.add(hint);
        frameworkSet.add(hint);
      }
      if (ecosystem === 'composer') languages.add('php');
      else languages.add('javascript');
    }
  }

  for (const file of normalizedFiles.values()) {
    const lowerPath = file.path.toLowerCase();
    const baseName = lowerPath.split('/').at(-1) ?? lowerPath;
    if (lockfileEcosystem.has(baseName)) {
      const ecosystem = lockfileEcosystem.get(baseName);
      if (ecosystem) {
        const nearest = findNearestProject(projects, ecosystem, file.path);
        const project = nearest ?? addProject(projects, ecosystem, directoryOf(file.path));
        project.lockfiles.add(file.path);
      }
    }

    const extension = lowerPath.split('.').at(-1) ?? '';
    if (['php', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'].includes(extension)) {
      supportedSourceFileCount += 1;
      addLanguage(languages, file.path);
    }
  }

  const missingLockfiles: ReportCoverage['missingLockfiles'] = [];
  for (const project of projects.values()) {
    const manifestPath = project.manifestPath;
    if (!manifestPath || project.lockfiles.size > 0) continue;
    missingLockfiles.push({
      projectPath: project.projectPath,
      manifestPath,
      ecosystem: project.ecosystem,
      supportedLockfiles: project.ecosystem === 'composer' ? ['composer.lock'] : nodeLockfiles,
    });
  }

  const hasSupportedLockfile = [...projects.values()].some((project) => project.lockfiles.size > 0);
  const hasComposerLock = [...projects.values()].some(
    (project) => project.ecosystem === 'composer' && project.lockfiles.size > 0,
  );
  const applicableScanners: ScannerName[] = ['gitleaks'];
  const skippedScanners: ReportCoverage['skippedScanners'] = [];
  if (supportedSourceFileCount > 0) applicableScanners.push('semgrep');
  else
    skippedScanners.push({
      scanner: 'semgrep',
      reason: 'Tidak ditemukan file PHP, JavaScript, atau TypeScript.',
    });
  if (hasSupportedLockfile) applicableScanners.push('osv');
  else
    skippedScanners.push({
      scanner: 'osv',
      reason: 'Tidak ditemukan lockfile dependency yang didukung.',
    });
  if (hasComposerLock) applicableScanners.push('composer');
  else skippedScanners.push({ scanner: 'composer', reason: 'composer.lock tidak ditemukan.' });

  return reportCoverageSchema.parse({
    languages: [...languages].sort(),
    frameworkHints: [...frameworkSet].sort(),
    projects: [...projects.values()]
      .map((project) => ({
        projectPath: project.projectPath,
        ecosystem: project.ecosystem,
        ...(project.manifestPath ? { manifestPath: project.manifestPath } : {}),
        lockfiles: [...project.lockfiles].sort(),
        frameworkHints: [...project.frameworkHints].sort(),
      }))
      .sort((left, right) =>
        left.projectPath < right.projectPath ? -1 : left.projectPath > right.projectPath ? 1 : 0,
      ),
    applicableScanners: [...new Set(applicableScanners)],
    skippedScanners,
    missingLockfiles,
    warnings: [...warnings].map((warning) => sanitizeText(warning, 500)),
  });
}
