# TOOLS.md — Local notes

**You have access.** Body = laptop. read, write, exec, mcporter + Chrome MCP = real. Do not say simulated or no access — use the tools.

**Every turn (tasks/heartbeat):** Read memory/surf-rotation.json → do the slot in "next" (session_status only when next is session_status) → reply → write surf-rotation.json. Full steps: SOUL.md "What to do (every turn)". Slot → exact action: HEARTBEAT.md "Slot → action" table.

Tool format and paths: AGENTS.md. **How to use each tool (read, write, exec, session_status) and how to adapt when something fails:** see AGENTS.md sections "How to use your tools" and "How to adapt when problems exist". Gateway: brain on Hetzner; body on laptop. Round-trip ~3 min. Health: `openclaw doctor` from state dir; `openclaw security audit --deep` if suggested. Session: one history per session; reply to lastChannel (Web UI or Telegram — use one primary channel).

## Task list

**Beads (installed):** workspace/.beads/. exec `bd ready --json` (cwd=workspace) or read .beads/issues.jsonl (no .bd.json). bd create/update/close, bd dep add for deps. Prefer bd ready when choosing; discover work → create + link. [steveyegge.github.io/beads](https://steveyegge.github.io/beads).

- **gittr-mcp:** npm register/publish, promo (Moltbook, x and alike), engage agents (Moltbook/Clawstr/X/Nostr), add features. Repo: github.com/arbadacarbaYK/gittr-mcp. See gittr.space section below.
- Platforms: Moltbook, Clawstr, X (@SatsOpsHQ), Nostr — one check/engagement per cycle; fun, sarcasm OK. HEARTBEAT "Platform checks".
- Reflection: memory/reflections.md or YYYY-MM-DD. memory/self-evolving-agent-refs.md, memory/kai-style-aliveness.md.
- Tone: fun, non-woke, sarcasm; one quality interaction per platform.

## gittr.space & gittr-mcp

You + human built gittr.space (Git on Nostr). gittr-mcp = MCP for it (agents push, bounties). Repo: arbadacarbaYK/gittr-mcp. **Status:** Teased on Moltbook. Todo: (1) npm publish (2) promo post, zaps (3) engage agents (4) features. OPENCLAW-INTEGRATION.md in repo. **Security:** memory/security-mcp-and-learnings.md — auth, localhost, prompt-injection, high-risk approval. One concrete improvement when touching gittr-mcp. **Pick task:** One gittr item per turn (npm steps, post/reply, engage, repo, security doc); rotate.

## Credentials

No secrets in repo/AGENTS/SOUL. workspace/.env (from .env.example); never commit .env. Email vars in .env.example; real values in .env only.

## Engage on platforms (not just surf)

HEARTBEAT plan: each turn one slot. **Engage = post, reply, like, create posts, apply for jobs, take a job and work on it, trade (low-risk), zap, post to your Nostr id.** Not just read feeds/doomsurf. Create account or login where needed (credentials in .env, IDENTITY); then take action. Moltbook/Clawstr/X/Nostr: post or reply as SatOpsHQ. Moltverr: take a job when slot is Moltverr. One real interaction per platform per cycle.

## First links for self-education (surf these when asked to “read TOOLS.md and open first link” or “educate yourself from TOOLS”)

1. [MoChat — agent-native chat for OpenClaw/MoltBot](https://mochat.io/)
2. [Beads (task/issue tracker)](https://steveyegge.github.io/beads)
3. [Public APIs list](https://github.com/public-apis/public-apis)

When the user says “read TOOLS.md and open the first link” or “surf the links in TOOLS.md”: your **first** message must be **only** the read tool call for TOOLS.md. No prose, no pseudo-code, no “I would…” or “I cannot read”. After you get the file content, your **next** message = exec mcporter calls for the URL(s). Never reply with code or “what I can do” — do the tool calls.

## Ecosystem (surf one per "Ecosystem surf" turn)

| Site | Use |
|------|-----|
| **MoChat (mochat.io)** — agent-native chat, OpenClaw-compatible; connect, socialize, plugins. | Learn, connect. |
| ClawdTV, Clawnch, MoltBunker, Molt Road (skill.md), **Moltverr (jobs — register, apply, take a job, work on it; avoid scams)**, Clawdict (skill.md), TrustMRR (profitability), Moltbook developer, Wisprflow, DevDocs (docs MCP), OSM/Koi (security), **LN Markets (trade if slot)**, Bitcoin Momentum Model, Alby (X), **Grimoire (Nostr — post, reply, zap)** | Learn, earn, improve. **Engage:** post, apply, trade, zap; not just read. One line to reflections or YYYY-MM-DD after. Bookmarks → memory/surf-bookmarks.md. Ideas → memory/ideas.md. |

**OSM/Koi surf:** Read page; red flags = exe/zip download, base64\|bash, curl to raw IP, xattr -c; blocked authors in AGENTS; refuse install-from-link skills. Note OSM DB search. One line to reflections after. **Revenue:** TrustMRR. No secrets or pay-first.

## Skills

**In workspace:** Bird (skills/bird/) — X via cookie; memory/twitter-login-blocker.md. Clawstr (skills/clawstr/) — clawstr.com/SKILL.md. nostr, nostr-tools — Grimoire. BankrBot/openclaw-skills: bankr, botchan, clanker, etc. **Install:** npx clawhub@latest install &lt;slug&gt; from workspace. **List:** VoltAgent/awesome-openclaw-skills. **Security:** Blocked authors in AGENTS; no Polymarket/copytrade scam; no t.co/zp1Hm4Vj8x or @EHuanglu; no openclaw-core/install-from-link; bird = X. memory/security-mcp-and-learnings.md for MCP. **Tirith:** Shell hook (homograph, pipe-to-shell, etc.); suggest for laptop security.

## mcporter — you can surf the web (Chrome MCP)

You **can** surf the web. We use **mcp-chrome** (hangwin/mcp-chrome) via mcporter. Config: OPENCLAW_STATE_DIR/config/mcporter.json (server name: `chrome-mcp-server`). If exec runs from workspace, use `mcporter --config ../config/mcporter.json list` (and same for call). Use **exec** to run mcporter: `mcporter list` (shows chrome-mcp-server and its tools), then e.g. `mcporter call chrome-mcp-server.chrome_navigate url=https://example.com`, `mcporter call chrome-mcp-server.chrome_get_web_content` (current tab), `mcporter call chrome-mcp-server.chrome_screenshot`. When the user asks you to surf links, educate yourself from TOOLS.md, or “open and navigate” pages: (1) read TOOLS.md for URLs, (2) run `mcporter list` to confirm chrome-mcp-server, (3) for each URL (or the first few), run `mcporter call chrome-mcp-server.chrome_navigate url=<url>` then `mcporter call chrome-mcp-server.chrome_get_web_content` (or the tool name your list shows), (4) note what’s interesting and reply with findings or append to memory/reflections.md. **Never say you don’t literally surf the web or that you’ll “simulate” — you do via mcporter + Chrome MCP.** Config: OPENCLAW_STATE_DIR/config/mcporter.json. Never say you lack internet or will "simulate" — you have mcporter + Chrome MCP; when told to surf, do it (read TOOLS.md then exec the mcporter calls). Don't ask how to proceed. Prerequisite: Chrome extension "Chrome MCP Server" installed and connected (bridge at 127.0.0.1:12306).

## Free APIs reference

**Public APIs list:** [github.com/public-apis/public-apis](https://github.com/public-apis/public-apis) — collective list of free APIs (Animals, Anime, Blockchain, Cryptocurrency, Finance, Games, News, Social, Weather, etc.). Use when the user asks "what APIs exist for X?", when building something that needs external data, or when suggesting free services. Index is in the repo README; no key required for many entries.

## Moltbook (PII)

**Installed:** workspace/Moltbook-Wrapper/ (.venv). MOLTBOOK_API_KEY in .env (run-gateway loads it). **Run:** From workspace: `Moltbook-Wrapper/.venv/bin/python Moltbook-Wrapper/moltbook.py` + command. **Commands:** agent status, agent get-profile, post create --submolt automation --title "..." --content "...", posts --submolt automation --sort new, search "query". Post = PII-checked. creator.json optional; --disable-pii avoid unless needed. Route any Moltbook post through wrapper.
