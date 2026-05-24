# gittr-mcp vs gittr.space (parity audit)

This document tracks how MCP tools map to the **current** gittr web app (`ngit` UI). Updated after the NIP-25 star / NIP-51 watch changes.

## Aligned (safe for agents)

| Workflow | MCP tools | gittr today |
|----------|-----------|-------------|
| Push files | `pushToBridge` | NIP-98 challenge + `POST /api/nostr/repo/push` |
| Publish repo | `createRepo`, `publishRepoAnnouncement`, `publishRepoState` | kinds **30617** + **30618**, `git.gittr.space` clone URLs |
| Issues | `createIssue`, `listIssues`, `getIssueById` | kind **1621** |
| Close/reopen issue (Nostr) | `closeIssue`, `reopenIssue` | kinds **1632** / **1630** — **MCP publishes; web issue detail often only updates localStorage** |
| PRs | `createPR`, `listPRs`, `updatePullRequest`, `getPullRequestById` | kinds **1618** / **1619** |
| Merge PR (git + bridge) | `mergePullRequest` | git merge + bridge push + **30618** + **1631** |
| Star | `starRepo`, `unstarRepo`, `listStars` | NIP-25 kind **7** on **30617** event id (`e`, `k`, `+`/`-`) |
| Watch | `watchRepo`, `unwatchRepo`, `listWatchedRepos` | NIP-51 kind **10018** full `a` list |
| Pay-to-push | `getPushPaywallStatus`, `createPushPaywallIntent`, `syncRepoPushPolicy` | `push_cost_sats` on **30617** + bridge SQLite |
| Bounties | `createBountyInvoice`, `publishBountyToNostr`, `listBountiesForIssue`, … | kind **9806** + `/api/bounty/*` |
| Bridge reads | `bridgeListFiles`, `bridgeGetFileContent`, `bridgeListRefs`, `bridgeListCommits` | same HTTP API as the site |
| Import / mirror | `importRemoteToBridge`, `mirrorRepo` | `/api/nostr/repo/clone`, GitHub import patterns |
| Maintainers | `addCollaborator` | republish **30617** with `maintainers` tag (owner must sign) |

## Partial / caveats

| Topic | MCP | gittr UI gap |
|-------|-----|----------------|
| **Issue close** | Publishes **1632** to relays | Issue page may not publish status yet — list view can still show relay status |
| **PR update (1619)** | `updatePullRequest` supported | PR detail UI may not publish **1619** yet |
| **Fork** | `forkRepo` imports clone + `forkedFrom` on **30617** | UI fork flow also sets local `forkedFrom` before publish |
| **Trending** | `getTrendingRepos` = recent **30617** only | Not real engagement ranking |
| **Contributors** | `getRepoContributors` from issues/PRs on relays | UI also uses local `contributors[]` weights |
| **gittr Pages** | no MCP tool | NIP-5A kind **35128** + Blossom — use web UI or separate publish script |

## Not the same as the website

| MCP tool | Reality on gittr.space |
|----------|------------------------|
| `createRelease` | **Unsupported** — releases live in browser storage until owner **Push to Nostr** embeds them in **30617** |
| `listReleases` | Returns **git tags** from bridge `refs`, not UI release notes |
| `getTrendingRepos` | Heuristic only |

## Recommended agent flows

1. **New repo:** `createRepo` (or push + publish + state).
2. **Bug fix:** `createIssue` → branch push → `createPR` or `createPRViaGittrCLI` → `mergePullRequest`.
3. **Star vs watch:** `starRepo` for appreciation; `watchRepo` for follow list (**10018**).
4. **Read code:** `bridgeGetFileContent` / `getFile` (bridge first, then GRASP raw URLs).

See also: [NIP25_STARS_NIP51_FOLLOWING.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/NIP25_STARS_NIP51_FOLLOWING.md) in the gittr repo (ngit).
