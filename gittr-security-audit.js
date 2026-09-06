'use strict';

/**
 * Parse lockfiles/manifests into OSV package refs (port of gittr
 * ui/src/lib/security/dependency-manifest-parser.ts).
 */

const MANIFEST_FILENAMES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'requirements.txt',
  'go.mod',
  'cargo.lock',
  'gemfile.lock',
  'composer.lock',
];

function isManifestPath(filePath) {
  const base = (String(filePath || '').split('/').pop() || '').toLowerCase();
  return MANIFEST_FILENAMES.includes(base);
}

function rangeMinVersion(raw) {
  const t = String(raw || '').trim();
  if (!t || t === '*' || t === 'latest') return null;
  if (/[:/@]/.test(t) && !/^[\^~>=<v ]*\d/.test(t)) return null;
  const m = t.match(/(\d+)\.(\d+)\.(\d+)/) || t.match(/(\d+)\.(\d+)/);
  if (!m) return null;
  if (m.length >= 4) return `${m[1]}.${m[2]}.${m[3]}`;
  return `${m[1]}.${m[2]}.0`;
}

function pushUnique(out, pkg) {
  const key = `${pkg.ecosystem}|${pkg.name}|${pkg.version}`;
  if (!out.some((p) => `${p.ecosystem}|${p.name}|${p.version}` === key)) {
    out.push(pkg);
  }
}

function parsePackageJson(content, file) {
  const out = [];
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return out;
  }
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = json?.[section];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, rangeRaw] of Object.entries(deps)) {
      if (typeof rangeRaw !== 'string') continue;
      const version = rangeMinVersion(rangeRaw);
      if (!version) continue;
      pushUnique(out, {
        ecosystem: 'npm',
        name,
        version,
        direct: true,
        precision: 'range-min',
        sourceFile: file,
      });
    }
  }
  return out;
}

function parsePackageLock(content, file) {
  const out = [];
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return out;
  }
  if (json?.packages && typeof json.packages === 'object') {
    const root = json.packages[''] || {};
    const rootDeps = new Set([
      ...Object.keys(root.dependencies || {}),
      ...Object.keys(root.devDependencies || {}),
      ...Object.keys(root.optionalDependencies || {}),
    ]);
    for (const [pkgPath, meta] of Object.entries(json.packages)) {
      if (!pkgPath || !meta?.version) continue;
      const name = pkgPath.replace(/^.*node_modules\//, '');
      if (!name) continue;
      const topLevel = !pkgPath.includes('node_modules/', 1);
      pushUnique(out, {
        ecosystem: 'npm',
        name,
        version: String(meta.version),
        direct: topLevel && rootDeps.has(name),
        precision: 'pinned',
        sourceFile: file,
      });
    }
    return out;
  }
  const walk = (deps) => {
    if (!deps || typeof deps !== 'object') return;
    for (const [name, meta] of Object.entries(deps)) {
      if (meta?.version) {
        pushUnique(out, {
          ecosystem: 'npm',
          name,
          version: String(meta.version),
          direct: false,
          precision: 'pinned',
          sourceFile: file,
        });
      }
      if (meta?.dependencies) walk(meta.dependencies);
    }
  };
  walk(json?.dependencies);
  return out;
}

function parseYarnLock(content, file) {
  const out = [];
  const blocks = String(content).split(/\n(?=\S)/);
  for (const block of blocks) {
    const header = block.split('\n')[0] || '';
    const versionMatch = block.match(/\n\s+version:?\s+"?([^"\n]+)"?/);
    if (!versionMatch) continue;
    const version = versionMatch[1].trim();
    const first = header
      .split(',')[0]
      .trim()
      .replace(/:$/, '')
      .replace(/^"|"$/g, '');
    const at = first.lastIndexOf('@');
    const name = at > 0 ? first.slice(0, at) : first;
    if (!name) continue;
    pushUnique(out, {
      ecosystem: 'npm',
      name,
      version,
      direct: false,
      precision: 'pinned',
      sourceFile: file,
    });
  }
  return out;
}

function parseRequirementsTxt(content, file) {
  const out = [];
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line || line.startsWith('-')) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*==\s*([A-Za-z0-9_.+-]+)/);
    if (!m) continue;
    pushUnique(out, {
      ecosystem: 'PyPI',
      name: m[1].toLowerCase(),
      version: m[2],
      direct: true,
      precision: 'pinned',
      sourceFile: file,
    });
  }
  return out;
}

