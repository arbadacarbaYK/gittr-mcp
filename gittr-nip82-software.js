'use strict';

/**
 * NIP-82 (Zapstore-compatible) software catalog helpers for MCP.
 * Port of gittr ui/src/lib/nostr/software-announce-build.ts + forge-releases MIME gates.
 * Primary asset can be any hashed NIP-82 MIME file. Prefer APK when present.
 */

const KIND_SOFTWARE_APPLICATION = 32267;
const KIND_SOFTWARE_RELEASE = 30063;
const KIND_SOFTWARE_ASSET = 3063;
const MIME_ANDROID_APK = 'application/vnd.android.package-archive';
const RELAY_ZAPSTORE = 'wss://relay.zapstore.dev';
const SOFTWARE_CATALOG_RELAYS = [
  RELAY_ZAPSTORE,
  'wss://relay.damus.io',
  'wss://nos.lol',
];

const NGIT_BLOSSOM_ORIGINS = [
  'https://blossom.primal.net',
  'https://blossom.ditto.pub',
  'https://haven.danconwaydev.com',
];

function suggestAppIdFromRepo(repo) {
  const slug = (repo || 'app')
    .replace(/\.git$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
  return `space.gittr.${slug || 'app'}`;
}

function versionFromTag(tag) {
  const t = (tag || '').trim();
  if (!t) return '0.0.0';
  return t.startsWith('v') || t.startsWith('V') ? t.slice(1) : t;
}

function assertValidAppId(appId) {
  const id = (appId || '').trim();
  if (!id || id.length > 200) {
    throw new Error('Enter a package id (e.g. com.example.app).');
  }
  if (/\s/.test(id)) {
    throw new Error('Package id cannot contain spaces.');
  }
  return id;
}

function isApkAssetName(name, contentType) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.apk')) return true;
  const ct = (contentType || '').toLowerCase();
  return (
    ct === 'application/vnd.android.package-archive' ||
    ct.includes('android.package')
  );
}

function looksLikeSourceArchiveName(n) {
  const base = n.replace(/\.(tar\.(gz|xz|bz2)|tgz)$/i, '');
  return /(^|[._-])(src|source|sources)([._-]|$)/i.test(base);
}

function linuxPlatformFromAssetName(n) {
  return /aarch64|arm64/.test(n) ? 'linux-arm64' : 'linux-amd64';
}

/** NIP-82 MIME (+ optional f). Null for zips/checksums/source tarballs. */
function nip82MimeForAssetName(name) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.apk')) {
    return {
      mime: MIME_ANDROID_APK,
      f: /arm64|aarch64/i.test(n) ? 'android-arm64-v8a' : undefined,
    };
  }
  if (n.endsWith('.ipa')) {
    return { mime: 'application/vnd.apple.ipa', f: 'ios-arm64' };
  }
  if (n.endsWith('.dmg')) {
    return {
      mime: 'application/x-apple-diskimage',
      f: /arm64|aarch64/i.test(n) ? 'darwin-arm64' : 'darwin-amd64',
    };
  }
  if (n.endsWith('.appimage')) {
    return {
      mime: 'application/vnd.appimage',
      f: /arm64|aarch64/i.test(n) ? 'linux-arm64' : 'linux-amd64',
    };
  }
  if (n.endsWith('.msi') || n.endsWith('.exe')) {
    return {
      mime: 'application/vnd.microsoft.portable-executable',
      f: 'windows-amd64',
    };
  }
  if (n.endsWith('.deb')) {
    return {
      mime: 'application/vnd.debian.binary-package',
      f: linuxPlatformFromAssetName(n),
    };
  }
  if (
    (n.endsWith('.tar.gz') || n.endsWith('.tgz') || n.endsWith('.tar.xz')) &&
    !looksLikeSourceArchiveName(n)
  ) {
    return {
      mime: n.endsWith('.tar.xz') ? 'application/x-xz' : 'application/gzip',
      f: linuxPlatformFromAssetName(n),
    };
  }
  return null;
}

function announceableForgeAssets(assets) {
  return (assets || []).filter((a) => Boolean(nip82MimeForAssetName(a.name)));
}

function isApkFile(file) {
  return isApkAssetName(file.name, file.contentType);
}

function pickAnnouncePrimaryAsset(forge, selectedUrl) {
  const all = announceableForgeAssets(forge?.release?.assets);
  if (all.length === 0) {
    throw new Error('No announceable binaries on this release.');
  }
  if (selectedUrl) {
    const hit = all.find((a) => a.downloadUrl === selectedUrl);
    if (hit) return hit;
  }
  const apks = all.filter((a) => isApkFile(a));
  if (apks.length > 0) {
    const arm64 = apks.find((a) => /arm64|aarch64/i.test(a.name || ''));
    return arm64 || apks[0];
  }
  return all[0];
}

