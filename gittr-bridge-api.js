'use strict';

/**
 * HTTP helpers for gittr/ngit "bridge" Next.js API routes.
 * See ngit: ui/src/pages/api/nostr/repo/* and ui/src/pages/api/bounty/*
 */

const config = require('./config');
const { normalizeOwnerPubkeyHexSync } = require('./gittr-keys');

const MIN_REQUEST_GAP_MS = Number(process.env.GITTR_MCP_MIN_REQUEST_GAP_MS || 250);
const REQUEST_TIMEOUT_MS = Number(process.env.GITTR_MCP_REQUEST_TIMEOUT_MS || 12000);
const MAX_RETRIES = Number(process.env.GITTR_MCP_MAX_RETRIES || 1);
let lastRequestAt = 0;

function baseUrl() {
  return (config.bridgeUrl || 'https://gittr.space').replace(/\/$/, '');
}

function toQuery(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && v !== '') p.set(k, String(v));
  }
  const q = p.toString();
  return q ? `?${q}` : '';
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function guardedFetch(url, init = {}) {
  const now = Date.now();
  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastRequestAt));
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();

  const { timeoutMs: overrideTimeout, ...fetchInit } = init;
  const timeoutMs =
    Number(overrideTimeout) > 0 ? Number(overrideTimeout) : REQUEST_TIMEOUT_MS;

  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...fetchInit, signal: controller.signal });
      if (res.status === 429 && attempt <= MAX_RETRIES) {
        const body = await readJson(res);
        const retryAfterS = Number(body.retry_after || body.retryAfter || 1);
        await sleep(Math.max(300, Math.min(5000, retryAfterS * 1000)));
        continue;
      }
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * GET /api/repo/forge-releases — forge Release + announceable binaries (+ optional sha256).
 * hash=1 streams announceable files (can take up to ~120s). Omit tag → latest; tag= → that Release.
 */
async function fetchForgeReleases(
  { sourceUrl, hash = false, tag } = {},
  bridgeUrl = baseUrl()
) {
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    throw new Error('sourceUrl is required (GitHub/Codeberg/GitLab repo URL).');
  }
  const q = {
    sourceUrl: sourceUrl.trim(),
  };
  if (hash === true || hash === 1 || hash === '1' || hash === 'true') {
    q.hash = '1';
  }
  const tagTrim = tag != null ? String(tag).trim() : '';
  if (tagTrim) q.tag = tagTrim;
  const timeoutMs = q.hash
    ? Number(process.env.GITTR_MCP_FORGE_HASH_TIMEOUT_MS || 120000)
    : REQUEST_TIMEOUT_MS;
  const res = await guardedFetch(
    `${bridgeUrl}/api/repo/forge-releases${toQuery(q)}`,
    { timeoutMs }
  );
  const body = await readJson(res);
  return { httpOk: res.ok, status: res.status, ...body };
}

/** GET /api/repo/forge-release-list — full Releases-tab listing (no MIME gate). */
async function fetchForgeReleaseList({ sourceUrl } = {}, bridgeUrl = baseUrl()) {
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    throw new Error('sourceUrl is required (GitHub/Codeberg/GitLab repo URL).');
  }
  const res = await guardedFetch(
    `${bridgeUrl}/api/repo/forge-release-list${toQuery({ sourceUrl: sourceUrl.trim() })}`
  );
  return { httpOk: res.ok, status: res.status, ...(await readJson(res)) };
}

/**
 * POST /api/repo/forge-release-blossom-pin — stream a hashed forge asset to public Blossom
 * (primal / ditto / haven). Never blossom.gittr.space. Pin failure must not block announce.
 */
async function pinForgeReleaseToBlossom(
  { sourceUrl, tag, downloadUrl, sha256, authEvent } = {},
  bridgeUrl = baseUrl()
) {
  if (!sourceUrl || !downloadUrl) {
    throw new Error('sourceUrl and downloadUrl required to pin a forge Release asset.');
  }
  const timeoutMs = Number(process.env.GITTR_MCP_BLOSSOM_PIN_TIMEOUT_MS || 180000);
  const res = await guardedFetch(`${bridgeUrl}/api/repo/forge-release-blossom-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl,
      tag: tag || undefined,
      downloadUrl,
      sha256,
      authEvent,
    }),
    timeoutMs,
  });
  return { httpOk: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/gittr-pages/blossom-proxy-upload */
async function postGittrPagesBlossomUpload(
  { authEvent, contentBase64, sha256, contentType } = {},
  bridgeUrl = baseUrl()
) {
  const timeoutMs = Number(process.env.GITTR_MCP_PAGES_UPLOAD_TIMEOUT_MS || 120000);
  const res = await guardedFetch(`${bridgeUrl}/api/gittr-pages/blossom-proxy-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authEvent,
      contentBase64,
      sha256,
      contentType,
    }),
    timeoutMs,
  });
  return { httpOk: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/security/audit — OSV.dev via gittr (packages already parsed). */
async function postSecurityAudit({ packages } = {}, bridgeUrl = baseUrl()) {
  const timeoutMs = Number(process.env.GITTR_MCP_AUDIT_TIMEOUT_MS || 60000);
  const res = await guardedFetch(`${bridgeUrl}/api/security/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packages: packages || [] }),
    timeoutMs,
  });
  return { httpOk: res.ok, status: res.status, ...(await readJson(res)) };
}

/** Base64(JSON.stringify(event)) — same encoding as gittr UI (UTF-8 → base64). */
function nostrEventToAuthHeader(event) {
  return Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
}

/**
 * POST /api/nostr/repo/push-policy-sync
 * Upserts RepositoryPushPolicy from a signed kind 30617 (must include `d` and optional `push_cost_sats`).
 */
async function syncRepoPushPolicy(signed30617Event, bridgeUrl = baseUrl()) {
  const header = nostrEventToAuthHeader(signed30617Event);
  const res = await guardedFetch(`${bridgeUrl}/api/nostr/repo/push-policy-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Nostr-Auth-Event': header,
    },
  });
  const body = await readJson(res);
  return { ok: res.ok, status: res.status, ...body };
}

