'use strict';

/**
 * NIP-5A Nostr Pages helpers (kind 35128 + Blossom via gittr proxy).
 * Port of gittr ui/src/lib/gittr-pages/publish-named-site-manifest.ts (thin).
 */

const { createHash } = require('crypto');

const KIND_NSITE_NAMED = 35128;
const KIND_BLOSSOM_SERVER_LIST = 10063;
const KIND_BLOSSOM_AUTH = 24242;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 200;
const DEFAULT_PAGES_BLOSSOM =
  process.env.GITTR_PAGES_BLOSSOM_URL || 'https://blossom.gittr.space';

const SKIP_PATH_PREFIXES = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'target/',
  '__tests__/',
  'coverage/',
];

const STATIC_EXT = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.txt',
  '.md',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.map',
  '.xml',
  '.webmanifest',
  '.wasm',
]);

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

function extOf(filePath) {
  const n = String(filePath || '');
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i).toLowerCase() : '';
}

function normalizeFilePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function toWebPath(filePath) {
  const p = normalizeFilePath(filePath);
  return p.startsWith('/') ? p : `/${p}`;
}

function isGittrPagesManifestPath(filePath) {
  const n = normalizeFilePath(filePath).toLowerCase();
  if (!n) return false;
  for (const p of SKIP_PATH_PREFIXES) {
    if (n.startsWith(p)) return false;
  }
  const ext = extOf(n);
  if (ext && STATIC_EXT.has(ext)) return true;
  return n === 'robots.txt' || n.endsWith('/robots.txt');
}

function contentTypeForPath(filePath) {
  return MIME_BY_EXT[extOf(filePath)] || 'application/octet-stream';
}

function pagesBlossomOrigin() {
  return String(DEFAULT_PAGES_BLOSSOM).replace(/\/$/, '');
}

function pagesBlossomHostname() {
  try {
    return new URL(pagesBlossomOrigin()).hostname.toLowerCase();
  } catch {
    return 'blossom.gittr.space';
  }
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function fileToBuffer(file) {
  const encoding = String(file.encoding || (file.isBinary ? 'base64' : 'utf8')).toLowerCase();
  const content = file.content;
  if (content == null) return null;
  if (Buffer.isBuffer(content)) return content;
  if (encoding === 'base64') {
    try {
      return Buffer.from(String(content).replace(/\s/g, ''), 'base64');
    } catch {
      return null;
    }
  }
  return Buffer.from(String(content), 'utf8');
}

function stagePagesFiles(files) {
  const staged = [];
  for (const file of files || []) {
    const path = normalizeFilePath(file.path);
    if (!isGittrPagesManifestPath(path)) continue;
    const bytes = fileToBuffer(file);
    if (!bytes || bytes.length === 0) continue;
    if (bytes.length > MAX_FILE_BYTES) {
      throw new Error(
        `File too large for Blossom upload: ${path} (${bytes.length} bytes). Max per file is ${MAX_FILE_BYTES}.`
      );
    }
    staged.push({
      path,
      webPath: toWebPath(path),
      bytes,
      sha256: sha256Hex(bytes),
      contentType: contentTypeForPath(path),
    });
    if (staged.length > MAX_FILES) {
      throw new Error(
        `Too many static files for one publish (>${MAX_FILES}). Trim the Pages set.`
      );
    }
  }
  if (staged.length === 0) {
    throw new Error('No uploadable static files (need index.html and allowed static types).');
  }
  if (!staged.some((s) => s.webPath.replace(/\/+/g, '/').toLowerCase() === '/index.html')) {
    throw new Error('index.html is required to publish Nostr Pages.');
  }
  return staged;
}

function unsignedPagesBlossomUploadAuth({
  pubkeyHex,
  sha256Hex: hashes,
  serverHostname,
  expiresInSeconds,
}) {
  const now = Math.floor(Date.now() / 1000);
  const uniq = [...new Set((hashes || []).map((h) => String(h).toLowerCase()))]
    .filter((h) => /^[0-9a-f]{64}$/.test(h))
    .sort();
  const host = String(serverHostname || pagesBlossomHostname()).toLowerCase();
  const n = uniq.length;
  const tags = [
    ['t', 'upload'],
    ['expiration', String(now + (expiresInSeconds || Math.max(900, 60 + n * 20)))],
    ...uniq.map((h) => ['x', h]),
  ];
  if (host) tags.push(['server', host]);
  return {
    kind: KIND_BLOSSOM_AUTH,
    created_at: now,
    pubkey: String(pubkeyHex || '').toLowerCase(),
    tags,
    content:
      n <= 1
        ? 'gittr Pages: Blossom upload (Blossom)'
        : `gittr Pages: Blossom batch upload (${n} blobs)`,
  };
}

function relayTagsForNsiteManifest(relays) {
  const urls = [];
  const seen = new Set();
  for (const raw of relays || []) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const withWs =
      t.startsWith('wss://') || t.startsWith('ws://')
        ? t
        : `wss://${t.replace(/^\/\//, '')}`;
    const key = withWs.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(withWs);
    if (urls.length >= 25) break;
  }
  return urls.map((url) => ['relay', url]);
}

function buildNamedSiteManifestTags({
  dTag,
  uploads,
  title,
  description,
  sourceUrl,
  server,
  relays,
}) {
  const tags = [
    ['d', dTag],
    ...uploads.map((u) => ['path', u.webPath, u.sha256]),
    ['server', server || pagesBlossomOrigin()],
    ['title', String(title || dTag).slice(0, 200)],
  ];
  if (description && String(description).trim()) {
    tags.push(['description', String(description).trim().slice(0, 500)]);
  }
  if (sourceUrl && /^https?:\/\//i.test(String(sourceUrl).trim())) {
    tags.push(['source', String(sourceUrl).trim()]);
  }
  for (const pair of relayTagsForNsiteManifest(relays)) tags.push(pair);
  return tags;
}

module.exports = {
  KIND_NSITE_NAMED,
  KIND_BLOSSOM_SERVER_LIST,
  KIND_BLOSSOM_AUTH,
  MAX_FILE_BYTES,
  MAX_FILES,
  isGittrPagesManifestPath,
  toWebPath,
  normalizeFilePath,
  contentTypeForPath,
  pagesBlossomOrigin,
  pagesBlossomHostname,
  sha256Hex,
  stagePagesFiles,
  unsignedPagesBlossomUploadAuth,
  buildNamedSiteManifestTags,
};
