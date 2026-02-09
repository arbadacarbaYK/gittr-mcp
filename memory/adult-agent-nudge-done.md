# Adult-agent nudge — runbook

Runbook for nudging the adult agent and keeping Ollama on Hetzner usable.

## Testing before handoff (no user involvement until these pass)

**Before asking the user to test again:** Run all three scripts from the repo root. Only involve the user when all exit 0.

1. **Pre-flight:** `./scripts/verify-hetzner-setup.sh` — checks openclaw.json (timeout 900, sandbox off, exec host gateway, model qwen3:8b), workspace, Hetzner Ollama reachable and qwen3:8b present, openclaw doctor.
2. **Agent responds:** Gateway must be running. Then: `./scripts/verify-agent-responds.sh [timeout_sec]` (default 900). Sends one message and polls until a new assistant or toolResult appears. First reply often takes **3–6 minutes**.
3. **Read + reply:** `./scripts/verify-read-and-reply.sh [timeout_sec]` (default 600). Sends a message that triggers read(memory/surf-rotation.json); asserts no "Path escapes sandbox", read returns content with "next", and assistant replies. Can take **7+ minutes** (read ~90s, assistant ~400s).

## Ollama on Hetzner (required for "I can't assist" fix)

Ollama defaults to **4096**-token context; our system prompt is much larger and gets truncated, so the model may say "I can't assist" or not use tools.

- **On the server:** Set `OLLAMA_NUM_CTX=131072` (128k) and `OLLAMA_KEEP_ALIVE=60m` before Ollama starts (e.g. systemd override).
- **From the laptop:** Run `scripts/set-ollama-context-hetzner.sh` (SSH key `~/.ssh/clawdbot_hetzner`, root). Then **restart the gateway:** `systemctl --user restart openclaw-gateway`.

Server: 167.235.238.158. Pure LLM box; Ollama only. Override in `/etc/systemd/system/ollama.service.d/num_ctx.conf`. **Model:** qwen3:8b only (no fallback). We only keep models that don't clog server size and deliver a format we can work with (raw JSON tool calls). Running `scripts/set-ollama-context-hetzner.sh` from the laptop (1) pulls qwen3:8b on the server, (2) sets 128k context and restarts Ollama, (3) restarts the gateway.

**Full files in context:** Gateway has `bootstrapMaxChars: 120000`. Script sets OLLAMA_NUM_CTX=131072 on Hetzner. If the bot says "Claude" or "Assistant" after /new, run the script and restart gateway + new session.

## Beads

Installed (`~/.local/bin/bd`, init in workspace). PATH set in `run-gateway.sh`. How to use: **AGENTS.md** (Wake-up) and **TOOLS.md** (Beads section).

## Moltbook-Wrapper

Installed at `workspace/Moltbook-Wrapper/` (venv: `Moltbook-Wrapper/.venv/`). Run from workspace: `Moltbook-Wrapper/.venv/bin/python Moltbook-Wrapper/moltbook.py agent status` or `post create ...` / `posts ...`. MOLTBOOK_* in workspace/.env (loaded by run-gateway.sh). TOOLS.md Security: Moltbook + HEARTBEAT Moltbook slot. **If exec logs "python: not found":** the heartbeat uses the full path so exec finds it: `/home/arbadacarba/clawdbot-hetzner/workspace/Moltbook-Wrapper/.venv/bin/python` (and same dir for moltbook.py).

## Single source of truth (no duplicate definitions)

**AGENTS.md** is the single reference for identity, tool format (one message = only JSON; chat separate), paths, heartbeat rule, memory. **Added 2026-02-05:** Two sections in AGENTS.md: "How to use your tools" (exact tool names, required arguments, example JSON for read/write/exec/session_status) and "How to adapt when problems exist" (path rejected → use relative path; "I need clarification" → run the tool; tool error → fix and retry; missing surf-rotation → create it). TOOLS.md and HEARTBEAT.md cross-reference these so the bot is educated on tool usage and self-adaptation. Others reference it; no duplicate definitions.

