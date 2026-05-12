# MCP host setup (Cursor, Claude, OpenClaw, …)

The server is **`server.js`** — stdio MCP (`node …/server.js`). It does **not** load `.env` by itself; set env in the host’s MCP config or in the shell that starts the process.

## 1. Identity and bridge (all hosts)

1. **Keys (never commit real values)**  
   `cp .nostr-keys.json.example .nostr-keys.json` then set **`nsec`** or **`secretKey`** / **`private_key`** (hex). See root README.

2. **Lookup order** (first hit wins): `./.nostr-keys.json` → `~/.nostr-identity.json` → `~/.config/gittr/keys.json`. Optional: pass **`privkey`** on each tool.

3. **Bridge:** default `https://gittr.space` (`BRIDGE_URL` to override).

4. **Optional:** `.env.example` documents `GITTR_LNBITS_*` and test env vars — copy into your MCP `env` block if needed.

5. **Sanity check:** `npm run test:happy-path` from the repo, or MCP tool **`describeAgentAuth`**.

## 2. Cursor (`~/.cursor/mcp.json`)

`mcpServers` is a **map** — **add** a `gittr` entry; do not delete your other servers.

- **stdio:** `command` + `args` (array with absolute path to `server.js`). No `type`/`url` for this entry.
- Optional: `cwd` pointing at the repo (if your build supports it) so `./.nostr-keys.json` is visible.

```json
{
  "mcpServers": {
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

Reload MCP or restart Cursor.

## 3. Claude Desktop

Quit the app. Edit `claude_desktop_config.json` (path varies by OS — see Anthropic docs). Same `mcpServers` shape as above: **merge** `gittr` next to existing servers.

## 4. VS Code / Copilot MCP

Use the product’s MCP settings UI or JSON; **append** a stdio server (`command` + `args`). Paths must be absolute.

## 5. Windsurf / Codeium

Same idea: multiple MCP entries in one config — add stdio `gittr`, keep HTTP/other entries.

## 6. OpenClaw (mcporter)

```bash
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm install
mcporter config add gittr-mcp --command "node $(pwd)/server.js"
```

Verify:

```bash
mcporter list
mcporter call gittr-mcp.listRepos limit=10
```

**OpenClaw skill (optional):** create `skills/gittr-mcp/SKILL.md` with frontmatter `name: gittr-mcp`, `description: Interact with gittr.space…`, and example `mcporter call gittr-mcp.listRepos limit=10`.

## 7. Any other host (Hermes, Docker, systemd)

- **Additive config:** register another server; do not replace the whole file.
- **Contract:** `node /absolute/path/to/server.js`, stdin/stdout MCP framing, optional env `BRIDGE_URL`, `GITTR_LNBITS_*`.
- Tool results are often JSON strings with **`agentSummary`** / **`nextSteps`** — parse as JSON when automating.

`index.js` is the **library** entry; **`server.js`** is the MCP binary.
