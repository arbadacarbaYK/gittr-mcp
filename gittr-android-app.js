'use strict';

/**
 * Official gittr Android listing helpers (port of gittr ui/src/lib/repo/gittr-android-app.ts).
 * Third-party announce still uses space.gittr.<repo-slug>.
 */

const GITTR_OWNER_PUBKEY_HEX =
  '9a83779e75080556c656d4d418d02a4d7edbe288a2f9e6dd2b48799ec935184c';

const GITTR_ANDROID_APP_ID = 'space.gittr.app';
const GITTR_ANDROID_REPO_SLUG = 'gittr';
const GITTR_ANDROID_ICON_URL = 'https://gittr.space/android-chrome-512x512.png';
const GITTR_ANDROID_SCREENSHOT_URLS = [
  'https://gittr.space/zapstore/home.png',
  'https://gittr.space/zapstore/apps.png',
  'https://gittr.space/zapstore/repo.png',
];
const GITTR_ANDROID_HOMEPAGE_URL = 'https://gittr.space';
const GITTR_ANDROID_SUMMARY =
  'Decentralized and discoverable Nostr gits, apps and pages';
const GITTR_ANDROID_LICENSE = 'AGPL-3.0';
const GITTR_OFFICIAL_APP_TOPICS = ['git', 'nostr', 'bitcoin', 'lightning'];
const ZAPSTORE_SCREENSHOT_MAX = 12;

function normalizeRepoSlug(repo) {
  return (repo || '')
    .replace(/\.git$/i, '')
    .trim()
    .toLowerCase();
}

function isOfficialGittrAndroidRepo(args) {
  const repo = normalizeRepoSlug(args && args.repo);
  const pk = String((args && args.ownerPubkeyHex) || '')
    .trim()
    .toLowerCase();
  return repo === GITTR_ANDROID_REPO_SLUG && pk === GITTR_OWNER_PUBKEY_HEX;
}

function normalizeHttpsUrl(raw) {
  const t = String(raw || '').trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    if (u.username || u.password) return undefined;
    const host = u.hostname.toLowerCase();
    if (host === 'cdn.zap.store' || host === 'zap.store') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function summaryForNip82Announce(args) {
  const raw = String((args && args.repoSummary) || '').trim().slice(0, 280);
  if (!isOfficialGittrAndroidRepo(args)) return raw;
  if (!raw || /^host your git repositories on nostr/i.test(raw)) {
    return GITTR_ANDROID_SUMMARY;
  }
  return raw;
}

function iconUrlForNip82Announce(args) {
  if (isOfficialGittrAndroidRepo(args)) return GITTR_ANDROID_ICON_URL;
  return (
    normalizeHttpsUrl(args && args.iconUrl) ||
    normalizeHttpsUrl(args && args.yamlIconUrl)
  );
}

function screenshotUrlsForNip82Announce(args) {
  const extras = [];
  for (const raw of (args && args.extraScreenshotUrls) || []) {
    const u = normalizeHttpsUrl(raw);
    if (u) extras.push(u);
  }
  const yaml = [];
  for (const raw of (args && args.yamlScreenshots) || []) {
    const u = normalizeHttpsUrl(raw);
    if (u) yaml.push(u);
  }
  const base = isOfficialGittrAndroidRepo(args)
    ? [...GITTR_ANDROID_SCREENSHOT_URLS]
    : yaml;
  const out = [];
  const seen = new Set();
  for (const u of [...base, ...extras]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= ZAPSTORE_SCREENSHOT_MAX) break;
  }
  return out;
}

function topicsForNip82Announce(args) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  for (const t of (args && args.topics) || []) push(t);
  if (isOfficialGittrAndroidRepo(args)) {
    for (const t of GITTR_OFFICIAL_APP_TOPICS) push(t);
  }
  return out;
}

module.exports = {
  GITTR_OWNER_PUBKEY_HEX,
  GITTR_ANDROID_APP_ID,
  GITTR_ANDROID_REPO_SLUG,
  GITTR_ANDROID_ICON_URL,
  GITTR_ANDROID_SCREENSHOT_URLS,
  GITTR_ANDROID_HOMEPAGE_URL,
  GITTR_ANDROID_SUMMARY,
  GITTR_ANDROID_LICENSE,
  GITTR_OFFICIAL_APP_TOPICS,
  ZAPSTORE_SCREENSHOT_MAX,
  isOfficialGittrAndroidRepo,
  normalizeHttpsUrl,
  summaryForNip82Announce,
  iconUrlForNip82Announce,
  screenshotUrlsForNip82Announce,
  topicsForNip82Announce,
};
