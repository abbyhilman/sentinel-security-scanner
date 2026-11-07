import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const managers = {
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'composer.lock': 'composer',
};
const jsSections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const installedSections = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const phpSections = ['require', 'require-dev'];

function packageName(name, manager) {
  const segment = '[a-z0-9][a-z0-9._-]*';
  const pattern = manager === 'composer' ? `${segment}/${segment}` : `(?:@${segment}/)?${segment}`;
  return typeof name === 'string' &&
    name.length <= 214 &&
    new RegExp(`^${pattern}$`, 'i').test(name)
    ? name
    : null;
}

function versionRange(value) {
  return typeof value === 'string' && /^[v0-9xX*<>=~^.| ,+-]{1,100}$/.test(value) ? value : null;
}

function outsideSimpleNpmRange(range, candidate) {
  const declared = /^([~^]?)(\d+\.\d+\.\d+)$/.exec(range ?? '');
  if (!declared || !/^\d+\.\d+\.\d+$/.test(candidate)) return false;
  const [, operator, minimum] = declared;
  const floor = minimum.split('.').map(BigInt);
  const version = candidate.split('.').map(BigInt);
  const firstDifference = floor.findIndex((part, index) => part !== version[index]);
  if (firstDifference === -1) return false;
  if (version[firstDifference] < floor[firstDifference]) return true;
  if (operator === '~') return firstDifference < 2;
  if (operator === '^') {
    const firstNonzero = floor.findIndex((part) => part > 0n);
    return firstNonzero === -1 || firstDifference <= firstNonzero;
  }
  return true;
}

async function readJson(file, limit) {
  try {
    const info = await lstat(file);
    if (info.isFile() && info.size <= limit)
      return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    // A missing or unreadable manifest only limits the update guidance.
  }
}