/** GET /api/nostr/repo/exists */
async function bridgeRepoExists(ownerPubkey, repo, bridgeUrl = baseUrl()) {
  const hex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const res = await guardedFetch(
    `${bridgeUrl}/api/nostr/repo/exists${toQuery({ ownerPubkey: hex, repo })}`
  );
  const body = { ok: res.ok, status: res.status, ...(await readJson(res)) };
  // Bridge /exists checks DB table "Repository" and can lag behind actual git refs/files.
  // Derive practical existence from refs/files when DB says false.
  if (res.ok && body.exists === false) {
    try {
      const refs = await bridgeListRefs({ ownerPubkey: hex, repo }, bridgeUrl);
      if (refs.ok && Array.isArray(refs.refs) && refs.refs.length > 0) {
        return {
          ...body,
          exists: true,
          existsDerived: true,
          existsSource: 'refs',
          refsCount: refs.refs.length,
        };
      }
      const files = await bridgeListFiles({ ownerPubkey: hex, repo, branch: 'main' }, bridgeUrl);
      if (files.ok && Array.isArray(files.files) && files.files.length > 0) {
        return {
          ...body,
          exists: true,
          existsDerived: true,
          existsSource: 'files',
          filesCount: files.files.length,
        };
      }
    } catch (_) {
      // Keep original body on derivation failure
    }
  }
  return body;
}

/** GET /api/nostr/repo/files */
async function bridgeListFiles(
  { ownerPubkey, repo, branch = 'main', includeSizes = true },
  bridgeUrl = baseUrl()
) {
  const hex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const res = await guardedFetch(
    `${bridgeUrl}/api/nostr/repo/files${toQuery({
      ownerPubkey: hex,
      repo,
      branch,
      includeSizes: includeSizes ? '1' : '0',
    })}`
  );
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** GET /api/nostr/repo/file-content */
async function bridgeGetFileContent(
  { ownerPubkey, repo, path: filePath, branch = 'main' },
  bridgeUrl = baseUrl()
) {
  const hex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const res = await guardedFetch(
    `${bridgeUrl}/api/nostr/repo/file-content${toQuery({
      ownerPubkey: hex,
      repo,
      path: filePath,
      branch,
    })}`
  );
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return { ok: res.ok, status: res.status, ...(await readJson(res)) };
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, content: text, contentType: ct };
}

