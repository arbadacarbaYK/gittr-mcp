# Changelog

## Unreleased

### Security
- Pin `zod` to **4.6.7** in both `dependencies` and `overrides`, so `@anthropic-ai/mcpb` cannot keep `zod@3.25.76`. CVE-2023-54404 / GHSA-mrhx-c7xc-m3w5 covers every Zod release before 4.6.6. The MCP server does not import Zod; the packaging tool does, for local manifest files.
- Refuse to start on Node older than 22.23.4, 24.22.1, or 26.12.1. Node 18 and 20 have no patch for the October 2026 certificate and Brotli bugs.

### Docs
- When a forge returns 403 (account suspended), keep reading the gittr copy and open new Nostr issues and pull requests. The next Push does not drop `source`. `mirrorRepo` / `importRemoteToBridge` copy the URL you pass onto gittr and replace branches, so they are not a way to change source. The website sidebar (**If this git host is gone**) is the only owner action: keep the Nostr copy without fetching, or follow another public forge only when it already has the same commits. Do not follow a matching `ls-remote` with `mirrorRepo`. Guide: [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md).

## 1.0.12 (2026-10-13)

### Fixes
- **`mirrorRepo` keeps an existing repo card.** A second call no longer replaces the name, description, and web links with the repo name and the GitHub URL. Pass `name`, `description`, or `web` to change them. Maintainers, pay-to-push, and private/public flags stay too.
- **`HEAD` follows the forge default branch.** `gh-pages` no longer wins just because it sorts before `main`. `publishRepoState` takes an optional `branch`.
- **`publishRepoAnnouncement` and `publishRepoState` load `.nostr-keys.json`** the same way the other tools do. The private key is no longer required on the tool call.

## 1.0.11 (2026-10-13)

### Fixes
- **Issues and pull requests match the website tabs.** `listIssues` / `listPRs` include GitHub or Codeberg/Gitea tickets when the repo source says so, as separate rows from Nostr. `listIssueComments` reads forge comments for `issue-N` and does not post them back.

### Docs
- Agent map is [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md): `mirrorRepo` for a forge repo, `pushToBridge` only for file edits.
- The parity doc no longer calls the gittr website “ngit”. ngit is Dan Conway’s client and GRASP relays (`relay.ngit.dev`, `ngit.danconwaydev.com`).

## 1.0.10 (2026-10-13)

### Fixes
- **`mirrorRepo` matches a website Push of a GitHub repo.** It updates the git server to the forge commits (history stays, a second call refreshes), announces the same git servers, and publishes the branch tips. `importRemoteToBridge` does that git update when the owner key is available. `pushToBridge` is still a snapshot and drops that history.
- **Same clone list as the website:** `publishRepoAnnouncement` always adds gittr, ngit, gitnostr, shakespeare, and danconway. A forge URL in `clone` is moved to `source`. `publishRepoState` is sent to those same git relays.
- **Windows keys file:** `loadCredentials()` also reads `.nostr-keys.json` next to `server.js`, uses the OS home directory when `HOME` is unset, and strips a UTF-8 BOM before parsing.
- **Import is not a refetch:** tool text no longer calls `importRemoteToBridge` a refetch. `pushToBridge` is described as a snapshot that replaces the branch.

## 1.0.9 (2026-10-07)

### Security
- Upgrade `@modelcontextprotocol/sdk` from 1.30.0 to **^1.32.1** so the lockfile is outside CVE-2026-104850 (GHSA-6qxp-vccf-f47h). That bug lets an MCP **client** send OAuth credentials to an authorization server named by a malicious MCP server. gittr-mcp is a stdio **server** and does not use that client. See `docs/SECURITY-ADVISORIES.md`.
- Raise override floors that the SDK upgrade still left inside published ranges: `fast-uri@3.1.8`, `proxy-addr@2.0.8`, `brace-expansion@5.0.12`, `ip-address@10.7.3`.

### Features
- **NIP-82 announce matches gittr’s zapstore.yaml screenshots:** `announceSoftwareFromForgeRelease` reads `GET /api/repo/zapstore-yaml` and copies `images:` (plus optional extra HTTPS URLs) onto kind **32267**. Official gittr uses `space.gittr.app`, the dark-plate bird icon, gittr.space screenshots, and may pin the APK to `blossom.gittr.space`. Other apps still cannot pin Apps to Pages Blossom.
- **Pages d-tag length:** `publishNostrPages` clips the site name to **1–13** characters (same DNS-label rule as gittr Pages).

## 1.0.8 (2026-09-09)