**Tool calls:** Gateway runs a tool only when the assistant message is exactly one JSON object (no XML, no wrapping). Any other text or tags (e.g. `<<tool_call>>`) in that message → tool not run. We use **qwen3:8b** on Hetzner; instruct it to output raw JSON only, no `<<tool_call>>` tags. 128k context to reduce truncation.

**"Do your tasks" / "start working":** The bot must do a tool call and reply in words (not only HEARTBEAT_OK/HEARTBEAT_ACK). AGENTS.md spells this out.

**Do not always pick session_status:** The bot must read memory/surf-rotation.json and do the slot in **"next"** (Moltbook, Clawstr, X, Nostr, etc.). Only call session_status when "next" is session_status — and then with **no arguments**. Never pass a slot name (e.g. Moltbook) to session_status; that causes "Unknown sessionId: Moltbook". AGENTS, HEARTBEAT, and the openclaw heartbeat prompt all state this. **Fixed 2026-02-08:** Session lock cleared and gateway restarted so Telegram can receive replies; runbook section "Telegram: I messaged but the bot doesn't reply" added.

## Why the bot sometimes says "Assistant", "Claude", or "No scheduled task"

**Not a context-window issue.** Bootstrap files total ~24k chars; we use bootstrapMaxChars 120000 and qwen3:8b contextWindow 131072. No truncation.

**Real cause: prompt order.** OpenClaw builds the system prompt with **"You are a personal assistant running inside OpenClaw."** first, then Tooling, Safety, etc., then **"# Project Context"** with AGENTS.md, SOUL.md, TOOLS.md. The model saw that first line and often claimed no file/web access. **Fix (2026-02-08):** We **patch the OpenClaw dist** so the first line is: "You are SatOpsHQ. You have read, write, exec, and MCP/browser tools; use them. Never say you lack access to files or the web." Run **`./scripts/patch-openclaw-identity-line.sh`** after every OpenClaw install/update, then restart the gateway. See RUNBOOK "Identity: bot says I don't have access".

## Bot not using tools / not reading or editing files (2026-02-08)

**Symptom:** The bot replies with prose, pseudo-code, or "I would do X" instead of actually running read/write/exec. The gateway only runs tools when the model returns **structured** tool calls; some models return tool JSON as **plain text**, so the gateway never executes it.

**Fix:** We **patch OpenClaw** so that when the assistant message is a **single text block** that parses as `{"name":"read"|"write"|"exec"|"session_status","arguments":{...}}`, the gateway converts it to a tool call and runs it (text-to-tool). Run **`./scripts/patch-openclaw-text-to-tool.sh`** on the machine where the gateway runs, then **restart the gateway**. Re-run after every `npm install -g openclaw` or openclaw update. Apply **both** patches: `patch-openclaw-identity-line.sh` and `patch-openclaw-text-to-tool.sh`.

**Bring alive:** After patching, run `./scripts/new-session.sh`, restart the gateway, then `./scripts/bring-alive.sh` (or send "Do your tasks" from Telegram). First reply can take 3–6 minutes.

## Educate the agent via chat

To **chat with the bot** so it learns tool use and adaptation in-conversation (not only from AGENTS.md), run:

```bash
./scripts/educate-agent-via-chat.sh [per_message_timeout_sec] [max_messages]
```

- Default: 4 messages, 420s (7 min) per message. Total ~20–30 min.
- Quick test: `./scripts/educate-agent-via-chat.sh 300 2` — 2 messages, 5 min each.
- Requires: gateway running, existing session (Control UI or Telegram). The script sends teaching messages (e.g. "Do your next slot… use read with file_path memory/surf-rotation.json…"; "Reminder: use relative paths…"; "After every tool call reply with…"; "When I say do your tasks… run the tool first"). Each message is processed by the agent; the session history then contains this education for future turns. If the run times out on a message, the user message is still in the session and the bot has seen it.

## Telegram: I messaged but the bot doesn't reply

