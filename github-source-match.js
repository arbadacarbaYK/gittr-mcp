/**
 * Exact upstream forge URL matching for kind 30617 reverse lookup.
 * GitHub was the first case — same tool covers GitLab, Codeberg, Gitea, etc.
 * No fuzzy slug/name matching (import renames would false-positive).
 *
 * Canonical key: lowercase "host/owner/.../repo" (www. stripped, .git stripped,
 * UI suffixes like /tree/main removed). GRASP / gittr clone hosts are skipped
 * (those are Nostr-side mirrors, not the unreachable forge).
 */

'use strict';

/** Hosts that serve Nostr-git / GRASP clones — not upstream forges for reverse lookup. */
const NOSTR_GIT_HOSTS = new Set([
  'relay.gittr.space',
  'git.gittr.space',
  'relay.ngit.dev',
  'ngit-relay.nostrver.se',
  'gitnostr.com',
  'ngit.danconwaydev.com',
  'git.shakespeare.diy',
  'git-01.uid.ovh',
  'git-02.uid.ovh',
  'git.jb55.com',
  'pages.gittr.space',
  'blossom.gittr.space',
]);

const UI_CUT_MARKERS = [
  '/-/', // GitLab UI
  '/tree/',
  '/blob/',
  '/raw/',
  '/src/',
  '/commits/',
  '/commit/',
  '/issues',
  '/pulls',
  '/pull/',
  '/merge_requests',
  '/wiki',
  '/settings',
  '/actions',
  '/releases',
  '/tags',
  '/about',
];

function isNostrGitHost(host) {
  const h = String(host || '')
    .toLowerCase()
    .replace(/^www\./, '');
  if (!h) return false;
  if (NOSTR_GIT_HOSTS.has(h)) return true;
  if (h.endsWith('.pages.gittr.space')) return true;
  return false;
}

/**
 * Normalize any forge / git remote URL into lowercase "host/path/to/repo".
 * Bare "owner/repo" is treated as github.com for shorthand only.
 * @param {unknown} input
 * @returns {string|null}
 */
function normalizeForgeSourceKey(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // git@host:path/to/repo(.git)
  const scp = s.match(/^git@([^:]+):(.+)$/i);
  if (scp) {
    const host = scp[1].toLowerCase().replace(/^www\./, '');
    if (isNostrGitHost(host)) return null;
    let path = scp[2].replace(/\.git$/i, '').replace(/^\/+/, '').replace(/\/+$/, '');
    path = stripUiSuffix(path);
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `${host}/${parts.map((p) => p.toLowerCase()).join('/')}`;
  }

  // bare owner/repo → github.com shorthand (still exact, not fuzzy name)
  if (/^[^/\s]+\/[^/\s]+$/.test(s) && !s.includes(':') && !s.includes('@')) {
    const [owner, repo] = s.split('/');
    if (owner && repo) {
      return `github.com/${owner.toLowerCase()}/${repo.replace(/\.git$/i, '').toLowerCase()}`;
    }
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    s = `https://${s}`;
  }

  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'ssh:') {
    return null;
  }

  let host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || isNostrGitHost(host)) return null;

  let path = url.pathname || '';
  path = path.replace(/\.git$/i, '');
  path = stripUiSuffix(path);
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  // Avoid matching random website paths that aren't repos (single junk segment already rejected)
  const last = parts[parts.length - 1];
  if (!last || last.includes('.')) {
    // allow repo names with dots (my.repo) but reject file-like endings
    if (/\.(md|html?|png|jpe?g|svg|json|txt|pdf)$/i.test(last)) return null;
  }

  return `${host}/${parts.map((p) => p.toLowerCase()).join('/')}`;
}

function stripUiSuffix(path) {
  let p = `/${String(path || '').replace(/^\/+/, '')}`;
  const lower = p.toLowerCase();
  for (const marker of UI_CUT_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx > 0) {
      p = p.slice(0, idx);
      break;
    }
  }
  return p.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** @deprecated use normalizeForgeSourceKey — kept for callers/tests */
function normalizeGithubOwnerRepo(input) {
  const key = normalizeForgeSourceKey(input);
  if (!key) return null;
  if (!key.startsWith('github.com/')) return null;
  return key.slice('github.com/'.length);
}

/**
 * Collect forge source keys from a 30617 event's tags.
 * Prefer source/forkedFrom; also accept non-GRASP forge URLs on clone/web/link.
 * @param {string[][]} tags
 * @returns {Set<string>}
 */
function forgeKeysFrom30617Tags(tags) {
  const keys = new Set();
  if (!Array.isArray(tags)) return keys;

  const preferOrder = ['source', 'forkedFrom', 'clone', 'web', 'link'];
  for (const name of preferOrder) {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag[0] !== name) continue;
      const values =
        name === 'link'
          ? [tag[2]].filter(Boolean)
          : tag.slice(1).filter((v) => v != null && String(v).trim() !== '');
      for (const v of values) {
        const key = normalizeForgeSourceKey(v);
        if (key) keys.add(key);
      }
    }
  }
  return keys;
}

/** @deprecated alias */
function githubKeysFrom30617Tags(tags) {
  return forgeKeysFrom30617Tags(tags);
}

/**
 * @param {string[][]} tags
 * @param {string} wantKey
 * @returns {string[]}
 */
function matchedViaTags(tags, wantKey) {
  const via = [];
  if (!wantKey || !Array.isArray(tags)) return via;
  for (const name of ['source', 'forkedFrom', 'clone', 'web', 'link']) {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag[0] !== name) continue;
      const values =
        name === 'link'
          ? [tag[2]].filter(Boolean)
          : tag.slice(1).filter((v) => v != null && String(v).trim() !== '');
      for (const v of values) {
        if (normalizeForgeSourceKey(v) === wantKey) {
          via.push(name);
          break;
        }
      }
    }
  }
  return [...new Set(via)];
}

module.exports = {
  normalizeForgeSourceKey,
  normalizeGithubOwnerRepo,
  forgeKeysFrom30617Tags,
  githubKeysFrom30617Tags,
  matchedViaTags,
  isNostrGitHost,
  NOSTR_GIT_HOSTS,
};
