'use strict';

/**
 * Forge issue/PR rows in the same shape the gittr website Issues and Pull
 * Requests tabs show, next to Nostr rows. A GitHub `issue-N` is not glued to
 * a Nostr issue just because the numbers match.
 */

const GITHUB_PAGE = 100;
const GITEA_PAGE = 50;
const MAX_PAGES = 5;

function hostnameOf(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    if (text.startsWith('git@')) {
      const m = text.match(/^git@([^:]+):/);
      return (m && m[1] ? m[1] : '').toLowerCase();
    }
    let href = text;
    if (href.startsWith('git://')) href = href.replace(/^git:\/\//, 'https://');
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    return new URL(href).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function httpsRepoUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    if (text.startsWith('git@')) {
      const m = text.match(/^git@([^:]+):(.+)$/);
      if (!m) return '';
      return `https://${m[1]}/${m[2].replace(/\.git$/i, '')}`;
    }
    let href = text;
    if (href.startsWith('git://')) href = href.replace(/^git:\/\//, 'https://');
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    const url = new URL(href);
    let path = url.pathname || '/';
    path = path.replace(/\/-\/.*$/i, '');
    path = path.replace(/\/src\/(branch|tag|commit)\/.*$/i, '');
    path = path.replace(/\/(tree|blob|commit|commits|raw|issues|pulls|wiki)\/.*$/i, '');
    path = path.replace(/\.git$/i, '').replace(/\/+$/, '');
    return `https://${url.hostname.toLowerCase().replace(/^www\./, '')}${path}`;
  } catch {
    return '';
  }
}

function ownerRepo(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
  } catch {
    return null;
  }
}

function skipHost(host) {
  return (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.includes('gittr.space') ||
    host.includes('ngit.dev') ||
    host.includes('shakespeare') ||
    host.includes('gitnostr.com') ||
    host.includes('danconwaydev.com')
  );
}

/** @returns {{ kind: string, url: string, owner: string, repo: string, origin: string } | null} */
function classifyUpstream(raw) {
  const url = httpsRepoUrl(raw);
  if (!url) return null;
  const host = hostnameOf(url);
  if (skipHost(host)) return null;
  const pair = ownerRepo(url);
  if (!pair || /^npub1/i.test(pair.owner)) return null;
  let kind = 'self-hosted';
  if (host === 'github.com' || host.endsWith('.github.com')) kind = 'github';
  else if (host === 'gitlab.com' || host.endsWith('.gitlab.com') || /(^|\.)gitlab\./i.test(host)) kind = 'gitlab';
  else if (host === 'codeberg.org' || host.endsWith('.codeberg.org')) kind = 'codeberg';
  else if (/(^|\.)gitea\./i.test(host) || /(^|\.)forgejo\./i.test(host) || host.includes('gitea') || host.includes('forgejo')) kind = 'gitea';
  return { kind, url, owner: pair.owner, repo: pair.repo, origin: `https://${host}` };
}

function pickUpstreamSource(parsed) {
  if (!parsed) return '';
  const list = [];
  if (parsed.source) list.push(parsed.source);
  if (parsed.forkedFrom) list.push(parsed.forkedFrom);
  for (const u of parsed.clone || []) list.push(u);
  for (const u of parsed.web || []) list.push(u);
  let selfHosted = '';
  for (const raw of list) {
    const found = classifyUpstream(raw);
    if (!found) continue;
    if (found.kind === 'github' || found.kind === 'codeberg' || found.kind === 'gitea' || found.kind === 'gitlab') {
      return found.url;
    }
    if (!selfHosted && found.kind === 'self-hosted') selfHosted = found.url;
  }
  return selfHosted;
}

function labelsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => (typeof l === 'string' ? l : String((l && l.name) || '')))
    .filter(Boolean);
}

