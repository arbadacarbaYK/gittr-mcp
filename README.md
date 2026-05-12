# gittr-mcp

**MCP (stdio) for [gittr.space](https://gittr.space)** — agents use your **Nostr key** to push over the bridge, open issues/PRs, merge with git, and handle **Lightning** paywalls/bounties. No vendor login: same identity as the website.

| Capability | Notes |
|------------|--------|
| Repos, bridge push, issues | Supported end-to-end |
| HTTPS `git clone` | **Pass/fail per URL:** only counts as success if `git clone` (or `git ls-remote`) works on the **`clone` URL you published**. Use **`https://git.gittr.space/<hex-pubkey>/repo.git`** unless you know another URL serves git HTTP. |
| PRs | MCP sends signed events; **relays** may reject if they cannot validate commits—[docs/DEVELOPER.md#limitations](docs/DEVELOPER.md#limitations). |

**Relays / rate limits** can still lag or throttle; tool responses often include `nextSteps` and `reason` for automation.

### What “success” means (no mixed signals)

Each step **either succeeded or it did not**. There is no third state like “bridge happy but git irrelevant.”

| Step | Pass / fail | How you know |
|------|----------------|--------------|
| **Bridge push** | Pass only if the API returns success and you got refs/commits. | Tool response / HTTP error. |
| **Publish to relays (30617 / 30618)** | Pass only if events were accepted and show up as you expect. | Tool response; relay errors are **fail** for that step. |
| **`git clone` using your published `clone` URL** | Pass only if `git clone` (or `git ls-remote`) against **that exact URL** works. | Exit code 0. **404 / “not a repository” = fail** for *that* step — your announcement points at a URL that is **not** serving git HTTP for that path. |

So: a **failed `git clone`** is a **failed clone step**, full stop. It does **not** rewrite history on the bridge push; it means **your repo metadata (the `clone` URL in 30617) is wrong for people who use stock `git` over HTTPS.** Fix the URL (this MCP defaults toward **`https://git.gittr.space/<hex-pubkey>/repo.git`**) and re-publish — then re-check `git clone` until that step **passes**.

**Why `relay.ngit.dev` URLs confused people:** some `https://relay.ngit.dev/…/repo.git` shapes are **not** a public git HTTP endpoint for that path (relay ≠ same as “git smart HTTP on this URL”). If clone fails there, treat it as **wrong clone URL for `git`**, not as “everything else magically OK.”

---

## If you are not a developer (“just make it work”)

1. Install [Node 18+](https://nodejs.org/).  
2. Clone this repo and run **`npm install`** (or **`npm ci`** if you develop here).  
3. **`cp .nostr-keys.json.example .nostr-keys.json`** and put your **`nsec`** (or hex private key) in that file. It stays on your machine only (gitignored).  
4. In **Cursor**: open MCP config and **add** a server (do not erase your other MCPs). Example:

```json
{
  "mcpServers": {
    "gittr": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/gittr-mcp/server.js"],
      "env": { "BRIDGE_URL": "https://gittr.space" }
    }
  }
}
```

5. Restart / reload MCP. Ask the agent to run **`describeAgentAuth`** once to confirm keys load.

**Other apps** (Claude Desktop, Windsurf, OpenClaw, …): same stdio idea — [docs/MCP-HOSTS.md](docs/MCP-HOSTS.md).

---

## If you develop or script against this repo

```bash
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm ci          # reproducible install (uses package-lock.json)
npm test        # smoke + happy-path dry-run
```

- **Library entry:** `require('gittr-mcp')` → `index.js`. **MCP process:** `server.js` (also **`gittr-mcp`** npm bin).  
- **Reference:** [docs/DEVELOPER.md](docs/DEVELOPER.md) (API, GRASP, errors), [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md), [docs/SIGNING-GUIDE.md](docs/SIGNING-GUIDE.md), [docs/NIP34-SCHEMAS.md](docs/NIP34-SCHEMAS.md).  
- **Doc index:** [docs/README.md](docs/README.md).  
- **Agent errors:** failed publish/verify paths return JSON with **`verification`** (`confirmed`, `confirmedOnRelays`, `missingOnRelays`, `elapsedMs`) — not ambiguous text. Tune **`GITTR_RELAY_VERIFY_TIMEOUT_MS`** / **`GITTR_DISCOVERABILITY_TIMEOUT_MS`** via `.env.example`.

**Live integration tests** (real relays; optional LNbits): see `.env.example` — use **`GITTR_TEST_NSEC`** / **`GITTR_TEST_PRIVKEY`**, never commit keys.

```bash
HAPPY_PATH_LIVE=1 GITTR_TEST_NSEC=nsec1... npm run test:happy-path:live
```

---

## What the MCP exposes (summary)

Auth helpers, repo lifecycle (`createRepo`, `pushToBridge`, publish **30617/30618**), bridge file/ref APIs, issues/PRs/merge, push paywall intents, bounties, relay overrides. Full tool list is in **`server.js`**.

---

## Security

- Do **not** commit `.nostr-keys.json` or real env secrets. Only **`.nostr-keys.json.example`** belongs in git.  
- Bridge auth is **NIP-98**; treat transcripts as sensitive.

---

## Support & links

- **Repo:** https://github.com/arbadacarbaYK/gittr-mcp  
- **gittr:** https://gittr.space  
- **NIP-34:** https://github.com/nostr-protocol/nips/blob/master/34.md  

MIT License.
