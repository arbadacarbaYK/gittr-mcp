'use strict';

/**
 * Definitive HTTPS git "smart" probe (not a guess).
 * GET …/info/refs?service=git-upload-pack must return 200 + git advertisement body.
 */
async function probeGitSmartHttp(cloneUrl, timeoutMs = 8000) {
  if (!cloneUrl || typeof cloneUrl !== 'string') {
    return {
      cloneHttpVerified: false,
      outcome: 'invalid_url',
      status: 0,
      cloneUrl: cloneUrl || '',
      probeUrl: null,
    };
  }
  const trimmed = cloneUrl.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    return {
      cloneHttpVerified: false,
      outcome: 'skipped_non_https',
      status: 0,
      cloneUrl: trimmed,
      probeUrl: null,
      note: 'probeGitSmartHttp only checks HTTPS smart-git; use nostr:// or ssh elsewhere',
    };
  }
  let probeUrl;
  try {
    if (/\.git$/i.test(trimmed)) {
      probeUrl = trimmed.replace(/\.git$/i, '.git/info/refs?service=git-upload-pack');
    } else {
      probeUrl = `${trimmed.replace(/\/$/, '')}/info/refs?service=git-upload-pack`;
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(probeUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: '*/*', 'user-agent': 'gittr-mcp-probe/1' },
    });
    clearTimeout(t);
    const text = await res.text().catch(() => '');
    const isGit =
      res.ok &&
      (text.includes('# service=git-upload-pack') || text.includes('service=git-upload-pack'));
    return {
      cloneHttpVerified: !!isGit,
      outcome: isGit ? 'git_smart_http' : res.ok ? 'unexpected_body' : 'http_error',
      status: res.status,
      cloneUrl: trimmed,
      probeUrl,
    };
  } catch (e) {
    return {
      cloneHttpVerified: false,
      outcome: 'network_error',
      status: 0,
      cloneUrl: trimmed,
      probeUrl: probeUrl || null,
      error: e.name === 'AbortError' ? 'probe_timeout' : e.message,
    };
  }
}

module.exports = { probeGitSmartHttp };
