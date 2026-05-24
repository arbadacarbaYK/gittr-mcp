#!/usr/bin/env node
// gittr-mcp-server.js - MCP Server wrapper for gittr-mcp

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const gittr = require('./index.js');
const { suggestNextStepsForTool } = require('./gittr-agent-outcomes.js');

const server = new Server(
  {
    name: 'gittr-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Build tools list from gittr functions - INCLUDING NEW AGENT FUNCTIONS
const tools = [
  // Core repo operations
  {
    name: 'listRepos',
    description: 'Discover repositories from Nostr relays (NIP-34). Filter by pubkey or search term.',
    inputSchema: {
      type: 'object',
      properties: {
        pubkey: { type: 'string', description: 'Filter by owner pubkey' },
        search: { type: 'string', description: 'Search term' },
        limit: { type: 'number', description: 'Max results (default 100)' },
        relays: { type: 'array', items: { type: 'string' }, description: 'Custom relay URLs' },
      },
    },
  },
  {
    name: 'getRepo',
    description: 'Get a single repository by ID or owner+name',
    inputSchema: {
      type: 'object',
      properties: {
        repoId: { type: 'string', description: 'Repository ID (e.g., "my-repo")' },
        ownerPubkey: { type: 'string', description: 'Owner pubkey (optional, helps find faster)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['repoId'],
    },
  },
  {
    name: 'resolveRepoByNostrId',
    description: 'Resolve repo by Nostr identity (npub or hex) and repo name. Returns cloneUrl (prefer git.gittr.space), cloneUrls, relays for location-agnostic use.',
    inputSchema: {
      type: 'object',
      properties: {
        ownerNpubOrHex: { type: 'string', description: 'Owner as npub (NIP-19) or 64-char hex' },
        repoId: { type: 'string', description: 'Repository name' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerNpubOrHex', 'repoId'],
    },
  },
  {
    name: 'searchRepos',
    description: 'Full-text search across repository names and descriptions',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 50)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['query'],
    },
  },
  {
    name: 'myRepos',
    description: 'List repositories owned by the current user (from .nostr-keys.json)',
    inputSchema: {
      type: 'object',
      properties: {
        relays: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'pushToBridge',
    description: 'Push files to git server (REQUIRES signing with privkey for authenticated push). Bridge API now requires Nostr authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: '64-char hex pubkey' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Branch name (default: main)' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              isBinary: { type: 'boolean' },
            },
          },
          description: 'Array of { path, content } objects',
        },
        commitMessage: { type: 'string', description: 'Commit message' },
        privkey: { type: 'string', description: 'Private key for authentication (auto-loaded from .nostr-keys.json if not provided)' },
      },
      required: ['ownerPubkey', 'repo', 'files'],
    },
  },
  {
    name: 'publishRepoAnnouncement',
    description: 'Publish repository to Nostr (kind 30617) - REQUIRES signing',
    inputSchema: {
      type: 'object',
      properties: {
        repoId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        web: { type: 'array', items: { type: 'string' } },
        clone: { type: 'array', items: { type: 'string' } },
        pushCostSats: { type: 'number', description: 'Optional pay-to-push; then call syncRepoPushPolicy with returned event' },
        privkey: { type: 'string', description: '64-char hex or nsec' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['repoId', 'name', 'privkey', 'relays'],
    },
  },
  {
    name: 'publishRepoState',
    description: 'Publish repository state to Nostr (kind 30618) - REQUIRES signing',
    inputSchema: {
      type: 'object',
      properties: {
        repoId: { type: 'string' },
        refs: { type: 'array', items: { type: 'object' } },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['repoId', 'refs', 'privkey', 'relays'],
    },
  },
  // Agent convenience functions
  {
    name: 'createRepo',
    description: 'CREATE A REPO IN ONE CALL - Push files AND publish to Nostr. Best for agents! Auto-loads credentials from .nostr-keys.json.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repository name (required)' },
        description: { type: 'string', description: 'Repository description' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path (e.g., "README.md")' },
              content: { type: 'string', description: 'File content' },
            },
          },
          description: 'Initial files to push',
        },
        branch: { type: 'string', description: 'Branch name (default: main)' },
        privkey: { type: 'string', description: 'Private key (auto-loaded if .nostr-keys.json exists)' },
        pubkey: { type: 'string', description: 'Public key (auto-derived from privkey)' },
        relays: { type: 'array', items: { type: 'string' } },
        graspServer: { type: 'string', description: 'GRASP server (default: relay.ngit.dev)' },
        pushCostSats: { type: 'number', description: 'Optional pay-to-push cost in sats (synced to bridge + kind 30617 push_cost_sats)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'describeAgentAuth',
    description: 'Show whether Nostr keys are loaded (hex/npub only — never returns private key). Use first in a session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forkRepo',
    description: 'Fork an existing repository',
    inputSchema: {
      type: 'object',
      properties: {
        sourceRepoId: { type: 'string', description: 'Repo to fork' },
        sourceOwnerPubkey: { type: 'string', description: 'Owner of source repo' },
        newRepoName: { type: 'string', description: 'Name for forked repo' },
        newRepoDescription: { type: 'string', description: 'Description for forked repo' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
        graspServer: { type: 'string' },
      },
      required: ['sourceRepoId', 'newRepoName'],
    },
  },
  {
    name: 'mirrorRepo',
    description: 'Mirror a GitHub/GitLab repo to gittr.space',
    inputSchema: {
      type: 'object',
      properties: {
        sourceUrl: { type: 'string', description: 'GitHub or GitLab clone URL' },
        repoName: { type: 'string', description: 'Name for the new repo' },
        description: { type: 'string', description: 'Description' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
        graspServer: { type: 'string' },
      },
      required: ['sourceUrl', 'repoName'],
    },
  },
  {
    name: 'listBounties',
    description: 'Discover open bounties (issues with bounty labels or Lightning funding)',
    inputSchema: {
      type: 'object',
      properties: {
        minAmount: { type: 'number', description: 'Minimum bounty in sats' },
        limit: { type: 'number', description: 'Max results (default 50)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'getFile',
    description: 'Get file content from a repository without cloning',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        filePath: { type: 'string', description: 'Path to file (e.g., "README.md")' },
        branch: { type: 'string', description: 'Branch name (default: main)' },
      },
      required: ['ownerPubkey', 'repoId', 'filePath'],
    },
  },
  {
    name: 'addCollaborator',
    description: 'Add a collaborator to a repository',
    inputSchema: {
      type: 'object',
      properties: {
        repoId: { type: 'string' },
        collaboratorPubkey: { type: 'string', description: 'Collaborator\'s pubkey' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['repoId', 'collaboratorPubkey'],
    },
  },
  // Issue operations
  {
    name: 'listIssues',
    description: 'List issues for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository identifier' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'createIssue',
    description: 'Create an issue - REQUIRES signing',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repoId: { type: 'string' },
        subject: { type: 'string' },
        content: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId', 'subject', 'privkey', 'relays'],
    },
  },
  // PR operations
  {
    name: 'listPRs',
    description: 'List pull requests for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository identifier' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'createPR',
    description: 'Create a pull request - REQUIRES signing',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repoId: { type: 'string' },
        subject: { type: 'string' },
        content: { type: 'string' },
        commitId: { type: 'string' },
        cloneUrls: { type: 'array', items: { type: 'string' } },
        branchName: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId', 'subject', 'commitId', 'branchName', 'privkey', 'relays'],
    },
  },
  {
    name: 'createPRViaGittrCLI',
    description: 'Create PR via gittr CLI - full flow including git push (RECOMMENDED for PRs)',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository (e.g., "npub.../my-repo")' },
        head: { type: 'string', description: 'Head branch' },
        base: { type: 'string', description: 'Base branch (default: main)' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR body' },
        privkey: { type: 'string', description: 'Private key for signing' },
      },
      required: ['repo', 'title', 'privkey'],
    },
  },
  // Utility
  {
    name: 'getPublicKey',
    description: 'Get public key from private key',
    inputSchema: {
      type: 'object',
      properties: {
        privkey: { type: 'string', description: '64-char hex private key' },
      },
      required: ['privkey'],
    },
  },
  {
    name: 'loadCredentials',
    description: 'Load Nostr credentials from .nostr-keys.json (for debugging)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // NEW: gittr.space feature parity
  {
    name: 'submitBounty',
    description: 'Submit work on a bounty (claim it with PR/evidence)',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue ID to claim' },
        prUrl: { type: 'string', description: 'URL to the PR with the work' },
        evidence: { type: 'string', description: 'Evidence/work description' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['issueId', 'prUrl', 'evidence'],
    },
  },
  {
    name: 'starRepo',
    description:
      'Star a repo (NIP-25 kind 7 on the latest kind 30617 event: tags e+k+p, content +). Requires a published repo announcement on relays.',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey (hex or npub)' },
        repoId: { type: 'string', description: 'Repository name / d-tag' },
        repoEventId: { type: 'string', description: 'Optional: specific 30617 event id (skips lookup)' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'unstarRepo',
    description:
      'Unstar a repo (NIP-25 kind 7 on the 30617 event with content "-"). Same tags as starRepo.',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey (hex or npub)' },
        repoId: { type: 'string', description: 'Repository name / d-tag' },
        repoEventId: { type: 'string', description: 'Optional: specific 30617 event id (skips lookup)' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'listStars',
    description:
      'List repos a user starred (kind 7 with #k 30617 and #e pointing at 30617 events; latest reaction per repo wins)',
    inputSchema: {
      type: 'object',
      properties: {
        pubkey: { type: 'string', description: 'User pubkey (auto-detected from credentials)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'watchRepo',
    description: 'Watch a repository for updates (notifications)',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'getTrendingRepos',
    description: 'Get trending/popular repositories',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
        timeRange: { type: 'string', description: 'Time range: day, week, month' },
        relays: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'getRepoContributors',
    description: 'Get contributors to a repository',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'getBranches',
    description: 'Get branches for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'getCommitHistory',
    description: 'Get commit history for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        branch: { type: 'string', description: 'Branch name (default: main)' },
        limit: { type: 'number', description: 'Max commits (default 50)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'createRelease',
    description: 'Create a release (tag a version)',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        version: { type: 'string', description: 'Version (e.g., v1.0.0)' },
        targetCommit: { type: 'string', description: 'Commit SHA to tag' },
        releaseNotes: { type: 'string', description: 'Markdown release notes' },
        privkey: { type: 'string', description: 'Private key (auto-loaded)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId', 'version'],
    },
  },
  {
    name: 'listReleases',
    description: 'List releases for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string', description: 'Repository owner pubkey' },
        repoId: { type: 'string', description: 'Repository ID' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId'],
    },
  },
  {
    name: 'exploreRepos',
    description: 'Explore repositories by category/topic',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category: bitcoin, lightning, nostr, defi, ai, tools, cli, mobile' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        relays: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'updatePullRequest',
    description: 'Publish NIP-34 PR update (kind 1619): new tip commit + clone URLs',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repoId: { type: 'string' },
        pullRequestEventId: { type: 'string' },
        pullRequestAuthor: { type: 'string' },
        currentCommitId: { type: 'string' },
        cloneUrls: { type: 'array', items: { type: 'string' } },
        earliestUniqueCommit: { type: 'string' },
        mergeBase: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['ownerPubkey', 'repoId', 'pullRequestEventId', 'pullRequestAuthor', 'currentCommitId', 'cloneUrls', 'privkey'],
    },
  },
  {
    name: 'publishStatusForRoot',
    description: 'Publish NIP-34 status (1630 open, 1631 merged/applied, 1632 closed, 1633 draft) for an issue, PR, or patch root event',
    inputSchema: {
      type: 'object',
      properties: {
        statusKind: { type: 'number', description: '1630 | 1631 | 1632 | 1633' },
        rootEventId: { type: 'string' },
        ownerPubkey: { type: 'string' },
        rootEventAuthor: { type: 'string' },
        repoId: { type: 'string' },
        content: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
        acceptedRevisionId: { type: 'string' },
        revisionAuthor: { type: 'string' },
        earliestUniqueCommit: { type: 'string' },
        mergeCommitId: { type: 'string' },
      },
      required: ['statusKind', 'rootEventId', 'ownerPubkey', 'rootEventAuthor', 'privkey'],
    },
  },
  {
    name: 'createBountyInvoice',
    description: 'Create Lightning invoice for bounty escrow (POST /api/bounty/create). Use GITTR_LNBITS_* env or pass lnbitsUrl + lnbitsAdminKey. Publish kind 9806 after pay via publishBountyToNostr.',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        amount: { type: 'number' },
        description: { type: 'string' },
        lnbitsUrl: { type: 'string' },
        lnbitsAdminKey: { type: 'string' },
      },
      required: ['issueId', 'amount'],
    },
  },
  {
    name: 'publishBountyToNostr',
    description: 'Publish gittr bounty metadata event (kind 9806)',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        repoEntity: { type: 'string', description: 'Entity string for repo tag (often npub or hex)' },
        repoName: { type: 'string' },
        amount: { type: 'number' },
        status: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
        paymentHash: { type: 'string' },
        invoice: { type: 'string' },
        withdrawId: { type: 'string' },
        lnurl: { type: 'string' },
        withdrawUrl: { type: 'string' },
        claimedBy: { type: 'string' },
      },
      required: ['issueId', 'repoEntity', 'repoName', 'amount', 'privkey'],
    },
  },
  {
    name: 'listBountiesForIssue',
    description: 'List kind 9806 bounty events linked to an issue id',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        limit: { type: 'number' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['issueId'],
    },
  },
  {
    name: 'getIssueById',
    description: 'Fetch single issue event (1621) by id from relays',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['issueId'],
    },
  },
  {
    name: 'getPullRequestById',
    description: 'Fetch single PR event (1618) by id from relays',
    inputSchema: {
      type: 'object',
      properties: {
        prId: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['prId'],
    },
  },
  {
    name: 'closeIssue',
    description: 'Convenience: publish status 1632 (closed) for an issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        ownerPubkey: { type: 'string' },
        repoId: { type: 'string' },
        content: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['issueId', 'ownerPubkey', 'repoId', 'privkey'],
    },
  },
  {
    name: 'reopenIssue',
    description: 'Convenience: publish status 1630 (open) for an issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        ownerPubkey: { type: 'string' },
        repoId: { type: 'string' },
        content: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['issueId', 'ownerPubkey', 'repoId', 'privkey'],
    },
  },
  {
    name: 'markPullRequestMerged',
    description: 'Convenience: publish status 1631 (merged/applied) for a PR root event',
    inputSchema: {
      type: 'object',
      properties: {
        prId: { type: 'string' },
        ownerPubkey: { type: 'string' },
        repoId: { type: 'string' },
        mergeCommitId: { type: 'string' },
        content: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
      },
      required: ['prId', 'ownerPubkey', 'repoId', 'privkey'],
    },
  },
  {
    name: 'mergePullRequest',
    description:
      'Full merge: git clone/fetch with signed HTTPS auth, merge PR head, push to bridge, optional 30618+1631. Signer must be repo owner OR on latest kind 30617 merge_maintainers (if that tag exists) OR on maintainers when merge_maintainers is absent. Requires git on PATH. repoId optional if derivable from PR a-tag.',
    inputSchema: {
      type: 'object',
      properties: {
        prId: { type: 'string', description: 'PR event id (kind 1618)' },
        ownerPubkey: { type: 'string', description: 'Repo owner hex or npub (must match PR a-tag owner)' },
        repoId: { type: 'string', description: 'Repository id/slug (optional if present on PR)' },
        baseBranch: { type: 'string', description: 'Branch to merge into (default main)' },
        mergeMessage: { type: 'string' },
        privkey: { type: 'string' },
        relays: { type: 'array', items: { type: 'string' } },
        skipNostrStatus: { type: 'boolean', description: 'If true, only push to bridge + state, no 1631' },
      },
      required: ['prId', 'ownerPubkey', 'privkey'],
    },
  },
  {
    name: 'importRemoteToBridge',
    description: 'Server-side git clone into bridge: import GitHub/Git URL into owner/repo on gittr (refetch)',
    inputSchema: {
      type: 'object',
      properties: {
        cloneUrl: { type: 'string' },
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['cloneUrl', 'ownerPubkey', 'repo'],
    },
  },
  {
    name: 'bridgeRepoExists',
    description: 'GET /api/nostr/repo/exists — check if repo exists on bridge',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo'],
    },
  },
  {
    name: 'bridgeListFiles',
    description: 'GET /api/nostr/repo/files — list files for branch',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        branch: { type: 'string' },
        includeSizes: { type: 'boolean' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo'],
    },
  },
  {
    name: 'bridgeGetFileContent',
    description: 'GET /api/nostr/repo/file-content — raw file from bridge',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string' },
        branch: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo', 'path'],
    },
  },
  {
    name: 'bridgeListRefs',
    description: 'GET /api/nostr/repo/refs',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo'],
    },
  },
  {
    name: 'bridgeListCommits',
    description: 'GET /api/nostr/repo/commits',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        branch: { type: 'string' },
        limit: { type: 'number' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo'],
    },
  },
  {
    name: 'getPushPaywallStatus',
    description: 'GET /api/nostr/repo/push-payment — push cost and whether payer has paid intent',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        payerPubkey: { type: 'string' },
        ownerLnbitsUrl: { type: 'string' },
        ownerLnbitsReadKey: { type: 'string' },
        ownerBlinkApiKey: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo'],
    },
  },
  {
    name: 'createPushPaywallIntent',
    description: 'POST push-payment action create_intent — invoice for pay-to-push (owner wallet keys in body)',
    inputSchema: {
      type: 'object',
      properties: {
        ownerPubkey: { type: 'string' },
        repo: { type: 'string' },
        payerPubkey: { type: 'string', description: '64-char hex of who will push' },
        ownerLnbitsUrl: { type: 'string' },
        ownerLnbitsInvoiceKey: { type: 'string' },
        ownerLnbitsAdminKey: { type: 'string' },
        ownerBlinkApiKey: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['ownerPubkey', 'repo', 'payerPubkey'],
    },
  },
  {
    name: 'syncRepoPushPolicy',
    description: 'POST /api/nostr/repo/push-policy-sync — upsert push paywall from signed kind 30617 (use announcement event JSON from publishRepoAnnouncement)',
    inputSchema: {
      type: 'object',
      properties: {
        signedAnnouncementEvent: { type: 'object', description: 'Full signed 30617 event {id,sig,...}' },
        bridgeUrl: { type: 'string' },
      },
      required: ['signedAnnouncementEvent'],
    },
  },
  {
    name: 'bountyRelease',
    description: 'POST /api/bounty/release — pay bounty to recipient Lightning address',
    inputSchema: {
      type: 'object',
      properties: {
        bountyId: { type: 'string' },
        recipientPubkey: { type: 'string' },
        bountyAmount: { type: 'number' },
        recipientLud16: { type: 'string' },
        recipientLnurl: { type: 'string' },
        lnbitsUrl: { type: 'string' },
        lnbitsAdminKey: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['bountyId', 'recipientPubkey', 'bountyAmount'],
    },
  },
  {
    name: 'bountyCreateWithdraw',
    description: 'POST /api/bounty/create-withdraw — LNURL-withdraw for bounty flow',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        issueId: { type: 'string' },
        title: { type: 'string' },
        lnbitsUrl: { type: 'string' },
        lnbitsAdminKey: { type: 'string' },
        lnbitsInvoiceKey: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
      required: ['amount', 'issueId'],
    },
  },
  {
    name: 'bountyClaimWithdraw',
    description: 'POST /api/bounty/claim-withdraw — claim withdraw to recipient',
    inputSchema: {
      type: 'object',
      properties: {
        withdrawLinkId: { type: 'string' },
        lnurl: { type: 'string' },
        recipientLud16: { type: 'string' },
        recipientLnurl: { type: 'string' },
        lnbitsUrl: { type: 'string' },
        lnbitsAdminKey: { type: 'string' },
        issueEntity: { type: 'string' },
        issueRepo: { type: 'string' },
        bridgeUrl: { type: 'string' },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    
    switch (name) {
      case 'listRepos':
        result = await gittr.listRepos(args);
        break;
      case 'getRepo':
        result = await gittr.getRepo(args);
        break;
      case 'resolveRepoByNostrId':
        result = await gittr.resolveRepoByNostrId(args.ownerNpubOrHex, args.repoId, args);
        break;
      case 'searchRepos':
        result = await gittr.searchRepos(args.query, args);
        break;
      case 'myRepos':
        result = await gittr.myRepos(args);
        break;
      case 'listIssues':
        result = await gittr.listIssues(args);
        break;
      case 'listPRs':
        result = await gittr.listPRs(args);
        break;
      case 'pushToBridge':
        result = await gittr.pushToBridge(args);
        break;
      case 'publishRepoAnnouncement':
        result = await gittr.publishRepoAnnouncement(args);
        break;
      case 'publishRepoState':
        result = await gittr.publishRepoState(args);
        break;
      case 'createIssue':
        result = await gittr.createIssue(args);
        break;
      case 'createPR':
        result = await gittr.createPR(args);
        break;
      case 'createPRViaGittrCLI':
        result = await gittr.createPRViaGittrCLI(args);
        break;
      case 'createRepo':
        result = await gittr.createRepo(args);
        break;
      case 'forkRepo':
        result = await gittr.forkRepo(args);
        break;
      case 'mirrorRepo':
        result = await gittr.mirrorRepo(args);
        break;
      case 'listBounties':
        result = await gittr.listBounties(args);
        break;
      case 'getFile':
        result = await gittr.getFile(args);
        break;
      case 'addCollaborator':
        result = await gittr.addCollaborator(args);
        break;
      case 'getPublicKey':
        result = { publicKey: gittr.getPublicKey(args.privkey) };
        break;
      case 'loadCredentials':
        result = gittr.loadCredentials();
        // Mask private data
        if (result && result.nsec) {
          result = { ...result, nsec: result.nsec?.substring(0, 8) + '...', secretKey: '[MASKED]' };
        }
        break;
      // NEW: gittr.space feature parity
      case 'submitBounty':
        result = await gittr.submitBounty(args);
        break;
      case 'starRepo':
        result = await gittr.starRepo(args);
        break;
      case 'unstarRepo':
        result = await gittr.unstarRepo(args);
        break;
      case 'listStars':
        result = await gittr.listStars(args);
        break;
      case 'watchRepo':
        result = await gittr.watchRepo(args);
        break;
      case 'getTrendingRepos':
        result = await gittr.getTrendingRepos(args);
        break;
      case 'getRepoContributors':
        result = await gittr.getRepoContributors(args);
        break;
      case 'getBranches':
        result = await gittr.getBranches(args);
        break;
      case 'getCommitHistory':
        result = await gittr.getCommitHistory(args);
        break;
      case 'createRelease':
        result = await gittr.createRelease(args);
        break;
      case 'listReleases':
        result = await gittr.listReleases(args);
        break;
      case 'exploreRepos':
        result = await gittr.exploreRepos(args);
        break;
      case 'describeAgentAuth':
        result = gittr.describeAgentAuth();
        break;
      case 'updatePullRequest':
        result = await gittr.updatePullRequest(args);
        break;
      case 'publishStatusForRoot':
        result = await gittr.publishStatusForRoot(args);
        break;
      case 'createBountyInvoice':
        result = await gittr.createBountyInvoice(args);
        break;
      case 'publishBountyToNostr':
        result = await gittr.publishBountyToNostr(args);
        break;
      case 'listBountiesForIssue':
        result = await gittr.listBountiesForIssue(args);
        break;
      case 'getIssueById':
        result = await gittr.getIssueById(args);
        break;
      case 'getPullRequestById':
        result = await gittr.getPullRequestById(args);
        break;
      case 'closeIssue':
        result = await gittr.closeIssue(args);
        break;
      case 'reopenIssue':
        result = await gittr.reopenIssue(args);
        break;
      case 'markPullRequestMerged':
        result = await gittr.markPullRequestMerged(args);
        break;
      case 'mergePullRequest':
        result = await gittr.mergePullRequest(args);
        break;
      case 'importRemoteToBridge':
        result = await gittr.importRemoteToBridge(args);
        break;
      case 'bridgeRepoExists':
        result = await gittr.bridgeRepoExists(args);
        break;
      case 'bridgeListFiles':
        result = await gittr.bridgeListFiles(args);
        break;
      case 'bridgeGetFileContent':
        result = await gittr.bridgeGetFileContent(args);
        break;
      case 'bridgeListRefs':
        result = await gittr.bridgeListRefs(args);
        break;
      case 'bridgeListCommits':
        result = await gittr.bridgeListCommits(args);
        break;
      case 'getPushPaywallStatus':
        result = await gittr.getPushPaywallStatus(args);
        break;
      case 'createPushPaywallIntent':
        result = await gittr.createPushPaywallIntent(args);
        break;
      case 'syncRepoPushPolicy':
        result = await gittr.syncRepoPushPolicy(args);
        break;
      case 'bountyRelease':
        result = await gittr.bountyRelease(args);
        break;
      case 'bountyCreateWithdraw':
        result = await gittr.bountyCreateWithdraw(args);
        break;
      case 'bountyClaimWithdraw':
        result = await gittr.bountyClaimWithdraw(args);
        break;
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const nextSteps =
      Array.isArray(error.nextSteps) && error.nextSteps.length > 0
        ? error.nextSteps
        : suggestNextStepsForTool(name, error.message);
    const payload = {
      success: false,
      tool: name,
      error: error.message,
      ...(error.reason ? { reason: error.reason } : {}),
      ...(error.verification ? { verification: error.verification } : {}),
      ...(!error.verification && error.relayVerification ? { verification: error.relayVerification } : {}),
      nextSteps,
      hint: 'Use nextSteps to decide retries, different relays, paywall flow, or prerequisite calls. If verification is present, it is the definitive relay poll result (not a guess).',
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
