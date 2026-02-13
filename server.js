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
    description: 'Push files to git server (NO signing required). Bridge API accepts files without Nostr signing.',
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
