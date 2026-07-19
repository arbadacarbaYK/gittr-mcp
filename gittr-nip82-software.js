'use strict';

/**
 * NIP-82 (Zapstore-compatible) software catalog helpers for MCP.
 * Port of gittr ui/src/lib/nostr/publish-software-announce.ts builders.
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

function relaysForSoftwareCatalog(extraRelays) {
  const out = [...SOFTWARE_CATALOG_RELAYS];
  for (const r of extraRelays || []) {
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

/**
 * Build unsigned NIP-82 events. Asset requires sha256 (`x`) — fetch forge-releases with hash=1 first.
 */
function buildSoftwareAnnounceEvents(input) {
  const forge = input.forge;
  if (!forge?.ok || !forge.release) {
    throw new Error('forge must be a successful forge-releases payload (ok: true).');
  }
  const appId = assertValidAppId(input.appId || suggestAppIdFromRepo(forge.repo));
  const version = versionFromTag(forge.release.tag);
  const apk = pickAnnounceApk(forge, input.selectedApkUrl);
  if (!apk.sha256 || !/^[0-9a-f]{64}$/i.test(apk.sha256)) {
    throw new Error(
      'Missing APK sha256. Call fetchForgeReleases with hash:true before publishing.'
    );
  }

  const name = (input.appName || forge.repo || '').trim() || forge.repo;
  const summary = (input.summary || '').trim().slice(0, 280);
  const now = Math.floor(Date.now() / 1000);

  const appTags = [
    ['d', appId],
    ['name', name],
    ['repository', forge.repositoryUrl],
    ['f', 'android-arm64-v8a'],
    ['t', 'android'],
  ];
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

  const assetTags = [
    ['i', appId],
    ['x', apk.sha256.toLowerCase()],
    ['m', MIME_ANDROID_APK],
    ['url', apk.downloadUrl],
    ['version', version],
    ['f', 'android-arm64-v8a'],
  ];
  if (apk.size > 0) assetTags.push(['size', String(apk.size)]);

  const asset = {
    kind: KIND_SOFTWARE_ASSET,
    created_at: now,
    content: '',
    tags: assetTags,
  };

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

  return { app, asset, release, version, appId, apk };
}

module.exports = {
  KIND_SOFTWARE_APPLICATION,
  KIND_SOFTWARE_RELEASE,
  KIND_SOFTWARE_ASSET,
  MIME_ANDROID_APK,
  RELAY_ZAPSTORE,
  SOFTWARE_CATALOG_RELAYS,
  suggestAppIdFromRepo,
  versionFromTag,
  pickAnnounceApk,
  relaysForSoftwareCatalog,
  buildSoftwareAnnounceEvents,
};
