# Shannon (KeygraphHQ) repo — security check

**Date:** 2026-02-06  
**Repo:** https://github.com/KeygraphHQ/shannon  
**Thread that prompted check:** https://threadreaderapp.com/thread/2019608142884016638.html (@chiefofautism — “CLAUDE CODE but for HACKING”)

## What we checked

1. **Does it do what it says?** — Yes. Autonomous AI pentester: reads your repo, runs recon (nmap, subfinder, WhatWeb, schemathesis), runs Claude via Anthropic SDK with MCP (Playwright for browser exploitation), produces local reports. Architecture (recon → vuln analysis → exploit → report) and docs match.
2. **Malicious patterns (from OSM / TOOLS.md red flags):**
   - No `curl | bash` or `wget | sh` in main `shannon` CLI script.
   - No base64-decode-pipe-to-shell.
   - No download of exe/zip from GitHub for “auth” or “required dependency”.
   - No raw IP (e.g. 91.92.242.30) or suspicious C2-style URLs.
   - No `xattr -c` (macOS quarantine bypass).
   - No “AuthTool” / “openclawcli.zip” style staged payload.
3. **Dependencies:** `package.json` uses normal npm deps (@anthropic-ai/claude-agent-sdk, Temporal, zx, etc.). Dockerfile uses Chainguard Wolfi; installs subfinder (go install), WhatWeb (git clone from GitHub), schemathesis (pip), nmap (apk) — all from standard sources.
4. **Where does data go?** In `src/ai/claude-executor.ts`, execution uses `query()` from `@anthropic-ai/claude-agent-sdk`; API key is user’s `ANTHROPIC_API_KEY` (or router). Output is written to local `sourceDir` (audit logs, deliverables, error logs). No code path found that sends repo content or reports to Keygraph or any third party; optional router is user-configured (OpenAI/OpenRouter). To use it with the model on Hetzner this would have to be adapted.
5. **Vendor:** Keygraph (keygraph.io) — commercial security/compliance platform; Shannon Lite is AGPL-3.0. Not in our blocked-authors list; LinkedIn launch, 6k+ stars.

## Conclusion

- **No sneaky stuff found** in the areas we reviewed (main CLI, Docker, AI execution path, constants). Repo appears to do what it claims and to send data only to Anthropic (or user-configured router) and to local disk.
- **Caveats:** (1) We didn’t grep every single file for `fetch`/`keygraph`/telemetry; a full audit would. (2) Shannon **actively runs exploits** against the target app — use only on apps you own or have authorization to test (staging/dev, not production). (3) AGPL: if you offer Shannon as a service, you may have to share modifications.

## How to use Shannon without causing trouble

**Why this matters:** People have faced legal action (including prison) for running pentests even on systems they were developing — e.g. testing their own page. Hosting providers and networks often auto-report “attack” traffic (scanning, exploit attempts). So: run Shannon in a way that doesn’t leak your real identity, machine, or credentials, and that doesn’t look like an attack from your main IP or production environment.

**What to do (cypherpunky, thoughtful):**

1. **Isolated environment** — Run Shannon in an environment separate from your main OS and daily machine: dedicated VM, throwaway VPS, or Docker on a host that has no access to your real credentials or repo paths. Don’t mount your real home dir or production secrets into the Shannon run; use a clean clone and a test DB only.
2. **No credential or path leak** — Give Shannon only the target app’s repo copy and a test/staging URL. No `.env` or keys from production; no paths that reveal your username, hostname, IP, networkname or other machines connected to it. Assume anything in the repo or config could end up in logs or prompts.
3. **IP and provider reporting** — Scanning and exploitation can trigger abuse reports. Prefer one or more of: (a) run Shannon from a network that isn’t your main/home IP (e.g. separate VPS, VPN, or test-only connection), (b) point it only at targets you control (localhost, staging, or a test instance you own), (c) if you must test something shared, get explicit written authorization and use a clear test scope so it’s obviously authorized security work.
4. **Only test what you’re allowed to** — Your own apps and sites: fine, as long as the environment is isolated and the target is clearly dev/staging. Anyone else’s: only with written permission and a defined scope. When in doubt, don’t point Shannon at it.
5. **When suggesting or using Shannon** — Remind the human and yourself: isolate the run, no production paths/secrets, think about IP and reporting, and only test our own shit (or explicitly authorized targets). Goal: harden our stuff without getting the human or the machine in trouble.

## If you add Shannon to the knowledge base

- Treat as a **reference tool** (autonomous pentesting), not an OpenClaw skill. Run in isolated Docker; only point at authorized targets.
- Optional: add to TOOLS.md Ecosystem with a one-line note and link to this memo.