function parseGoMod(content, file) {
  const out = [];
  const requireRe =
    /^\s*(?:require\s+)?([\w./-]+\.[\w./-]+)\s+v(\d+\.\d+\.\d+[\w.+-]*)/;
  let inBlock = false;
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('require (')) {
      inBlock = true;
      continue;
    }
    if (inBlock && line === ')') {
      inBlock = false;
      continue;
    }
    const m = line.match(requireRe);
    if (!m) continue;
    pushUnique(out, {
      ecosystem: 'Go',
      name: m[1],
      version: m[2],
      direct: !line.includes('// indirect'),
      precision: 'pinned',
      sourceFile: file,
    });
  }
  return out;
}

function parseCargoLock(content, file) {
  const out = [];
  for (const block of String(content).split(/\[\[package\]\]/)) {
    const name = block.match(/\bname\s*=\s*"([^"]+)"/)?.[1];
    const version = block.match(/\bversion\s*=\s*"([^"]+)"/)?.[1];
    if (!name || !version) continue;
    pushUnique(out, {
      ecosystem: 'crates.io',
      name,
      version,
      direct: false,
      precision: 'pinned',
      sourceFile: file,
    });
  }
  return out;
}

function parseGemfileLock(content, file) {
  const out = [];
  let inSpecs = false;
  for (const rawLine of String(content).split(/\r?\n/)) {
    if (/^\s{2}specs:/.test(rawLine)) {
      inSpecs = true;
      continue;
    }
    if (inSpecs && /^\S/.test(rawLine)) inSpecs = false;
    if (!inSpecs) continue;
    const m = rawLine.match(/^\s{4}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/);
    if (!m) continue;
    pushUnique(out, {
      ecosystem: 'RubyGems',
      name: m[1],
      version: m[2],
      direct: false,
      precision: 'pinned',
      sourceFile: file,
    });
  }
  return out;
}

function parseComposerLock(content, file) {
  const out = [];
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return out;
  }
  for (const section of ['packages', 'packages-dev']) {
    const arr = json?.[section];
    if (!Array.isArray(arr)) continue;
    for (const pkg of arr) {
      if (!pkg?.name || !pkg?.version) continue;
      pushUnique(out, {
        ecosystem: 'Packagist',
        name: String(pkg.name),
        version: String(pkg.version).replace(/^v/, ''),
        direct: section === 'packages',
        precision: 'pinned',
        sourceFile: file,
      });
    }
  }
  return out;
}

function parseManifest(filePath, content) {
  const base = (String(filePath).split('/').pop() || '').toLowerCase();
  switch (base) {
    case 'package.json':
      return parsePackageJson(content, filePath);
    case 'package-lock.json':
      return parsePackageLock(content, filePath);
    case 'yarn.lock':
      return parseYarnLock(content, filePath);
    case 'requirements.txt':
      return parseRequirementsTxt(content, filePath);
    case 'go.mod':
      return parseGoMod(content, filePath);
    case 'cargo.lock':
      return parseCargoLock(content, filePath);
    case 'gemfile.lock':
      return parseGemfileLock(content, filePath);
    case 'composer.lock':
      return parseComposerLock(content, filePath);
    default:
      return [];
  }
}

function mergeManifestPackages(groups) {
  const directNames = new Set();
  for (const group of groups) {
    for (const pkg of group) {
      if (pkg.direct) directNames.add(`${pkg.ecosystem}|${pkg.name}`);
    }
  }
  const byKey = new Map();
  for (const group of groups) {
    for (const pkg of group) {
      const key = `${pkg.ecosystem}|${pkg.name}`;
      const existing = byKey.get(key);
      const merged = {
        ...pkg,
        direct: pkg.direct || directNames.has(key),
      };
      if (!existing) {
        byKey.set(key, merged);
        continue;
      }
      if (existing.precision === 'range-min' && merged.precision === 'pinned') {
        byKey.set(key, { ...merged, direct: existing.direct || merged.direct });
      } else {
        existing.direct = existing.direct || merged.direct;
      }
    }
  }
  return [...byKey.values()];
}

function toAuditPayload(packages) {
  return packages.slice(0, 800).map((p) => ({
    ecosystem: p.ecosystem,
    name: p.name,
    version: p.version,
    direct: !!p.direct,
    precision: p.precision === 'pinned' ? 'pinned' : 'range-min',
  }));
}

module.exports = {
  MANIFEST_FILENAMES,
  isManifestPath,
  parseManifest,
  mergeManifestPackages,
  toAuditPayload,
};
