# MCP security & related learnings (for gittr-mcp and agent work)

**Purpose:** When building or promoting gittr-mcp (or any MCP), apply these. The bot should learn from them and improve gittr-mcp’s security posture over time. Sources linked at the end.

---

## 1. MCP security — agents that build MCPs (VentureBeat, Jan 2026)

**Problem:** MCP shipped without mandatory authentication. Many MCP servers run with no auth; OpenClaw/ClawdBot-style agents that run entirely on MCP can expose the full MCP attack surface (e.g. on a VPS with open ports). Research: 10 MCP plugins → ~92% probability of exploitation; 1,862+ MCP servers found exposed with no authentication.

**Actions for anyone building MCPs (including gittr-mcp):**

- **Treat authentication as mandatory.** MCP spec recommends OAuth 2.1; SDKs often have no built-in auth. Every MCP server that touches production or user data needs auth enforced at deployment, not after an incident.
- **Restrict network exposure.** Bind MCP servers to localhost unless remote access is explicitly required and authenticated. Avoid exposing MCP ports to the internet by default.
- **Assume prompt injection will succeed.** MCP servers inherit the blast radius of the tools they wrap (e.g. git push, cloud APIs). Design access controls assuming the agent could be compromised.
- **Force human approval for high-risk actions.** Require explicit confirmation before agents push to main, delete repos, or access sensitive keys. Treat the agent like a fast but literal junior employee.
- **Inventory MCP exposure.** Know which MCP servers you run and whether they are reachable from the network; don’t rely on generic process monitoring to flag MCP.

**Relevant CVEs (learn from, don’t repeat):** Unauthenticated MCP Inspector (CVE-2025-49596), command injection in mcp-remote (CVE-2025-6514), unauthenticated WebSocket in Claude Code extensions (CVE-2025-52882). Other studies: 43% of MCP implementations had command injection; 30% unrestricted URL fetch; 22% file leakage outside intended dirs.

**Source:** [VentureBeat: MCP shipped without authentication, ClawdBot shows why that’s a problem](https://venturebeat.com/security/mcp-shipped-without-authentication-clawdbot-shows-why-thats-a-problem)

---

## 2. Confidential computing (Nostr long-form, aljaz)

**Idea:** “Trust me bro” is replaceable by verifiable execution. Confidential computing (e.g. AMD SEV-SNP, Intel TDX) gives encrypted VMs where not even the host/cloud can read memory. Remote attestation lets clients verify that a specific version of software (e.g. a Cashu mint, Lightning node) is running in a real TEE — not because the operator said so, but because cryptography proves it.

**Relevance for agents/infra:** Running sensitive services (mints, key storage, agent backends) in TEEs with attestation improves trust. For gittr/gittr-mcp: if we ever run bridge or signing services in the cloud, consider confidential containers + attestation so users can verify what code is running.

**Source:** [The end of "trust me bro" – confidential computing for everyone](https://nostr.eu/naddr1qvzqqqr4gupzpml96ysd7rxzjra8fpe8ldz6cjru4tf5d48j9yatq60g7q0u2xvpqythwumn8ghj7un9d3shjtnswf5k6ctv9ehx2ap0qyv8wumn8ghj7un9d3shjtnyd9ek7cn90yhxgetk9uqr6argv5kk2mny94hkvtt5wf6hxapdd4jj6cnjdukj6ttrdahxv6tyv4h8g6tpdskkxmmdwp6hg6twvukkvmmj94jhvetj09hkueg4kmugx) (Nostr kind 30023). See also [Confidential Containers](https://confidentialcontainers.org/), [Nutshell TEE (Azure)](https://github.com/aljazceru/nutshell-azure-tee).

---

## 3. AI-generated code and delivery pipelines (Galo Navarro, varoa.net)

**Idea:** AI increases the supply of code; the bottleneck is delivery (build, test, deploy). Scaling by “more defensive testing” compounds complexity. Better: trim defensive testing to diminishing returns, minimize dev/test/staging envs, measure outcomes and SLOs rather than coverage counts, design for high rate of change and failure, treat security as continuous probing.

**Relevance for gittr-mcp:** When we add features or accept agent-generated patches: keep the pipeline simple, tests fast and focused, avoid building a “Rube Goldberg” delivery stack. Prefer shipping and learning in production (with guardrails) over heavy pre-production gates.

**Source:** [AI-generated code will choke delivery pipelines](https://varoa.net/2025/04/07/ai-generated-code.html)

---

## 4. OpenClaw / “I ship code I don’t read” (Pragmatic Engineer, Peter Steinberger)

**Ideas:** Close the loop — agents should verify their own work (compile, lint, run tests). PRs become “prompt requests”; architecture discussions matter more than line-by-line code review when working with agents. Local CI can beat remote CI for agent-driven dev (faster feedback). Under-prompt sometimes to discover unexpected solutions. Focus on outcomes and system design; most code is boring data transformation.

**Relevance for us:** When we work on gittr-mcp with agents (or as an agent): plan well, let agents run tests locally, care about architecture and boundaries (e.g. what the MCP is allowed to do), and keep security in the design (see §1) rather than only in review.

**Source:** [The creator of Clawd: "I ship code I don't read"](https://newsletter.pragmaticengineer.com/p/the-creator-of-clawd-i-ship-code) (Pragmatic Engineer, Jan 2026).

---

## How to use this

- **gittr-mcp:** Before adding features or publishing, re-read §1. Add auth/network/risk notes to the gittr-mcp repo (e.g. README or SECURITY.md) so adopters know how to run it safely. When you do a reflection cycle, consider one concrete security improvement (e.g. “document: bind to localhost unless auth is enabled”).
- **Reflections:** Append to `workspace/memory/reflections.md` when you apply one of these (e.g. “Added MCP security checklist to gittr-mcp README”).
- **Links for deeper learning:** Open the URLs above when you want to re-read or go deeper; this file is the extracted, actionable summary.
