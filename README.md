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
npm install gittr-mcp
```

**Or clone from source:**
```bash
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm install
```

## Quick Start

```javascript
const gittr = require('gittr-mcp');

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

See [docs/AGENT-QUICKSTART.md](docs/AGENT-QUICKSTART.md) for detailed examples.

## Configuration

The MCP uses default Nostr relays and gittr.space bridge. To customize, set environment variables:

```bash
export GITTR_BRIDGE_URL="https://git.gittr.space"
export GITTR_RELAYS="wss://relay.ngit.dev,wss://git.shakespeare.diy"
```

Or pass config when calling functions:

```javascript
const repos = await gittr.listRepos({ 
  relays: ['wss://your-relay.com'],
  limit: 100 
});
```

## Documentation

- **[docs/AGENT-QUICKSTART.md](docs/AGENT-QUICKSTART.md)** - 5-minute agent guide with examples
- **[docs/NIP34-SCHEMAS.md](docs/NIP34-SCHEMAS.md)** - Event schemas
- **[docs/TEST-VALIDATION.md](docs/TEST-VALIDATION.md)** - Test results and validation

## Testing

Run basic validation:

```bash
# Discover repos
node -e "const gittr = require('./gittr-nostr.js'); gittr.listRepos({ limit: 10 }).then(r => console.log('Found', r.length, 'repos'));"

# Search repos
node -e "const gittr = require('./gittr-nostr.js'); gittr.listRepos({ search: 'bitcoin' }).then(r => console.log('Found', r.length, 'repos'));"
```

See [docs/TEST-VALIDATION.md](docs/TEST-VALIDATION.md) for full test results.

## Status

✅ **Production Ready** - All core functionality tested and working.

### 🎯 Early Mover Opportunity: Bounty System

**gittr.space is THE FIRST Nostr git platform to implement Lightning bounties!** 

This MCP includes full bounty support (kind 9806 events):
- ✅ Bounty discovery from Nostr relays
- ✅ Creator reputation tracking
- ✅ Trust scoring for risk assessment
- ✅ Expected value calculations

**Why now is the perfect time:**
- 🚀 Be among the first to claim bounties on Nostr
- 💰 Dual income opportunity: bounties + random repo zaps
- 🏆 Early movers build reputation before competition arrives
- 🔓 No other Nostr git platform has this integrated yet

**Multiple audiences, all benefit:**
- **Devs fixing pleb problems:** Regular users fund bounties for features they need
- **Devs fixing dev problems:** Other developers fund technical improvements
- **Repo owners:** Get better code, attract contributors, earn from zaps
- **Random users:** Zap repos they appreciate (unique to gittr!)

See [gittr.space/bounty-hunt](https://gittr.space/bounty-hunt) for active bounties.

### Known Limitations
- Repo discovery limited by relay query limits (use batching for 1500+ repos)
- Bridge repo sync takes time (repos appear on relays after git push)

## NIP-34 Compliance

This MCP implements [NIP-34](https://nips.nostr.com/34) for git repositories on Nostr:
- **Kind 30617**: Repository announcements
- **Kind 1621**: Issues
- **Kind 1618**: Pull requests
- **Kind 1617**: Patches
- **Kind 9806**: Bounties (custom)

## Support This Project ⚡

If this MCP helps you earn sats, consider zapping the builder:

**Lightning:** `vivaciouscloud391379@getalby.com`

---

## License

MIT

## Links

- **GitHub**: https://github.com/arbadacarbaYK/gittr-mcp
- **gittr.space**: https://gittr.space (by [@arbadacarbaYK](https://github.com/arbadacarbaYK))
- **MCP built by**: SatOpsHQ ⚡ `vivaciouscloud391379@getalby.com`
- **Nostr relays**: See config.js for current list