**One session for all channels.** Telegram and webchat use the **same** session (`agent:main:main` in `sessions.json`). Replies go to whichever channel last sent a message (`lastChannel` / `deliveryContext`). So if you message from Telegram, the next reply should go to Telegram — unless a run was already in progress (e.g. heartbeat) and that run delivers elsewhere.

1. **Session lock** — If the gateway is stuck in a long run (or crashed without releasing), the session stays locked and new Telegram messages don't start a run. **Fix:** From repo root: `rm -f agents/main/sessions/<sessionId>.jsonl.lock` then `systemctl --user restart openclaw-gateway`. Get `<sessionId>` from `jq -r '.["agent:main:main"].sessionId' agents/main/sessions/sessions.json`.
2. **Reply goes to wrong place** — If the run was started by heartbeat (or CLI with `--channel webchat`), the reply may go to that channel, not Telegram. After clearing the lock and restarting, send **from Telegram again** so the next run is tied to Telegram and the reply comes back there.
3. **Run very slow or timeout** — First reply can take 5–10 min (Hetzner LLM). If the run times out, the lock may stay; clear it and restart as above.
4. **Confirm delivery target** — `jq '.["agent:main:main"] | {lastChannel, lastTo, deliveryContext}' agents/main/sessions/sessions.json` should show `telegram` and `telegram:YOUR_CHAT_ID` when you last messaged from Telegram.

## After sending a nudge — check outcome

1. Session: `agents/main/sessions/sessions.json` → `.["agent:main:main"].sessionId` and `.sessionFile`.
2. Poll that session `.jsonl` until new assistant or tool_result (or timeout).
3. Note: which tool ran, success/fail, final reply (NO_REPLY vs text).
4. Path errors → use laptop path in prompts. Empty sessions_list → use session_status or read HEARTBEAT/TOOLS.

## Not answering after gateway restart + new session

**Right-now checklist:**  
1. **Wait 5–6 minutes** — first reply on a new session is often 2–6+ min (cold qwen3:8b + big bootstrap).  
2. **Check gateway journal:** `journalctl --user -u openclaw-gateway -n 80` — look for `embedded run timeout`, `read tool called without path`, `exec failed`, or `lane wait exceeded`.  
3. **Check current session file:** `agents/main/sessions/sessions.json` → `sessionId`; then `tail -5 agents/main/sessions/<sessionId>.jsonl`. If you only see "New session started" and no user message line, the message may not have been written yet — send again or check Telegram.  
4. **Ollama reachable?** `curl -s -o /dev/null -w "%{http_code}" http://167.235.238.158:11434/api/tags` → should be 200.  
5. **Stale lock?** If send fails with "session file locked", and no run is in progress, remove the `.jsonl.lock` for that session (or the orphan session, e.g. `100198d6-...`) and retry.

- **Cause 1 — Restart killed the run:** If you start a new session and send a message, then restart the gateway (e.g. to pick up config change), the in-flight agent run is aborted. The user never gets a reply. **Fix:** Restart the gateway *before* opening a new session and sending; or wait for the current run to finish before restarting.
- **Cause 2 — First reply is very slow:** Remote qwen3:8b on Hetzner with 128k context and a large bootstrap can take **2–6+ minutes** for the first response (cold model, big prompt). The UI may look idle. **Fix:** Wait at least 5–6 minutes; we set `agents.defaults.timeoutSeconds: 900` (15 min) in openclaw.json so slow first turns don’t hit the default 10 min limit.
- **Cause 3 — "fetch failed":** A follow-up request (e.g. next turn or heartbeat) can fail with `TypeError: fetch failed` (network/Ollama). Check gateway log `/tmp/openclaw/openclaw-*.log` and that Hetzner Ollama is reachable (`curl -s http://167.235.238.158:11434/api/tags`).
- **Cause 4 — Run timed out:** Logs show `embedded run timeout` (10 or 15 min). No reply is sent. Retry with a short message; avoid restarting during a run.
- **Cause 5 — "read tool called without path":** The model sent a read tool call with no `file_path`. The run can stall or fail. AGENTS/heartbeat must say: for read always include `file_path`, e.g. `memory/surf-rotation.json`.

