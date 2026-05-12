# gittr-mcp

**Ship through agents, not through copy-paste.** This MCP is the missing control plane: your Cursor / Claude / OpenClaw stack gets **first-class tools** for **Gittr**—create repos, push over the bridge, wire **NIP-34** issues and PRs, merge with real git state, and handle **Lightning** paywalls and bounties—**with the same keys and relays you already use**, not a vendor’s sandbox account.

**Why it matters strategically:** teams that bet on AI-only workflows will bottleneck on **“the agent can’t touch the repo.”** Gittr is git on Nostr; this server is how agents **stop asking humans to click the UI** for every branch, issue, and invoice. Competitors optimize for *their* cloud; this optimizes for **your** identity and **your** infrastructure—then stays honest when relays rate-limit or disagree (structured `nextSteps` / `reason` on failures).

*Model Context Protocol (stdio) for [gittr.space](https://gittr.space) — agent-native Git on Nostr.*

---

## Status

**This MCP is maintained for real agent workflows** (repos, bridge push, issues, PRs, merges, bounties) on [gittr.space](https://gittr.space). Nothing here is “vaporware”—the scary rows used to be a **Feb 2026 debugging snapshot** that contradicted the rest of the doc (e.g. clone URLs already prefer **`git.gittr.space`**, which is the HTTPS git host you should use).

| Capability | What to expect |
|------------|----------------|
| Create/manage repos, push to bridge, issues (1621) | ✅ Supported end-to-end |
| Git clone over HTTPS | ✅ Use **`https://git.gittr.space/<pubkey-hex>/repo.git`** (or whatever `resolveRepoByNostrId` / repo metadata returns). Older or relay-only HTTPS paths are not guaranteed to speak `git`; that is a **URL choice** issue, not “the MCP is dead.” |
| PRs (1618) | ✅ Supported from this MCP; **relays** may still reject an event if they cannot validate referenced commits against a cloneable remote. If that happens, use the workarounds in [Limitations → createPR](#createpr--relay-and-clone-url-caveats). |

**MCP-side quality:** clone resolution prefers `git.gittr.space`, bridge challenges are cached/retried on `429`, and errors return `nextSteps` / `reason` for agents.

**Still flaky in the real world (Nostr, not this repo):** relay propagation lag, rate limits, and occasional “event published but not queryable yet.” See [Common Issues](#common-issues) and [Limitations](#limitations).

## AI agent toolkit (MCP)

The MCP server (`server.js`, package bin `gittr-mcp`) exposes tools for **Cursor, Claude Desktop, OpenClaw, Hermes**, etc. There is **no HTTP login session**: identity is a **Nostr private key** (hex or `nsec`). Easiest path: **`cp .nostr-keys.json.example .nostr-keys.json`** and fill it (that file stays local; see [MCP setup](#mcp-setup-common-ai-agents)). You can also pass **`privkey`** per tool, or use `~/.nostr-identity.json` / `~/.config/gittr/keys.json`. **LNbits / Blink** mirror gittr **Settings → Account** and **repo Settings**; pass the same URLs/keys via tool args or env (`GITTR_LNBITS_URL`, `GITTR_LNBITS_ADMIN_KEY`). Never commit real secrets—only the empty **`.nostr-keys.json.example`** belongs in git.

**Agent-oriented responses:** many tools (and all MCP errors) return JSON with `agentSummary`, `whatHappensNext`, `nextSteps`, and on failure `reason` + `error`, so automations know what to retry or which prerequisite to run next (`gittr-agent-outcomes.js` + enriched handlers in `gittr-agent.js`).

| Area | Tools / pattern |
|------|-----------------|
| **Who am I?** | `describeAgentAuth`, `getPublicKey`, `loadCredentials` (masked) |
| **Repos** | `createRepo` (scratch + optional `pushCostSats` + bridge policy sync), `importRemoteToBridge` / `bridgeRepoExists`, `listRepos`, `getRepo`, `pushToBridge`, `publishRepoAnnouncement`, `publishRepoState`, `mirrorRepo` |
| **Refetch / read tree** | `bridgeListFiles`, `bridgeListRefs`, `bridgeListCommits`, `bridgeGetFileContent`, `getFile` |
| **Pay-to-push** | `getPushPaywallStatus`, `createPushPaywallIntent`, `syncRepoPushPolicy` (after publishing `push_cost_sats` on kind **30617**); bridge enforces via SQLite policy |
| **Issues** | `listIssues`, `createIssue`, `getIssueById`, `publishStatusForRoot` (e.g. **1632** close) |
| **PRs** | `listPRs`, `createPR`, `getPullRequestById`, `updatePullRequest` (**1619**), `mergePullRequest` (git merge + bridge push + **30618** + **1631**), `markPullRequestMerged` / `publishStatusForRoot` (**1631** Nostr-only) |
| **Bounties** | `createBountyInvoice`, `publishBountyToNostr` (**9806**), `listBountiesForIssue`, `bountyRelease`, `bountyCreateWithdraw`, `bountyClaimWithdraw` |
| **Relays** | Pass `relays` on Nostr-mutating tools; default list in `config.js` |

**NIP-05 / npub:** `resolveRepoOwnerHex`, `listRepos`, `listIssues`, and bridge helpers accept **hex** or **npub** where the upstream API supports it.

**Full NIP-34 repo metadata** (maintainers, zap splits, milestones, etc.) is still largely edited in the **web UI** and published as kind **30617** events; this MCP focuses on **automation-friendly** subsets (announcement + `push_cost_sats`, push, import, payments, issues/PRs/bounties).

## Testing

```bash
npm test                 # smoke (exports) + happy-path dry-run (bridge ping + auth summary)
npm run test:smoke       # exports only
npm run test:happy-path  # dry-run only
```

Live integration (creates a real repo + issue on relays; optional LNbits bounty invoice):

```bash
# See .env.example — for live scripts use GITTR_TEST_NSEC or GITTR_TEST_PRIVKEY (never commit)
HAPPY_PATH_LIVE=1 GITTR_TEST_NSEC=nsec1... npm run test:happy-path:live
GITTR_TEST_NSEC=nsec1... npm run test:live:matrix
```

Live matrix reliability knobs:

- `GITTR_TEST_RELAYS` defaults to `wss://relay.ngit.dev,wss://ngit-relay.nostrver.se,wss://git.shakespeare.diy`
- `GITTR_TEST_FALLBACK_REPO` defaults to `verify-1778578052940` and is used for issue/PR lifecycle checks when a fresh repo announcement is bridge-visible but still not relay-discoverable.
- Warnings about issue/PR visibility (`publish acknowledged but not queryable yet`) reflect relay propagation lag/rate limiting and are expected occasionally on live runs.

## Installation

```bash
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm install
cp .nostr-keys.json.example .nostr-keys.json   # then edit with your nsec / hex key (see MCP setup)
```

Optional global CLI (same binary the agents use):

```bash
npm link   # from the repo root — adds `gittr-mcp` on your PATH
```

**Requirements:** Node **18+** (see `package.json` `engines`). For `mergePullRequest`, **`git`** must be on `PATH`.

---

## MCP setup (common AI agents)

The MCP server is **`server.js`** and speaks **stdio** (Cursor starts it with `node …/server.js`). It does **not** read `.env` by itself—set environment variables in your host app’s MCP config (or export them in the shell that launches the server).

**Reality check:** every app stores MCP config in a different place and JSON field names can differ between versions. The patterns below match **Cursor** (`~/.cursor/mcp.json`) and **Claude Desktop** (`claude_desktop_config.json`). Other tools follow the same *idea* (add a stdio server that runs `node …/server.js`), but use that product’s own MCP docs if something does not match.

### 1. Identity and bridge (all hosts)

1. **Create your local keys file (not in git)**  
   - In the repo you cloned, **copy** the committed template to a file Git will ignore:
     ```bash
     cp .nostr-keys.json.example .nostr-keys.json
     ```
   - Edit **`.nostr-keys.json`** and set **`nsec`** (NIP-19) **or** **`secretKey`** / **`private_key`** (64-char hex). Leave `npub` empty unless you want to cache it; it can be derived from `nsec`.  
   - **`.nostr-keys.json` is in `.gitignore`** — only **`.nostr-keys.json.example`** (empty placeholders) ships on GitHub. Your filled file stays on your machine.

2. **Where the MCP looks** (first match wins when the process starts):
   - `./.nostr-keys.json` (working directory — often the clone if you use `cp` above), or  
   - `~/.nostr-identity.json`, or  
   - `~/.config/gittr/keys.json`  

   Minimal **filled** shape:

   ```json
   { "nsec": "nsec1…" }
   ```

   Hex `secretKey` / `private_key` is also supported instead of `nsec`.

3. **Bridge URL** — default is `https://gittr.space` from `config.js`. Override with:

   ```bash
   export BRIDGE_URL=https://gittr.space
   ```

4. **Optional env** — see [`.env.example`](.env.example) for `GITTR_LNBITS_*`, test relays, etc. Copy to `.env` for your own notes; MCP clients usually need the same keys in their `env` block.

5. **Quick self-check** (terminal, from repo root — after you created `.nostr-keys.json`):

   ```bash
   npm run test:happy-path
   ```

   Or call tool **`describeAgentAuth`** from your agent once MCP is connected.

---

### 2. Cursor (`~/.cursor/mcp.json`)

When you use **MCP → Add new** (or “Open MCP config”), Cursor opens **`~/.cursor/mcp.json`**. That file has **one** top-level object `mcpServers`. **Each key inside `mcpServers` is a separate MCP server** running in parallel. You do **not** replace your existing server—you **add another entry** next to it.

- Your existing **`streamable-mcp-server`** uses **`type` + `url`** (HTTP MCP). Leave it as-is.
- **gittr-mcp** uses **`command` + `args`** (stdio MCP). No `type` or `url` for this one—Cursor treats `command` as “run this process and talk MCP over stdin/stdout”.

**Valid JSON:** put a **comma** after the closing `}` of the previous server, then paste the `gittr` block. The file must stay valid JSON (no trailing comma after the last server).

Example: **your current file + gittr** (replace the path with your real clone path):

```json
{
  "mcpServers": {
    "streamable-mcp-server": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp"
    },
    "gittr": {
      "command": "node",
      "args": ["/home/homie/Downloads/gittr-mcp/server.js"],
      "env": {
        "BRIDGE_URL": "https://gittr.space"
      }
    }
  }
}
```

- **`args`**: must be an **array** with one element: the absolute path to `server.js` inside your clone.  
- **`env`**: optional if defaults are fine; add `GITTR_LNBITS_URL` / `GITTR_LNBITS_ADMIN_KEY` here if you use bounties from the agent.

**Keys file:** after `cp .nostr-keys.json.example .nostr-keys.json` and editing it, either set MCP **`cwd`** to the clone (if your Cursor build supports it) so the process sees `./.nostr-keys.json`, or keep using `~/.nostr-identity.json`. If the file only lives next to the repo, either copy it to `~/.nostr-identity.json` or add **`cwd`** on the `gittr` entry pointing at the repo folder **if your Cursor build supports `cwd` for MCP** (feature availability varies).

Save the file, then **reload MCP** or restart Cursor. You should see two servers (e.g. `streamable-mcp-server` and `gittr`) and gittr’s tools under the gittr server.

**Same idea on other apps:** wherever the product stores MCP config, it is almost always a **list or map of several servers**. People run into the same mistake—pasting only the gittr block and **wiping** existing entries (HTTP bridges, other stdio servers). Always **merge additively**; keep commas / array items valid for that format.

---

### 3. Claude Desktop (Anthropic)

1. **Quit** Claude Desktop (it reads config at startup).  
2. Open the config file (create it if missing):
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
   - **Linux (when used):** often `~/.config/Claude/claude_desktop_config.json` — if missing, use your build’s docs.

3. The file uses the same overall shape as Cursor: a top-level **`mcpServers`** object. **Add** a `gittr` key **next to** whatever you already have (filesystem, memory, other HTTP MCPs, etc.). Do **not** delete other keys unless you intend to remove those servers.

Example (existing server + gittr — adjust paths and names):

```json
{
  "mcpServers": {
    "some-other-server": {
      "command": "npx",
      "args": ["-y", "some-package"]
    },
    "gittr": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/gittr-mcp/server.js"],
      "env": {
        "BRIDGE_URL": "https://gittr.space"
      }
    }
  }
}
```

4. Save, start Claude Desktop again, confirm gittr appears as its own MCP server.

If your Claude build documents **`servers`** instead of **`mcpServers`**, follow that file’s schema—the rule is still: **add** gittr, do not replace the whole registry.

---

### 4. VS Code (GitHub Copilot / MCP)

VS Code’s MCP UI and JSON shape **vary by version** (sometimes user `settings.json`, sometimes a dedicated MCP JSON file). What trips people up is the same: **you already have one or more MCP definitions** and the editor shows a snippet for *only* the new server.

- Use **Command Palette → “MCP”** (or your version’s **Settings → Features → MCP**) to see how servers are listed.  
- When editing JSON, **append** the gittr stdio definition **alongside** existing servers; keep the file valid (commas between entries, correct nesting).  
- **Stdio** = `command` + `args` (array with absolute path to `server.js`), optional `env`, same as Cursor.

If the UI offers **“Add server”** and generates JSON for you, prefer that—then you are less likely to overwrite unrelated entries.

---

### 5. Windsurf / Codeium

Windsurf also keeps **multiple MCP connections** in one place (wording varies: Cascade / MCP settings / “Open MCP config”). Same rules:

- Do **not** replace the whole config with only gittr.  
- Add a **new** stdio server: `command`: `node`, `args`: `[absolute path to server.js]`, optional `env`.  
- **HTTP** and **stdio** servers can coexist; they are different entries.

Use the in-app **open config file** action when available so you see the full JSON and can merge safely.

---

### 6. OpenClaw (mcporter)

With **mcporter**, `config add` usually **registers another named server** without removing the others—similar mental model to adding a key in `mcpServers`.

```bash
mcporter config add gittr-mcp --command "node /ABSOLUTE/PATH/TO/gittr-mcp/server.js"
```

If you **hand-edit** mcporter’s JSON (or a merged config file), apply the same rule: **append** gittr’s entry, do not delete existing server blocks. More detail: **[OPENCLAW-INTEGRATION.md](OPENCLAW-INTEGRATION.md)**.

(`server.js` speaks MCP over stdio; `index.js` is the library API only.)

---

### 7. Any other MCP host (Hermes, CLI, Docker, etc.)

Orchestrators and CLIs differ, but the confusion is the same:

- **Registries are additive:** one process or config file often lists **many** MCP endpoints.  
- Adding gittr should **not** remove your existing bridge unless you choose to.

**Stdio contract:** run `node /absolute/path/to/gittr-mcp/server.js` with optional env (`BRIDGE_URL`, keys in `env` or pre-exported). Pass env the way your runner documents (`Environment=` in systemd, `env:` in compose, etc.).

Tool results are JSON text with **`nextSteps`** / **`agentSummary`** on many flows—parse the tool result string as JSON.

---

## Quick Start

```javascript
const gittr = require('gittr-mcp');

// Push files to gittr (Nostr auth required — privkey signs challenge)
const pushResult = await gittr.pushToBridge({
  ownerPubkey: 'your-64-char-hex-pubkey',
  repo: 'my-repo',
  branch: 'main',
  files: [
    { path: 'README.md', content: '# Hello World' },
    { path: 'src/index.js', content: 'console.log("Hello!");' }
  ],
  privkey: 'your-hex-privkey'
});

// Publish to Nostr (REQUIRES signing with private key)
await gittr.publishRepoAnnouncement({
  repoId: 'my-repo',
  name: 'my-repo',
  description: 'My awesome project',
  web: ['https://gittr.space/npub.../my-repo'],
  clone: ['https://relay.ngit.dev/pubkey.../my-repo.git'],
  privkey: 'your-private-key-hex',
  relays: ['wss://relay.ngit.dev']
});

await gittr.publishRepoState({
  repoId: 'my-repo',
  refs: pushResult.refs,
  privkey: 'your-private-key-hex',
  relays: ['wss://relay.ngit.dev']
});
```

## Two-Step Workflow

**Note:** For most use cases, use `createRepo()` which handles both steps automatically.

### createRepo() — Recommended

```javascript
const result = await gittr.createRepo({
  name: 'my-repo',
  description: 'My project',
  files: [
    { path: 'README.md', content: '# Hello' },
    { path: 'src/index.js', content: 'console.log("Hi");' }
  ],
  privkey: 'your-hex-privkey'
});
// Returns: { success, repoId, cloneUrl, webUrl, announced, statePublished }
```

This function:
1. Pushes files to the bridge
2. Publishes NIP-34 announcement (kind 30617)
3. Publishes NIP-34 state (kind 30618)

Always use `createRepo()` to avoid stray files on the bridge.

### Manual Steps (Advanced)

If you need fine-grained control:

#### Step 1: Push Files (Auth Required)

The bridge requires NIP-98 auth (sign challenge with your Nostr key). MCP caches the signed challenge briefly to avoid hammering the challenge endpoint.

```javascript
const result = await gittr.pushToBridge({
  ownerPubkey: '<64-char-hex-pubkey>',
  repo: 'repo-name',
  branch: 'main',
  files: [
    { path: 'file.txt', content: 'content' }
  ],
  privkey: '<your-hex-privkey>'  // required for NIP-98 bridge auth
});

console.log('Commit:', result.refs[0].commit);
```

**What happens:**
- MCP gets a challenge from the bridge, signs it with your key (NIP-98), and sends the push
- Signed challenge is cached ~45s so multiple pushes reuse one challenge
- On 429 (rate limit), MCP waits `retry_after` seconds and retries once
- Files are pushed to the bridge (https://gittr.space); commit SHA is returned for Nostr state

### Step 2: Publish to Nostr (Requires Signing)

For files to appear on gittr.space, you must publish Nostr events:

```javascript
// Announce repository (kind 30617)
const announceResult = await gittr.publishRepoAnnouncement({
  repoId: 'repo-name',
  name: 'My Repo',
  description: 'Description',
  web: ['https://gittr.space/npub.../repo-name'],
  clone: ['https://relay.ngit.dev/<pubkey>/repo-name.git'],
  privkey: '<your-private-key-hex>',
  relays: ['wss://relay.ngit.dev'] // MUST match clone URL domain
});

// Publish state (kind 30618)
const stateResult = await gittr.publishRepoState({
  repoId: 'repo-name',
  refs: result.refs, // From step 1
  privkey: '<your-private-key-hex>',
  relays: ['wss://relay.ngit.dev']
});
```

**What happens:**
- Creates Nostr events signed with your private key
- Announces repository metadata to Nostr relays
- Publishes current refs/commits

**⚠️ Security:** Never commit your private key. Use environment variables.

## API Reference

### Repository Operations

#### `pushToBridge(options)`

Push files to the gittr bridge. **Requires `privkey`** for NIP-98 auth (challenge is fetched and signed automatically; result is cached briefly).

**Parameters:**
- `ownerPubkey` (string) - 64-char hex pubkey
- `repo` (string) - Repository name
- `branch` (string) - Branch name (default: 'main')
- `files` (array) - Array of `{ path, content }` objects
- `privkey` (string) - **Required.** Hex private key to sign the bridge challenge (NIP-98)
  - `path` (string) - File path (e.g., 'src/index.js')
  - `content` (string) - File content (UTF-8)
  - `isBinary` (boolean, optional) - If true, content is base64

**Returns:**
```javascript
{
  success: true,
  pushedFiles: 2,
  refs: [
    { ref: 'refs/heads/main', commit: 'abc123...' }
  ]
}
```

#### `publishRepoAnnouncement(options)`

Publish repository to Nostr (kind 30617). **REQUIRES signing.**

**Parameters:**
- `repoId` (string) - Repository identifier
- `name` (string) - Human-readable name
- `description` (string) - Repository description
- `web` (array) - Web URLs (e.g., gittr.space links)
- `clone` (array) - Git clone URLs (MUST match relay domains)
- `privkey` (string) - 64-char hex private key
- `relays` (array) - Relay URLs (MUST include GRASP server from clone URLs)

**Returns:**
```javascript
{
  success: true,
  event: { id: '...', sig: '...', ... }
}
```

**⚠️ CRITICAL:** Clone URL domain MUST be in relays array:
```javascript
// ✅ CORRECT
clone: ['https://relay.ngit.dev/<pubkey>/repo.git']
relays: ['wss://relay.ngit.dev']

// ❌ WRONG - domains don't match
clone: ['https://git.gittr.space/<pubkey>/repo.git']
relays: ['wss://relay.noderunners.network']
```

#### `publishRepoState(options)`

Publish repository state to Nostr (kind 30618). **REQUIRES signing.**

**Parameters:**
- `repoId` (string) - Repository identifier
- `refs` (array) - Array of `{ name, commit }` objects
  - `name` (string) - Ref name (e.g., 'refs/heads/main')
  - `commit` (string) - Commit SHA
- `privkey` (string) - 64-char hex private key
- `relays` (array) - Relay URLs

**Returns:**
```javascript
{
  success: true,
  event: { id: '...', sig: '...', ... }
}
```

#### `listRepos(options)`

Discover repositories from Nostr relays.

**Parameters:**
- `pubkey` (string, optional) - Filter by owner pubkey
- `search` (string, optional) - Search term
- `limit` (number, optional) - Max results (default: 100)
- `relays` (array, optional) - Custom relay list

**Returns:**
```javascript
[
  {
    id: 'repo-name',
    name: 'My Repo',
    description: 'Description',
    owner: 'pubkey...',
    web: ['https://...'],
    clone: ['https://...'],
    graspServers: ['relay.ngit.dev'],
    relays: ['wss://relay.ngit.dev'],
    event: { ... }
  }
]
```

#### `resolveRepoByNostrId(ownerNpubOrHex, repoId, options?)`

Resolve a repo by Nostr identity (npub or hex) and repo name. Returns `cloneUrl` (prefers git.gittr.space), `cloneUrls`, and `relays` so agents can be location-agnostic.

**Parameters:**
- `ownerNpubOrHex` (string) - Owner as npub (NIP-19) or 64-char hex
- `repoId` (string) - Repository name/id
- `options.relays` (array, optional) - Relay list for discovery

**Returns:** Same as `getRepo` plus `cloneUrl` (single preferred URL) and `cloneUrls` (all clone URLs from the event).

### Issue Operations

#### `listIssues(options)`

List issues for a repository.

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `labels` (array, optional) - Filter by labels
- `relays` (array, optional) - Custom relay list

#### `createIssue(options)`

Create an issue. **REQUIRES signing.**

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `subject` (string) - Issue title
- `content` (string) - Issue description (markdown)
- `labels` (array, optional) - Issue labels
- `privkey` (string) - 64-char hex private key
- `relays` (array, optional) - Relay URLs

### Pull Request Operations

#### `listPRs(options)`

List pull requests for a repository.

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `relays` (array, optional) - Custom relay list

#### `createPR(options)`

Create a pull request. **REQUIRES signing.**

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `subject` (string) - PR title
- `content` (string) - PR description (markdown)
- `commitId` (string) - Tip commit SHA
- `cloneUrls` (array) - Git clone URLs for PR branch
- `branchName` (string) - PR branch name
- `labels` (array, optional) - PR labels
- `privkey` (string) - 64-char hex private key
- `relays` (array, optional) - Relay URLs

### Bounty Operations

**⚠️ Note:** Bounty system exists in gittr code but no active bounties yet on platform.

#### `createBounty(ownerPubkey, repoId, issueId, amount, description)`

Create a Lightning bounty for an issue.

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `issueId` (string) - Issue event ID
- `amount` (number) - Bounty amount in sats
- `description` (string) - Bounty description

## Known GRASP Servers

GRASP servers are both Nostr relays (wss://) AND git servers (https://):

- `relay.ngit.dev` (recommended - accepts all repos)
- `git.shakespeare.diy`
- `ngit-relay.nostrver.se`
- `git-01.uid.ovh`
- `git-02.uid.ovh`
- `ngit.danconwaydev.com`
- `git.gittr.space` (gittr's server)

**Usage:**
```javascript
const graspDomain = 'relay.ngit.dev';

const announceResult = await gittr.publishRepoAnnouncement({
  // ...
  clone: [`https://${graspDomain}/<pubkey>/repo.git`],
  relays: [`wss://${graspDomain}`] // MUST match clone domain
});
```

## Common Issues

### "Invalid announcement: multiple clone tags found"

**Cause:** Some relays reject repeated `clone` tags in kind `30617`.

**Solution:** Publish a single `clone` tag with multiple values, and a single `relays` tag with multiple values.

### "Announcement must list service in both clone and relays tags"

**Cause:** Clone URL domain doesn't match any relay.

**Solution:** Extract domain from clone URL and add as `wss://<domain>` to relays.

### Repo shows "0 files" on gittr.space

**Cause:** Only pushed files (step 1), didn't publish to Nostr (step 2).

**Solution:** Run both `publishRepoAnnouncement()` and `publishRepoState()`.

### "duplicate url" error

**Cause:** Publishing to same relay multiple times.

**Solution:** Non-fatal - events published successfully. De-duplicate relays array.

### Rate limits (gittr.space bridge)

The bridge applies: **push** 10/min per IP and 5/min per Nostr identity; **push-challenge** 30/min per IP. On `429`, the JSON body includes `retry_after` (seconds). MCP caches the signed challenge ~45s and on 429 waits `retry_after` then retries once. Avoid tight loops (e.g. many `createRepo` calls in a row without delay).

## Security

- **Never commit private keys** - use environment variables
- Bridge push requires NIP-98 (sign challenge with privkey); Nostr publish (announcements, issues, PRs) also requires signing
- Store keys securely (e.g., `~/.nostr-identity.json` with 0600 permissions)

## Complete Example

See [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md) for full end-to-end examples.

## Support

If you're earning sats with this MCP, consider zapping the builder!

⚡ **Lightning:** arbadacarba@btip.nl

**Fair deal:**
- Used successfully? → 1,000-5,000 sats
- Built bounty agent? → 10,000+ sats
- Earned big? → 1-5% of your take

Top supporters (10k+ sats) get:
- Listed in SUPPORTERS.md
- Priority feature requests
- Direct support access

## Links

- **GitHub:** https://github.com/arbadacarbaYK/gittr-mcp
- **gittr.space:** https://gittr.space
- **NIP-34 Spec:** https://github.com/nostr-protocol/nips/blob/master/34.md
- **Builder:** @arbadacarba (Telegram), @arbadacarbaYK (Twitter)

## License

MIT

## Limitations

### getFile() — Requires Nostr Sync

`getFile()` fetches file content via GRASP servers. This works **only after** the repo has been published to Nostr. 

Files that exist on the bridge but haven't been published yet (NIP-34 events) cannot be read via this function. 

**Workaround:** Always use `createRepo()` or ensure your changes are published to Nostr before attempting to read files.

### createPR — Relay and clone URL caveats

**What usually works:** bridge push stores objects; announcements list a **clone URL**. For HTTPS, tooling and this MCP prefer **`https://git.gittr.space/<pubkey-hex>/repo.git`**. Many relays can validate PR commits against **that** host when it is wired up for your repo.

**When PR publish fails:** some relays try to verify that the PR’s commits exist in a **cloneable** git repository. If your published `clone` URL does not actually serve `git` (wrong host, 404, or only a web page), you can see errors like *“PR event must reference an accepted repository or accepted event”*. That is a **relay + clone URL** interaction—not “the MCP cannot create PRs.”

**Debugging snapshot (2026-02-14, wrong clone bases):** pushing to the bridge succeeded while **`git clone https://relay.ngit.dev/.../repo.git`** (or other non-git HTTP paths) returned *repository not found*, so relays had nothing to validate against. Prefer **`git.gittr.space`** (or `nostr://` via gittr tooling), not random relay HTTPS URLs, for the clone tag.

**If you still get rejections:**
1. **gittr CLI** — full flow, `nostr://` internally where appropriate  
2. **External clone URLs** — GitHub/GitLab in `30617` when you need a mainstream git remote every relay can hit  
3. **Patches (1617)** — different NIP path; some flows skip PR-style git checks  
4. **git-remote-nostr** — for `nostr://` with stock `git` where you manage that yourself  

**Reminder:** GRASP-style servers expose both relay and git on a coherent URL; **always** align `clone` and `relays` tags per [Common Issues](#common-issues). The MCP signs and sends events correctly; fixing “relay said no” is about metadata and infrastructure the relay can reach.