function pickAnnounceApk(forge, selectedApkUrl) {
  const apks = forge?.release?.apkAssets || [];
  if (apks.length === 0) {
    throw new Error('No APK assets on this release.');
  }
  if (selectedApkUrl) {
    const hit = apks.find((a) => a.downloadUrl === selectedApkUrl);
    if (hit) return hit;
  }
  const arm64 = apks.find((a) => /arm64|aarch64/i.test(a.name || ''));
  const picked = arm64 || apks[0];
  if (!picked) {
    throw new Error('No APK assets on this release.');
  }
  return picked;
}

function isSameApkFamily(a, primary) {
  return isApkFile(a) && isApkFile(primary);
}

function pickSiblingNip82Assets(forge, primary) {
  const out = [];
  for (const a of forge?.release?.assets || []) {
    if (a.downloadUrl === primary.downloadUrl) continue;
    if (isSameApkFamily(a, primary)) continue;
    if (!nip82MimeForAssetName(a.name)) continue;
    if (!a.sha256 || !/^[0-9a-f]{64}$/i.test(a.sha256)) continue;
    out.push(a);
  }
  return out;
}

function hostnameOf(originOrUrl) {
  try {
    return new URL(originOrUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function ngitBlossomHostnames() {
  return NGIT_BLOSSOM_ORIGINS.map((o) => hostnameOf(o)).filter(Boolean);
}

function isGittrBlossomHostname(hostname) {
  const h = (hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'blossom.gittr.space') return true;
  if (h.includes('blossom') && h.endsWith('.gittr.space')) return true;
  return false;
}

/** Kind 3063 url may only rewrite to allowlisted public Blossom HTTPS blobs. */
function allowedNip82BlossomAssetUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.search || parsed.hash) return null;
  const host = parsed.hostname.toLowerCase();
  if (isGittrBlossomHostname(host)) return null;
  if (!ngitBlossomHostnames().includes(host)) return null;
  if (!/^\/[0-9a-f]{64}(?:\.[a-z0-9]{1,12})?$/i.test(parsed.pathname)) {
    return null;
  }
  return `https://${host}${parsed.pathname.toLowerCase()}`;
}

function relaysForSoftwareCatalog(extraRelays) {
  const out = [...SOFTWARE_CATALOG_RELAYS];
  for (const r of extraRelays || []) {
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

function buildAssetEvent(appId, version, file, now, urlOverride) {
  const nip = nip82MimeForAssetName(file.name);
  if (!nip) {
    throw new Error(`Cannot announce ${file.name}: unknown binary type.`);
  }
  const url = (urlOverride || file.downloadUrl || '').trim();
  const tags = [
    ['i', appId],
    ['x', String(file.sha256).toLowerCase()],
    ['m', nip.mime],
    ['url', url],
    ['version', version],
  ];
  if (nip.f) tags.push(['f', nip.f]);
  if (file.size > 0) tags.push(['size', String(file.size)]);
  return {
    kind: KIND_SOFTWARE_ASSET,
    created_at: now,
    content: '',
    tags,
  };
}

/**
 * Build unsigned NIP-82 events. Primary asset requires sha256 (`x`).
 * `t=android` only when an APK is in the published set.
 */
function buildSoftwareAnnounceEvents(input) {
  const forge = input.forge;
  if (!forge?.ok || !forge.release) {
    throw new Error('forge must be a successful forge-releases payload (ok: true).');
  }
  const appId = assertValidAppId(
    input.appId || suggestAppIdFromRepo(forge.repo)
  );
  const version = versionFromTag(forge.release.tag);
  const selectedUrl = input.selectedAssetUrl || input.selectedApkUrl;
  const primary = pickAnnouncePrimaryAsset(forge, selectedUrl);
  if (!primary.sha256 || !/^[0-9a-f]{64}$/i.test(primary.sha256)) {
    throw new Error(
      'Missing file sha256. Call fetchForgeReleases with hash:true before publishing.'
    );
  }

  const includeSiblings = input.includeSiblingAssets !== false;
  const extraAssetFiles = includeSiblings
    ? pickSiblingNip82Assets(forge, primary)
    : [];

  const name = (input.appName || forge.repo || '').trim() || forge.repo;
  const summary = (input.summary || '').trim().slice(0, 280);
  const now = Math.floor(Date.now() / 1000);

  const published = [primary, ...extraAssetFiles];
  const hasApk = published.some((f) => isApkFile(f));

  const platformFs = new Set();
  for (const file of published) {
    const nip = nip82MimeForAssetName(file.name);
    if (nip?.f) platformFs.add(nip.f);
  }
  if (hasApk && ![...platformFs].some((f) => f.startsWith('android-'))) {
    platformFs.add('android-arm64-v8a');
  }

  const appTags = [
    ['d', appId],
    ['name', name],
    ['repository', forge.repositoryUrl],
  ];
  if (hasApk) appTags.push(['t', 'android']);
  for (const f of platformFs) appTags.push(['f', f]);
  if (summary) appTags.push(['summary', summary]);
  if (input.license?.trim()) appTags.push(['license', input.license.trim()]);
  for (const t of input.topics || []) {
    if (t?.trim()) appTags.push(['t', t.trim()]);
  }
  if (input.nip34Address?.trim()) {
    appTags.push(['a', input.nip34Address.trim(), RELAY_ZAPSTORE]);
  }

  const app = {
    kind: KIND_SOFTWARE_APPLICATION,
    created_at: now,
    content: forge.release.body || summary || name,
    tags: appTags,
  };

  const urlFor = (file) => {
    const raw = input.assetUrlOverrides?.[file.downloadUrl];
    if (!raw) return undefined;
    return allowedNip82BlossomAssetUrl(raw) || undefined;
  };

  const asset = buildAssetEvent(appId, version, primary, now, urlFor(primary));
  const extraAssets = extraAssetFiles.map((f) =>
    buildAssetEvent(appId, version, f, now, urlFor(f))
  );

  const release = {
    kind: KIND_SOFTWARE_RELEASE,
    created_at: now,
    content: forge.release.body || '',
    tags: [
      ['d', `${appId}@${version}`],
      ['i', appId],
      ['version', version],
      ['c', 'main'],
    ],
  };

  return {
    app,
    asset,
    extraAssets,
    release,
    version,
    appId,
    primary,
    apk: primary,
    extraAssetFiles,
  };
}

function hashedAssetsForNgitBlossomPin(forge, selectedUrl) {
  const primary = pickAnnouncePrimaryAsset(forge, selectedUrl);
  const extras = pickSiblingNip82Assets(forge, primary);
  const out = [];
  for (const a of [primary, ...extras]) {
    const sha = (a.sha256 || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) continue;
    out.push({ downloadUrl: a.downloadUrl, sha256: sha, name: a.name });
  }
  return out;
}

function unsignedNgitBlossomUploadAuth({
  pubkeyHex,
  sha256Hex,
  serverHostnames,
  expiresInSeconds,
}) {
  const now = Math.floor(Date.now() / 1000);
  const pubkey = (pubkeyHex || '').trim().toLowerCase();
  const uniq = [
    ...new Set((sha256Hex || []).map((h) => String(h).toLowerCase())),
  ].filter((h) => /^[0-9a-f]{64}$/.test(h));
  uniq.sort();
  const hosts = [
    ...new Set(
      (serverHostnames || [])
        .map((h) => String(h).trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  const tags = [
    ['t', 'upload'],
    ['expiration', String(now + (expiresInSeconds || 15 * 60))],
    ...uniq.map((h) => ['x', h]),
    ...hosts.map((h) => ['server', h]),
  ];
  return {
    kind: 24242,
    created_at: now,
    pubkey,
    tags,
    content:
      uniq.length <= 1
        ? 'gittr: pin forge release to Blossom'
        : `gittr: pin ${uniq.length} forge release files to Blossom`,
  };
}

module.exports = {
  KIND_SOFTWARE_APPLICATION,
  KIND_SOFTWARE_RELEASE,
  KIND_SOFTWARE_ASSET,
  MIME_ANDROID_APK,
  RELAY_ZAPSTORE,
  SOFTWARE_CATALOG_RELAYS,
  NGIT_BLOSSOM_ORIGINS,
  suggestAppIdFromRepo,
  versionFromTag,
  isApkAssetName,
  nip82MimeForAssetName,
  announceableForgeAssets,
  pickAnnounceApk,
  pickAnnouncePrimaryAsset,
  pickSiblingNip82Assets,
  allowedNip82BlossomAssetUrl,
  ngitBlossomHostnames,
  relaysForSoftwareCatalog,
  buildSoftwareAnnounceEvents,
  hashedAssetsForNgitBlossomPin,
  unsignedNgitBlossomUploadAuth,
};