## Exec: run on gateway

If the bot says "the requested host (node) isn't allowed", exec is trying to run on a "node" target. Set **tools.exec.host** to **"gateway"** in openclaw.json so exec runs on the machine where the gateway runs (your laptop). No node or sandbox required.

## Sandbox / "Path escapes sandbox"

**Even with sandbox.mode "off",** the read/write tool rejects absolute paths. Always use **relative** paths: `memory/surf-rotation.json`, `AGENTS.md`. Never `/home/` or any username (heart, arbadacarba). We patch OpenClaw so absolute paths that resolve inside workspace also work on the gateway host; the model must still prefer relative paths. **Fixed 2026-02-07:** Nudge script, BOOTSTRAP, IDENTITY, and this doc no longer mention absolute paths; AGENTS.md has "never ask for clarification for HEARTBEAT/slots" so the bot executes the slot instead of replying with "I need clarification". **Verify scripts:** They use `openclaw agent --session-id ... --message ...` which runs the agent in-process; the session file is only updated when the run completes. **verify-read-and-reply.sh** now sends a message that explicitly triggers the read tool (model often ignores natural-language "read file"); it waits for the agent process to finish then checks for read toolResult and assistant reply. **Fixed 2026-02-08:** tools.deny includes memory_search, memory_get, sessions_spawn so the bot uses read for files and doesn't call forbidden tools. All three scripts (verify-hetzner-setup, verify-agent-responds, verify-read-and-reply) pass when run in sequence. So the configured LLM (e.g. Hetzner Ollama) must be reachable and respond within the script timeout, or the script will fail with "no new lines". If that happens, check from this host: curl the LLM base URL (e.g. openclaw.json models.providers.ollama-hetzner.baseUrl) and ensure the gateway can reach it. **Quick verification checklist:** Gateway running (`pgrep -f openclaw-gateway`), LLM reachable (`curl -s -o /dev/null -w "%{http_code}" "$(jq -r '.models.providers["ollama-hetzner"].baseUrl' openclaw.json | sed 's|/v1$||')/api/tags"` → 200), surf-rotation exists (`workspace/memory/surf-rotation.json`), docs use only relative paths (AGENTS, HEARTBEAT, BOOTSTRAP, nudge). When the **gateway** runs the agent (Telegram/Web UI/heartbeat), the bot has the `read` tool and has successfully used `memory/surf-rotation.json` (see session d2673981 transcript).

- **Patch (run on the machine where the gateway runs):** `./scripts/patch-openclaw-accept-absolute-workspace-paths.sh`  
  It edits `node_modules/openclaw/dist/reply-9Z2moGyL.js` to try `realpathSync` and allow the path if it’s under the workspace root. Re-run after `npm install openclaw` or when moving to another machine.
- **Config:** workspace and skills use **`~/clawdbot-hetzner/...`** so the same openclaw.json works for any user (e.g. heart vs arbadacarba). Repo must be at `~/clawdbot-hetzner` on the gateway machine.

## Gibberish / random words (e.g. "ערוץ", "cricket", "ministry")

qwen3:8b sometimes outputs stray single words (English or other languages) as separate messages or before the real reply. That's a model quirk (token sampling); retry or ignore. We do not use qwen2.5-coder (poor JSON delivery). AGENTS explicitly forbids "friendly AI assistant" and invented file names; use only workspace-relative paths and real file names.

## One-off notes

- **Gateway restart:** `systemctl --user restart openclaw-gateway`.
- **Session lock:** If send fails with "session file locked", check for orphan `openclaw-agent`; kill if needed, remove `.jsonl.lock`, retry.
- **Path:** Workspace is `/home/arbadacarba/clawdbot-hetzner/workspace`; SOUL/HEARTBEAT/AGENTS state this. For HEARTBEAT/TOOLS tasks use **session_status** or **read**, not sessions_list.

Past fixes (path, HEARTBEAT_OK, tool-call format, sessions_send, etc.) are in SOUL.md, AGENTS.md, HEARTBEAT.md; see git history for context.