### Security
- Override MCP SDK transitives that OSV flagged on the gittr Dependencies tab: `fast-uri@3.1.7`, `hono@4.13.7`, `qs@6.16.0`. gittr-mcp is still stdio-only; hono/qs are unused HTTP surfaces, but `fast-uri` is loaded via AJV. See `docs/SECURITY-ADVISORIES.md`.

## 1.0.7 (2026-09-09)

### Fixes
- MCP initialize version now comes from `package.json` instead of a hardcoded `1.0.0`, so agents see the same release as `server.json` / the `.mcpb` manifest.

## 1.0.6 (2026-09-06)

### Features
- **NIP-82 announce matches gittr:** any announceable binary (not APK-only), optional `tag`, sibling assets on the same tag, optional `pinToBlossom` (primal/ditto/haven; never `blossom.gittr.space`). New `listForgeReleases` for the website Releases-tab listing.
- **`publishNostrPages`:** NIP-5A kind **35128** + Blossom proxy upload (kind **24242**), same path as gittr Pages.
- **`auditRepoDependencies`:** parse manifests from the bridge tree and call `POST /api/security/audit` (OSV.dev).
- **NIP-22 comments on issues/PRs:** `listIssueComments`, `createIssueComment`, `listPRComments`, `createPRComment` (kind **1111**). Additive only — bounty tools (kind **9806**) and create/list/close issue & PR flows are unchanged.

### Fixes
- `createRepo` / `mirrorRepo` clone set no longer advertises `relay.gittr.space` (Pyramid is wss only; git bytes live on `git.gittr.space`), matching gittr UI Push.

### Documentation
- Added MIT `LICENSE` (package.json already declared MIT; Glama could not detect it), `Dockerfile` + `.dockerignore` for registry introspection, and `glama.json` so the [Glama listing](https://glama.ai/mcp/servers/arbadacarbaYK/gittr-mcp) can be claimed.

### Security
- Documented false-positive triage for inbound MCP SDK advisories **CVE-2026-25536** / **GHSA-345p-7cg4-v4c7** and **CVE-2026-0621** / **GHSA-8r9q-7v3j-jr4g**: gittr-mcp is stdio + tools only on `@modelcontextprotocol/sdk@^1.30.0` (see `docs/SECURITY-ADVISORIES.md`).
- Added `tests/mcp-sdk-reachability.test.js` so CI fails if Streamable HTTP / resource templates appear or the SDK drops below the patched floor.

## 1.0.5 (2026-08-09)

### Fixes
- `pushToBridge` defaults `commitMessage` to `Push from gittr (yy-mm-dd hh:mm)` UTC when omitted (matches gittr bridge). Custom messages still pass through.

## 1.0.4 (2026-08-09)

### Features
- `pushToBridge` accepts optional `deletedPaths` (file or folder) and `allowTreeShrink`, matching gittr UI folder delete + bridge push. Empty `files` is allowed when only deleting. MCP tool schema updated; `createRepo` forwards deletes.

### Documentation
- Updated MCP-GITTR-PARITY, DEVELOPER, SIGNING-GUIDE, and AGENT-QUICKSTART for delete parity.

## 1.0.2 (2026-07-12)

### Features
- New `setupTestKeypair` tool: consent-gated creation of a disposable test identity written to `.nostr-keys.json` (`generated: true`, mode 600). Requires `confirm: true`; never overwrites existing credentials without `force: true`; never returns the `nsec` to the agent.
- `describeAgentAuth` now guides the agent when unconfigured (`askUser` prompt: real nsec vs. test keypair) and flags an active generated key (`generatedTestKey` + reminder to swap in the real key).
- All "Private key required" errors now include the full recovery path (pass privkey / keys file / consent-gated test keypair).

### Tests
- Added `tests/setup-test-keypair.test.js` covering the ask→confirm→create→refuse-overwrite→force flow in an isolated temp HOME.

## 1.0.1 (2026-02-16)

### Features
- Added 13 new functions for gittr.space feature parity (32 total tools)
- Enhanced credential loading (nsec + secretKey formats)
- Fixed createIssue, createBounty, listBounties, createPR, listPRs
- Added clone URL fix (git.gittr.space as primary)
- Improved error handling and logging

### Documentation
- Added OPENCLAW-INTEGRATION.md for easy setup
- Enhanced README with agent workflows
- Added agent reference documentation

### Fixes
- Fixed PR creation flow (state events)
- Improved bridge API vs Nostr sync states
- Enhanced file operations for both bridge and GRASP states

## 1.0.0 (2026-02-10)

Initial release with core gittr.space MCP functionality.