function npmTarget(packages, from, name) {
  for (let dir = from; ; dir = path.posix.dirname(dir)) {
    const candidate = (dir && dir !== '.' ? `${dir}/` : '') + `node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return packages[candidate];
    if (!dir || dir === '.') return undefined;
  }
}

function dependencyEdges(record, sections) {
  return sections.flatMap((section) =>
    Object.entries(record?.[section] ?? {})
      .filter(([, spec]) => typeof spec === 'string')
      .map(([name, spec]) => ({ name, section, range: versionRange(spec) })),
  );
}

function locationKey(location) {
  return (
    location.length <= 4096 &&
    !/[\\:\p{Cc}\p{Cf}]/u.test(location) &&
    (!location || location.split('/').every((part) => part && part !== '.' && part !== '..'))
  );
}

function npmRelations(lock, manifest) {
  const packages = lock?.packages;
  if (!packages || typeof packages !== 'object') return;
  const edges = [];
  for (const [location, entry] of Object.entries(packages)) {
    if (!locationKey(location) || !entry || entry.link) continue;
    const installed = /(?:^|\/)node_modules\//.test(location);
    const parent =
      installed &&
      packageName(
        location
          .split('/node_modules/')
          .at(-1)
          .replace(/^node_modules\//, ''),
        'npm',
      );
    if (installed && !parent) continue;
    const source = location === '' ? manifest : entry;
    for (const edge of dependencyEdges(source, installed ? installedSections : jsSections)) {
      if (!packageName(edge.name, 'npm')) continue;
      const target = npmTarget(packages, location, edge.name);
      if (!target?.version || target.link || (target.name && target.name !== edge.name)) continue;
      edges.push({
        ...edge,
        version: target.version,
        ...(parent
          ? { parent }
          : { importer: location ? `${location}/package.json` : 'package.json' }),
      });
    }
  }
  return edges;
}

function composerRelations(lock) {
  return [
    ...(Array.isArray(lock?.packages) ? lock.packages : []),
    ...(Array.isArray(lock?.['packages-dev']) ? lock['packages-dev'] : []),
  ]
    .filter((entry) => packageName(entry?.name, 'composer'))
    .flatMap((entry) =>
      dependencyEdges(entry, ['require']).map((edge) => ({ ...edge, parent: entry.name })),
    );
}

async function contextFor(root, file, manager) {
  const directory = await realpath(path.dirname(file)).catch(() => null);
  if (!directory) return {};
  const relative = path.relative(root, directory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    return {};
  const composer = manager === 'composer';
  const manifest = await readJson(
    path.join(directory, composer ? 'composer.json' : 'package.json'),
    1024 * 1024,
  );
  const lock = ['npm', 'composer'].includes(manager)
    ? await readJson(path.join(directory, path.basename(file)), 20 * 1024 * 1024)
    : undefined;
  return {
    manifest,
    relations: composer
      ? composerRelations(lock)
      : manager === 'npm'
        ? npmRelations(lock, manifest)
        : undefined,
  };
}

function directUpdateCommand(manager, name, candidate, declarations) {
  if (!name || !/^\d+\.\d+\.\d+$/.test(candidate ?? '') || declarations.length !== 1) return;
  const [declaration] = declarations;
  if (!declaration.range) return;
  const { manifest, section } = declaration;
  if (manager === 'npm' && manifest === 'package.json' && section !== 'peerDependencies') {
    const flag = {
      dependencies: '--save-prod',
      devDependencies: '--save-dev',
      optionalDependencies: '--save-optional',
    }[section];
    return `npm install ${name}@${candidate} ${flag} --save-exact --ignore-scripts --no-audit`;
  }
  if (manager === 'composer')
    return `composer require ${name}:${candidate}${section === 'require-dev' ? ' --dev' : ''} --no-scripts --no-plugins`;
}

function planFor(findings, manager, context) {
  const { file, package: name, ecosystem, version } = findings[0];
  const safeName = packageName(name, manager);
  const composer = manager === 'composer';
  const manifestFile = composer ? 'composer.json' : 'package.json';
  const matches = (context.relations ?? []).filter(
    (edge) => edge.name === name && (edge.version === undefined || edge.version === version),
  );
  const candidates = [...new Set(findings.flatMap((finding) => finding.fixedVersions))];
  const parents = [
    ...new Map(
      matches
        .filter((edge) => edge.parent)
        .map(({ parent, range }) => [JSON.stringify([parent, range]), { package: parent, range }]),
    ).values(),
  ].map((parent) => {
    const outsideRange =
      manager === 'npm'
        ? candidates.filter((candidate) => outsideSimpleNpmRange(parent.range, candidate))
        : [];
    return outsideRange.length ? { ...parent, outsideRange } : parent;
  });
  const manifestEdges = dependencyEdges(context.manifest, composer ? phpSections : jsSections)
    .filter((edge) => edge.name === name)
    .map((edge) => ({ ...edge, importer: manifestFile }));
  const direct = composer ? manifestEdges : matches.filter((edge) => edge.importer);
  const declarations = (direct.length ? direct : parents.length ? [] : manifestEdges).map(
    ({ importer, section, range }) => ({ manifest: importer, section, range }),
  );
  const kind = direct.length
    ? 'direct'
    : parents.length
      ? 'transitive'
      : declarations.length
        ? 'declared'
        : 'unknown';
  const why = {
    npm: 'npm explain',
    pnpm: 'pnpm why --recursive',
    yarn: 'yarn why',
    composer: 'composer why --tree --locked',
  }[manager];
  const commands = safeName ? [`${why} ${safeName}`] : [];
  const steps = [];
  const hasFix = findings.some((finding) => finding.fixedVersions.length);
  const [candidate] = findings[0].fixedVersions;
  const updateCommand =
    kind === 'direct' &&
    !parents.some((parent) => parent.outsideRange?.includes(candidate)) &&
    findings.every(
      (finding) => finding.fixedVersions.length === 1 && finding.fixedVersions[0] === candidate,
    )
      ? directUpdateCommand(manager, safeName, candidate, declarations)
      : undefined;
  if (!hasFix) {
    steps.push(
      'Cek advisory dan changelog paket. Jika perbaikan belum tersedia, evaluasi mitigasi atau pengganti paket.',
    );
  } else if (kind === 'direct') {
    steps.push(
      'Pilih versi perbaikan yang kompatibel dan perbarui deklarasi di manifest yang tercantum, pada bagian yang sama.',
    );
    if (parents.length)
      steps.push(
        'Cek juga paket induk yang memakai versi yang sama agar salinan transitif ikut diperbaiki.',
      );
  } else if (kind === 'transitive') {
    steps.push(
      'Gunakan perintah penelusuran untuk menemukan dependency langsung yang membawa paket ini. Perbarui paket induk yang sudah menerima versi perbaikan.',
    );
    if (!composer)
      steps.push(
        'Jika induknya belum kompatibel, evaluasi override/resolution terarah dan uji hasilnya.',
      );
  } else {
    steps.push(
      'Telusuri rantai dan workspace pemiliknya. Perbarui deklarasi jika langsung, atau paket induk jika transitif.',
    );
  }
  if (findings.some((finding) => !finding.fixedVersions.length) && hasFix)
    steps.push(
      'Sebagian advisory belum memiliki kandidat fix. Tinjau masing-masing sebelum memilih versi.',
    );
  if (hasFix)
    steps.push(
      `Gunakan ${manager} untuk memperbarui lockfile, uji aplikasi, lalu jalankan scan offline lagi.`,
    );
  return {
    file,
    package: name,
    ecosystem,
    version,
    manager,
    kind,
    declarations,
    parents,
    commands,
    steps,
    ...(updateCommand ? { updateCommand } : {}),
    advisories: findings.map(({ advisoryId, fixedVersions }) => ({ advisoryId, fixedVersions })),
  };
}

export async function dependencyUpdates(root, lockfiles, findings) {
  if (!findings.length) return [];
  const canonicalRoot = await realpath(root).catch(() => null);
  const files = new Map(
    lockfiles.map((file) => [path.relative(root, file).replaceAll('\\', '/'), file]),
  );
  const groups = new Map();
  for (const finding of findings) {
    const key = JSON.stringify([finding.file, finding.ecosystem, finding.package, finding.version]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  const contexts = new Map();
  const updates = [];
  for (const group of groups.values()) {
    const { file } = group[0];
    const lockfile = files.get(file);
    const manager = managers[path.posix.basename(file)];
    if (!lockfile || !manager) continue;
    if (!contexts.has(file))
      contexts.set(file, canonicalRoot ? await contextFor(canonicalRoot, lockfile, manager) : {});
    updates.push(planFor(group, manager, contexts.get(file)));
  }
  return updates;
}
