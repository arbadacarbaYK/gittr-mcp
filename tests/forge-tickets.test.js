'use strict';

const forgeTickets = require('../forge-tickets.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  const github = forgeTickets.classifyUpstream('https://github.com/L3and3r/bitcoin-junioren');
  assert(github && github.kind === 'github' && github.owner === 'L3and3r', 'github source');
  assert(forgeTickets.classifyUpstream('https://gitlab.com/org/repo').kind === 'gitlab', 'gitlab source');
  assert(forgeTickets.classifyUpstream('https://codeberg.org/org/repo').kind === 'codeberg', 'codeberg source');
  assert(forgeTickets.classifyUpstream('https://git.gittr.space/npub1abc/repo.git') === null, 'gittr host is not a forge issue source');

  const picked = forgeTickets.pickUpstreamSource({
    source: 'https://github.com/org/repo',
    clone: ['https://git.gittr.space/abc/repo.git'],
  });
  assert(picked === 'https://github.com/org/repo', 'source tag wins over a gittr clone URL');

  const nostr = { id: 'a'.repeat(64), created_at: 100, subject: 'local', number: '12' };
  const forge = forgeTickets.mapForgeIssue(
    {
      number: 12,
      title: 'From GitHub',
      state: 'open',
      body: 'body',
      created_at: '2020-01-01T00:00:00Z',
      user: { login: 'octo' },
      html_url: 'https://github.com/org/repo/issues/12',
    },
    'github'
  );
  const combined = forgeTickets.combineTicketRows([nostr], [forge]);
  assert(combined.length === 2, 'a Nostr issue is not glued to GitHub issue 12');
  assert(combined.some((row) => row.id === 'issue-12'), 'forge row id is issue-12');
  assert(combined.some((row) => row.id === nostr.id), 'nostr row stays');

  const rows = await forgeTickets.fetchForgeIssues('https://github.com/org/repo', {
    bridgeUrl: 'https://gittr.space',
    fetchImpl: async (url) => {
      const endpoint = decodeURIComponent(url.split('endpoint=')[1] || '');
      assert(url.startsWith('https://gittr.space/api/github/proxy?'), 'issues go through the gittr GitHub proxy');
      assert(endpoint.includes('/repos/org/repo/issues?'), 'GitHub issues endpoint');
      return {
        ok: true,
        json: async () => [
          { number: 1, title: 'real', state: 'closed', user: { login: 'a' }, created_at: '2020-01-02T00:00:00Z', body: 'x' },
          { number: 2, title: 'actually a pr', state: 'open', pull_request: { url: 'x' }, user: { login: 'a' }, created_at: '2020-01-03T00:00:00Z' },
        ],
      };
    },
  });
  assert(rows.length === 1 && rows[0].id === 'issue-1' && rows[0].status === 'closed', 'pull requests are left out of the issue list');

  const gitlab = await forgeTickets.fetchForgeIssues('https://gitlab.com/org/repo', {
    fetchImpl: async () => {
      throw new Error('gitlab must not be fetched');
    },
  });
  assert(gitlab.length === 0, 'GitLab issues are not fetched, same as the website');

  const comments = await forgeTickets.fetchForgeComments('https://github.com/org/repo', '1', {
    bridgeUrl: 'https://gittr.space',
    fetchImpl: async (url) => {
      const endpoint = decodeURIComponent(url.split('endpoint=')[1] || '');
      assert(endpoint.includes('/issues/1/comments'), 'comment endpoint');
      return {
        ok: true,
        json: async () => [
          {
            id: 9,
            body: 'hi',
            user: { login: 'octo' },
            created_at: '2020-01-01T00:00:00Z',
            updated_at: '2020-01-01T00:00:00Z',
            html_url: 'https://github.com/org/repo/issues/1#issuecomment-9',
          },
        ],
      };
    },
  });
  assert(comments.length === 1 && comments[0].source === 'github' && comments[0].content === 'hi', 'github comment text');
  assert(comments[0].id === 'github-comment-9', 'github comment id');

  const closed = forgeTickets.applyNostrStatus(
    [{ id: 'aa'.repeat(32), created_at: 10 }],
    [{ kind: 1632, created_at: 20, tags: [['e', 'aa'.repeat(32)]] }],
    'issue'
  );
  assert(closed[0].status === 'closed' && closed[0].source === 'nostr', 'kind 1632 marks the Nostr issue closed');

  console.log('forge-tickets ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
