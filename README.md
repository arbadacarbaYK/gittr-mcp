# gittr-mcp

**Model Context Protocol (MCP) for gittr.space** - Enables AI agents to interact with decentralized Git on Nostr.

## Features

- 🔍 **Discover repositories** from Nostr relays (NIP-34 compliant)
- 🔎 **Search repos** by keyword, owner, or topic
- 📝 **Create issues and PRs** with proper NIP-34 event structure
- 📤 **Push code changes** using only owner's public key (no private key needed!)
- ⚡ **Lightning bounties** (kind 9806 events on Nostr)
- 🔐 **GRASP server detection** for dual-function git+relay servers

## Installation

```bash
npm install
```

## Quick Start

```javascript
const gittr = require('./gittr-nostr.js');
const config = require('./config.js');

// Discover repositories
const repos = await gittr.listRepos({ limit: 100 });
console.log(`Found ${repos.length} repos`);

// Search by keyword
const bitcoinRepos = await gittr.listRepos({ 
  search: 'bitcoin', 
  limit: 20 
});

// List issues
const issues = await gittr.listIssues({ limit: 50 });

// Create issue (requires private key)
const issue = await gittr.createIssue(
  myPrivateKey,
  'repo-name',
  'owner-pubkey',
  'Issue title',
  'Issue description...'
);
```

See [AGENT-QUICKSTART.md](AGENT-QUICKSTART.md) for detailed examples.

## Configuration

Edit `config.js` to customize Nostr relays and bridge URL:

```javascript
module.exports = {
  relays: [
    'wss://relay.ngit.dev',  // Primary GRASP server
    'wss://git.shakespeare.diy',
    // ... more relays
  ],
  bridgeUrl: 'https://git.gittr.space'
};
```

## Documentation

- **[AGENT-QUICKSTART.md](AGENT-QUICKSTART.md)** - 5-minute agent guide with examples
- **[ARCHITECTURE-DEEP-DIVE.md](ARCHITECTURE-DEEP-DIVE.md)** - System architecture
- **[NIP34-SCHEMAS.md](NIP34-SCHEMAS.md)** - Event schemas

## Testing

Production test suite validates all functionality:

```bash
node test-gittr-mcp-production.js
```

## Status

✅ **Production Ready** - All core functionality tested and working.

**Known limitations:**
- Bounty discovery not yet implemented (awaiting real bounties on platform)
- Trust scoring system designed but not active (no historical data yet)
- Repo discovery limited by relay query limits (use batching for 1500+ repos)

## NIP-34 Compliance

This MCP implements [NIP-34](https://nips.nostr.com/34) for git repositories on Nostr:
- **Kind 30617**: Repository announcements
- **Kind 1621**: Issues
- **Kind 1618**: Pull requests
- **Kind 1617**: Patches
- **Kind 9806**: Bounties (custom)

## License

MIT

## Links

- **GitHub**: https://github.com/arbadacarbaYK/gittr-mcp
- **gittr.space**: https://gittr.space
- **Nostr relays**: See config.js for current list