function unixSeconds(iso) {
  if (!iso) return 0;
  const ms = new Date(String(iso)).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function loginOf(it) {
  const user = it && it.user;
  if (!user || typeof user !== 'object') return '';
  return String(user.login || user.username || '');
}

function mapForgeIssue(it, source) {
  const number = String(it.number ?? '');
  const created = unixSeconds(it.created_at);
  const updated = unixSeconds(it.updated_at) || created;
  return {
    id: `issue-${number}`,
    author: loginOf(it),
    created_at: created,
    updated_at: updated,
    subject: String(it.title || ''),
    content: String(it.body || ''),
    labels: labelsOf(it.labels),
    status: it.state === 'closed' ? 'closed' : 'open',
    number,
    html_url: String(it.html_url || ''),
    source,
  };
}

function mapForgePull(it, source) {
  const number = String(it.number ?? '');
  const created = unixSeconds(it.created_at);
  const updated = unixSeconds(it.updated_at) || created;
  let status = 'open';
  if (it.merged_at || it.merged) status = 'merged';
  else if (it.state === 'closed') status = 'closed';
  return {
    id: `pr-${number}`,
    author: loginOf(it),
    created_at: created,
    updated_at: updated,
    subject: String(it.title || ''),
    content: String(it.body || ''),
    labels: labelsOf(it.labels),
    status,
    number,
    html_url: String(it.html_url || ''),
    source,
  };
}

function mapForgeComment(it, source) {
  const idRaw = String(it.id ?? '');
  if (!idRaw) return null;
  const created = unixSeconds(it.created_at);
  const updated = unixSeconds(it.updated_at);
  return {
    id: `${source}-comment-${idRaw}`,
    author: loginOf(it),
    created_at: created,
    content: String(it.body || ''),
    edited: Boolean(updated && created && updated > created),
    url: String(it.html_url || ''),
    source,
  };
}

function isForgeIssueId(id) {
  return /^issue-\d+$/i.test(String(id || '').trim());
}

function isForgePrId(id) {
  return /^pr-\d+$/i.test(String(id || '').trim());
}

function ticketNumber(id) {
  const text = String(id || '').trim();
  const named = text.match(/^(?:issue|pr)-(\d+)$/i);
  if (named) return named[1];
  if (/^\d+$/.test(text)) return text;
  return '';
}

function combineTicketRows(nostrRows, forgeRows) {
  const seen = new Set();
  const out = [];
  for (const row of [...(nostrRows || []), ...(forgeRows || [])]) {
    const id = String(row && row.id ? row.id : '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  out.sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));
  return out;
}

function applyNostrStatus(rows, statusEvents, mode) {
  const latest = new Map();
  for (const ev of statusEvents || []) {
    const eTag = (ev.tags || []).find((t) => t[0] === 'e' && t[1]);
    if (!eTag) continue;
    const root = String(eTag[1]);
    const prev = latest.get(root);
    if (!prev || (ev.created_at || 0) >= (prev.created_at || 0)) latest.set(root, ev);
  }
  return (rows || []).map((row) => {
    const base = {
      ...row,
      source: row.source || 'nostr',
      status: row.status || 'open',
      updated_at: row.updated_at || row.created_at || 0,
    };
    const st = latest.get(row.id);
    if (!st) return base;
    let status = 'open';
    if (st.kind === 1632) status = 'closed';
    else if (st.kind === 1631) status = mode === 'pr' ? 'merged' : 'closed';
    else if (st.kind === 1630 || st.kind === 1633) status = 'open';
    return {
      ...base,
      status,
      updated_at: Math.max(base.updated_at || 0, st.created_at || 0),
    };
  });
}

async function fetchPages(buildUrl, perPage, fetchImpl) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await fetchImpl(buildUrl(page), {
        headers: { Accept: 'application/json', 'User-Agent': 'gittr-space' },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      if (page === 1) return null;
      break;
    }
    if (!res || !res.ok) {
      if (page === 1) return null;
      break;
    }
    let chunk;
    try {
      chunk = await res.json();
    } catch {
      if (page === 1) return null;
      break;
    }
    if (!Array.isArray(chunk)) {
      if (page === 1) return null;
      break;
    }
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < perPage) break;
  }
  return all;
}

function bridgeBase(bridgeUrl) {
  return String(bridgeUrl || 'https://gittr.space').replace(/\/$/, '');
}

async function fetchForgeIssues(sourceUrl, opts = {}) {
  const found = classifyUpstream(sourceUrl);
  if (!found || found.kind === 'gitlab') return [];
  const fetchImpl = opts.fetchImpl || fetch;
  const bridgeUrl = bridgeBase(opts.bridgeUrl);
  if (found.kind === 'github') {
    const list = await fetchPages(
      (page) => {
        const endpoint = `/repos/${found.owner}/${found.repo}/issues?state=all&sort=updated&direction=desc&per_page=${GITHUB_PAGE}&page=${page}`;
        return `${bridgeUrl}/api/github/proxy?endpoint=${encodeURIComponent(endpoint)}`;
      },
      GITHUB_PAGE,
      fetchImpl
    );
    if (!list) return [];
    return list
      .filter((it) => it && typeof it === 'object' && !it.pull_request)
      .map((it) => mapForgeIssue(it, 'github'));
  }
  const source = found.kind === 'codeberg' ? 'codeberg' : 'gitea';
  const list = await fetchPages(
    (page) =>
      `${found.origin}/api/v1/repos/${encodeURIComponent(found.owner)}/${encodeURIComponent(found.repo)}/issues?state=all&type=issues&limit=${GITEA_PAGE}&page=${page}`,
    GITEA_PAGE,
    fetchImpl
  );
  if (!list) return [];
  return list
    .filter((it) => it && typeof it === 'object' && !it.pull_request)
    .map((it) => mapForgeIssue(it, source));
}

async function fetchForgePulls(sourceUrl, opts = {}) {
  const found = classifyUpstream(sourceUrl);
  if (!found || found.kind === 'gitlab') return [];
  const fetchImpl = opts.fetchImpl || fetch;
  const bridgeUrl = bridgeBase(opts.bridgeUrl);
  if (found.kind === 'github') {
    const list = await fetchPages(
      (page) => {
        const endpoint = `/repos/${found.owner}/${found.repo}/pulls?state=all&sort=updated&direction=desc&per_page=${GITHUB_PAGE}&page=${page}`;
        return `${bridgeUrl}/api/github/proxy?endpoint=${encodeURIComponent(endpoint)}`;
      },
      GITHUB_PAGE,
      fetchImpl
    );
    if (!list) return [];
    return list.filter((it) => it && typeof it === 'object').map((it) => mapForgePull(it, 'github'));
  }
  const source = found.kind === 'codeberg' ? 'codeberg' : 'gitea';
  const list = await fetchPages(
    (page) =>
      `${found.origin}/api/v1/repos/${encodeURIComponent(found.owner)}/${encodeURIComponent(found.repo)}/pulls?state=all&limit=${GITEA_PAGE}&page=${page}`,
    GITEA_PAGE,
    fetchImpl
  );
  if (!list) return [];
  return list.filter((it) => it && typeof it === 'object').map((it) => mapForgePull(it, source));
}

async function fetchForgeIssueByNumber(sourceUrl, number, opts = {}) {
  const found = classifyUpstream(sourceUrl);
  if (!found || found.kind === 'gitlab' || !number) return null;
  const fetchImpl = opts.fetchImpl || fetch;
  const bridgeUrl = bridgeBase(opts.bridgeUrl);
  const wantPr = opts.kind === 'pr';
  let url;
  if (found.kind === 'github') {
    const endpoint = wantPr
      ? `/repos/${found.owner}/${found.repo}/pulls/${number}`
      : `/repos/${found.owner}/${found.repo}/issues/${number}`;
    url = `${bridgeUrl}/api/github/proxy?endpoint=${encodeURIComponent(endpoint)}`;
  } else {
    const path = wantPr ? 'pulls' : 'issues';
    url = `${found.origin}/api/v1/repos/${encodeURIComponent(found.owner)}/${encodeURIComponent(found.repo)}/${path}/${number}`;
  }
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'gittr-space' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;
  let it;
  try {
    it = await res.json();
  } catch {
    return null;
  }
  if (!it || typeof it !== 'object' || it.message) return null;
  const source = found.kind === 'github' ? 'github' : found.kind === 'codeberg' ? 'codeberg' : 'gitea';
  if (wantPr) return mapForgePull(it, source);
  if (it.pull_request) return null;
  return mapForgeIssue(it, source);
}

async function fetchForgeComments(sourceUrl, number, opts = {}) {
  const found = classifyUpstream(sourceUrl);
  if (!found || found.kind === 'gitlab' || !number) return [];
  const fetchImpl = opts.fetchImpl || fetch;
  const bridgeUrl = bridgeBase(opts.bridgeUrl);
  let url;
  if (found.kind === 'github') {
    const endpoint = `/repos/${found.owner}/${found.repo}/issues/${number}/comments?per_page=100&sort=created&direction=asc`;
    url = `${bridgeUrl}/api/github/proxy?endpoint=${encodeURIComponent(endpoint)}`;
  } else {
    url = `${found.origin}/api/v1/repos/${encodeURIComponent(found.owner)}/${encodeURIComponent(found.repo)}/issues/${number}/comments`;
  }
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'gittr-space' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return [];
  }
  if (!res || !res.ok) return [];
  let list;
  try {
    list = await res.json();
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const source = found.kind === 'github' ? 'github' : found.kind === 'codeberg' ? 'codeberg' : 'gitea';
  return list.map((it) => mapForgeComment(it, source)).filter(Boolean);
}

module.exports = {
  classifyUpstream,
  pickUpstreamSource,
  combineTicketRows,
  applyNostrStatus,
  isForgeIssueId,
  isForgePrId,
  ticketNumber,
  fetchForgeIssues,
  fetchForgePulls,
  fetchForgeIssueByNumber,
  fetchForgeComments,
  mapForgeIssue,
  mapForgePull,
  mapForgeComment,
};
