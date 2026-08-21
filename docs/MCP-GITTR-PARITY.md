# gittr-mcp vs gittr.space (parity audit)

This document tracks how MCP tools map to the **current** gittr web app (`ngit` UI). Updated after the NIP-25 star / NIP-51 watch changes.

## Aligned (safe for agents)

| Workflow | MCP tools | gittr today |
|----------|-----------|-------------|
| Push files / folder delete | `pushToBridge` (`files`, optional `deletedPaths`, `allowTreeShrink`) | NIP-98 challenge + `POST /api/nostr/repo/push` (UI sends `deletedPaths` + `allowTreeShrink` on final chunk) |
| Publish repo | `createRepo`, `publishRepoAnnouncement`, `publishRepoState` | kinds **30617** + **30618**; **`clone[]` = full GRASP push set** (`buildFullGraspCloneUrls` — not capped relay hosts); forge URL in `source` only (`forkedFrom` only for a real parent) |
| Soft-delete repo | `softDeleteRepo` / `deleteRepo` | Soft-deleted **30617** + NIP-09 kind **5**, **and** `POST /api/nostr/repo/event` so the bridge wipes the bare tree (Settings → Delete parity) |
| Issues | `createIssue`, `listIssues`, `getIssueById` | kind **1621** |
| Issue/PR comments | `listIssueComments`, `createIssueComment`, `listPRComments`, `createPRComment` | NIP-22 kind **1111** (`E`/`K`/`P` + `e`/`k`/`p`, optional `repo`) — same shape as gittr issue detail |
| Close/reopen issue (Nostr) | `closeIssue`, `reopenIssue` | kinds **1632** / **1630** — **MCP publishes; web issue detail often only updates localStorage** |
| PRs | `createPR`, `listPRs`, `updatePullRequest`, `getPullRequestById` | kinds **1618** / **1619** |
| Merge PR (git + bridge) | `mergePullRequest` | git merge + bridge push + **30618** + **1631** |
| Star | `starRepo`, `unstarRepo`, `listStars` | NIP-25 kind **7** on **30617** event id (`e`, `k`, `+`/`-`) |
| Watch | `watchRepo`, `unwatchRepo`, `listWatchedRepos` | NIP-51 kind **10018** full `a` list |
| Pay-to-push | `getPushPaywallStatus`, `createPushPaywallIntent`, `syncRepoPushPolicy` | `push_cost_sats` on **30617** + bridge SQLite |
| Bounties | `createBountyInvoice`, `publishBountyToNostr`, `listBountiesForIssue`, … | kind **9806** + `/api/bounty/*` (unchanged by comment tools) |
| Bridge reads | `bridgeListFiles`, `bridgeGetFileContent`, `bridgeListRefs`, `bridgeListCommits` | same HTTP API as the site |
| Import / mirror | `importRemoteToBridge`, `mirrorRepo` | `/api/nostr/repo/clone`, GitHub import patterns. Mirror sets `source`/`web` from any HTTPS owner/repo URL (GitHub, GitLab, Codeberg, Forgejo). `forkedFrom` only for a real parent. **Foreign GRASP hosts** (ngit/shakespeare/…) are **not** permanently mirrored onto `git.gittr.space` — clone API rejects them; include `git.gittr.space` in `clone[]` to host here. |
| Reverse forge → Nostr | `findReposBySource` (alias `findReposByGithub`) — exact forge URL on `source`/`forkedFrom`, returns npub | `GET/POST /api/nostr/repos-by-github?source=` |
| Maintainers | `addCollaborator` | republish **30617** with `maintainers` tag (owner must sign) |
| App announce (Zapstore) | `announceSoftwareFromForgeRelease`, `fetchForgeReleases`, `deleteSoftwareAnnounce` | NIP-82 kinds **32267** / **30063** / **3063** from forge Release APK (Code sidebar **Announce app**) |

## Partial / caveats

| Topic | MCP | gittr UI gap |
|-------|-----|----------------|
| **Issue close** | Publishes **1632** to relays | Issue page may not publish status yet — list view can still show relay status |
| **PR update (1619)** | `updatePullRequest` supported | PR detail UI may not publish **1619** yet |
| **Fork** | `forkRepo` imports clone + `forkedFrom` on **30617** | UI fork flow also sets local `forkedFrom` before publish |
| **Trending** | `getTrendingRepos` = recent **30617** only | Not real engagement ranking |
| **Contributors** | `getRepoContributors` from issues/PRs on relays | UI also uses local `contributors[]` weights |
| **Nostr Pages** | no MCP tool | NIP-5A kind **35128** + Blossom — use web UI or separate publish script |

## Not the same as the website

| MCP tool | Reality on gittr.space |
|----------|------------------------|
| `createRelease` | **Unsupported** for UI release notes — use `announceSoftwareFromForgeRelease` for Zapstore/NIP-82, or git tags + `publishRepoState` |
| `getFile` | Bridge first, then **hardcoded** GRASP `/raw/` hosts — **not** full Code-tab parity (no 30617 `clone[]` order, no `/api/git/repo-files` for home Freebox/NAS). Prefer `bridgeListFiles` / `bridgeGetFileContent` after `importRemoteToBridge` / `mirrorRepo`, or resolve clone URLs from **30617** and call gittr HTTP APIs. See [FILE_FETCHING_INSIGHTS.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/FILE_FETCHING_INSIGHTS.md). |
| `listReleases` | Returns **git tags** from bridge `refs` only — **not** the website Releases tab (forge notes + NIP-82/Blossom `30063`/`3063`) and **not** Zapstore. For NIP-82 announce use `announceSoftwareFromForgeRelease` / `fetchForgeReleases`. |
| `getTrendingRepos` | Heuristic only |

## Recommended agent flows

1. **New repo:** `createRepo` (or push + publish + state).
2. **Bug fix:** `createIssue` → branch push → `createPR` or `createPRViaGittrCLI` → `mergePullRequest`.
3. **Star vs watch:** `starRepo` for appreciation; `watchRepo` for follow list (**10018**).
4. **Read code:** Prefer `bridgeGetFileContent` / `bridgeListFiles` after the repo is on the bridge (`importRemoteToBridge` / `mirrorRepo` / push). `getFile` is a convenience (bridge, then a few hardcoded GRASP raw URLs) — it does **not** follow the web Code tab’s `clone[]` / `repo-files` rules (self-hosted Freebox, non-GRASP before GRASP, EOSE inference). See gittr [FILE_FETCHING_INSIGHTS.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/FILE_FETCHING_INSIGHTS.md).
5. **Announce Android app:** forge Release with `.apk` → `announceSoftwareFromForgeRelease({ sourceUrl })` (or `fetchForgeReleases` with `hash:true` then `publishSoftwareAnnounce`).

See also: [NIP25_STARS_NIP51_FOLLOWING.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/NIP25_STARS_NIP51_FOLLOWING.md) in the gittr repo (ngit).
