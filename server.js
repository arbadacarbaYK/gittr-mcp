#!/usr/bin/env node
// gittr-mcp-server.js - MCP Server wrapper for gittr-mcp

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const gittr = require('./index.js');

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
        privkey: { type: 'string', description: '64-char hex private key' },
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
      },
      required: ['name'],
    },
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
    description: 'Star a repository (show appreciation)',
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
    name: 'unstarRepo',
    description: 'Remove a star from a repository',
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
    name: 'listStars',
    description: 'Get repositories a user has starred',
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
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