/** GET /api/nostr/repo/refs */
async function bridgeListRefs({ ownerPubkey, repo }, bridgeUrl = baseUrl()) {
  const hex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const res = await guardedFetch(
    `${bridgeUrl}/api/nostr/repo/refs${toQuery({ ownerPubkey: hex, repo })}`
  );
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** GET /api/nostr/repo/commits */
async function bridgeListCommits(
  { ownerPubkey, repo, branch = 'main', limit = 50 },
  bridgeUrl = baseUrl()
) {
  const hex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const res = await guardedFetch(
    `${bridgeUrl}/api/nostr/repo/commits${toQuery({
      ownerPubkey: hex,
      repo,
      branch,
      limit: String(limit),
    })}`
  );
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/**
 * POST /api/nostr/repo/clone — import from HTTPS/Git URL onto bridge disk.
 * Body: { cloneUrl, ownerPubkey, repo }
 */
async function bridgeImportRepo(
  { cloneUrl, ownerPubkey, repo },
  bridgeUrl = baseUrl()
) {
  const res = await guardedFetch(`${bridgeUrl}/api/nostr/repo/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cloneUrl, ownerPubkey, repo }),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/**
 * GET /api/nostr/repo/push-payment?ownerPubkey=&repo=&payerPubkey=
 * Optional headers for owner wallet verification: x-owner-lnbits-url, x-owner-lnbits-read-key, x-owner-blink-api-key
 */
async function getPushPaywallStatus(
  {
    ownerPubkey,
    repo,
    payerPubkey,
    ownerLnbitsUrl,
    ownerLnbitsReadKey,
    ownerBlinkApiKey,
  },
  bridgeUrl = baseUrl()
) {
  const ownerHex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const payerHex = payerPubkey
    ? normalizeOwnerPubkeyHexSync(payerPubkey) || payerPubkey
    : '';
  const headers = {};
  if (ownerLnbitsUrl) headers['x-owner-lnbits-url'] = ownerLnbitsUrl;
  if (ownerLnbitsReadKey) headers['x-owner-lnbits-read-key'] = ownerLnbitsReadKey;
  if (ownerBlinkApiKey) headers['x-owner-blink-api-key'] = ownerBlinkApiKey;

  const res = await guardedFetch(
    `${bridgeUrl}/api/nostr/repo/push-payment${toQuery({
      ownerPubkey: ownerHex,
      repo,
      payerPubkey: payerHex,
    })}`,
    { headers }
  );
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/**
 * POST /api/nostr/repo/push-payment — action: create_intent (no Nostr auth required).
 * Owner LNbits/Blink fields fund the invoice (repo owner's wallet in Settings → Account).
 */
async function createPushPaywallIntent(
  {
    ownerPubkey,
    repo,
    payerPubkey,
    ownerLnbitsUrl,
    ownerLnbitsInvoiceKey,
    ownerLnbitsAdminKey,
    ownerBlinkApiKey,
  },
  bridgeUrl = baseUrl()
) {
  const ownerHex = normalizeOwnerPubkeyHexSync(ownerPubkey) || ownerPubkey;
  const payerHex = normalizeOwnerPubkeyHexSync(payerPubkey) || payerPubkey;
  const res = await guardedFetch(`${bridgeUrl}/api/nostr/repo/push-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_intent',
      ownerPubkey: ownerHex,
      repo,
      payerPubkey: payerHex,
      ownerLnbitsUrl,
      ownerLnbitsInvoiceKey,
      ownerLnbitsAdminKey,
      ownerBlinkApiKey,
    }),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/bounty/create — LNbits invoice for bounty escrow (admin key). */
async function bountyCreateInvoice(
  { issueId, amount, description, lnbitsUrl, lnbitsAdminKey },
  bridgeUrl = baseUrl()
) {
  const url = lnbitsUrl || process.env.GITTR_LNBITS_URL || '';
  const key = lnbitsAdminKey || process.env.GITTR_LNBITS_ADMIN_KEY || '';
  const res = await guardedFetch(`${bridgeUrl}/api/bounty/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      issueId,
      amount,
      description,
      lnbitsUrl: url,
      lnbitsAdminKey: key,
    }),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/bounty/release */
async function bountyRelease(body, bridgeUrl = baseUrl()) {
  const res = await guardedFetch(`${bridgeUrl}/api/bounty/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      lnbitsUrl: body.lnbitsUrl || process.env.GITTR_LNBITS_URL,
      lnbitsAdminKey: body.lnbitsAdminKey || process.env.GITTR_LNBITS_ADMIN_KEY,
    }),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/bounty/create-withdraw */
async function bountyCreateWithdraw(body, bridgeUrl = baseUrl()) {
  const res = await guardedFetch(`${bridgeUrl}/api/bounty/create-withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      lnbitsUrl: body.lnbitsUrl || process.env.GITTR_LNBITS_URL,
      lnbitsAdminKey: body.lnbitsAdminKey || process.env.GITTR_LNBITS_ADMIN_KEY,
      lnbitsInvoiceKey: body.lnbitsInvoiceKey || process.env.GITTR_LNBITS_INVOICE_KEY,
    }),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/bounty/claim-withdraw */
async function bountyClaimWithdraw(body, bridgeUrl = baseUrl()) {
  const res = await guardedFetch(`${bridgeUrl}/api/bounty/claim-withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      lnbitsUrl: body.lnbitsUrl || process.env.GITTR_LNBITS_URL,
      lnbitsAdminKey: body.lnbitsAdminKey || process.env.GITTR_LNBITS_ADMIN_KEY,
    }),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

/** POST /api/nostr/repo/event - bridge direct ingest for immediate processing */
async function sendEventToBridge(event, bridgeUrl = baseUrl()) {
  const res = await guardedFetch(`${bridgeUrl}/api/nostr/repo/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return { ok: res.ok, status: res.status, ...(await readJson(res)) };
}

module.exports = {
  baseUrl,
  nostrEventToAuthHeader,
  syncRepoPushPolicy,
  bridgeRepoExists,
  bridgeListFiles,
  bridgeGetFileContent,
  bridgeListRefs,
  bridgeListCommits,
  bridgeImportRepo,
  getPushPaywallStatus,
  createPushPaywallIntent,
  bountyCreateInvoice,
  bountyRelease,
  bountyCreateWithdraw,
  bountyClaimWithdraw,
  sendEventToBridge,
  fetchForgeReleases,
  fetchForgeReleaseList,
  pinForgeReleaseToBlossom,
  postGittrPagesBlossomUpload,
  postSecurityAudit,
};
