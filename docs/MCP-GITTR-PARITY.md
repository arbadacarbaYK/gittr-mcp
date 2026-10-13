# gittr-mcp vs gittr.space (parity audit)

This document tracks how MCP tools map to the **current** gittr website. Updated after the NIP-25 star / NIP-51 watch changes.

## Aligned (safe for agents)

| Workflow | MCP tools | gittr today |
|----------|-----------|-------------|
| Push files / folder delete | `pushToBridge` (`files`, optional `deletedPaths`, `allowTreeShrink`) | NIP-98 challenge + `POST /api/nostr/repo/push` (UI sends `deletedPaths` + `allowTreeShrink` on final chunk) |
| Publish repo | `createRepo`, `publishRepoAnnouncement`, `publishRepoState` | kinds **30617** + **30618**; **`clone[]` is always the website push set** (`buildFullGraspCloneUrls`: gittr, ngit, gitnostr, shakespeare, danconway — npub paths). A forge URL stays in `source` only. `mirrorRepo` syncs the forge commits onto the bridge before that announcement. |
| Soft-delete repo | `softDeleteRepo` / `deleteRepo` | Soft-deleted **30617** + NIP-09 kind **5**, **and** `POST /api/nostr/repo/event` so the bridge wipes the bare tree (Settings → Delete parity) |
| Issues | `listIssues`, `getIssueById` | Same list as the Issues tab: Nostr kind **1621** rows **and** GitHub or Codeberg/Gitea `issue-N` rows when the repo `source` says so. They stay **separate** rows (a Nostr issue is not merged into GitHub `#N`). GitLab sources stay Nostr-only. `getIssueById` accepts a Nostr id, `issue-N`, or the forge number (`ownerPubkey` + `repoId` required for the forge). |
| Issue/PR comments | `listIssueComments`, `createIssueComment`, `listPRComments`, `createPRComment` | Nostr kind **1111** on a 64-character id. `issue-N` / `pr-N` (with `ownerPubkey` and `repoId`) returns the forge conversation, read-only. The website does not post those comments back to GitHub. |
| Close/reopen issue (Nostr) | `closeIssue`, `reopenIssue` | kinds **1632** / **1630**. Web Close publishes **1632** for hex issues. Forge `issue-N` / `pr-N` (and bare GitHub numbers) are refused. |
| PRs | `listPRs`, `createPR`, `updatePullRequest`, `getPullRequestById` | `listPRs` / `getPullRequestById` match the website: Nostr kind **1618** plus GitHub or Codeberg/Gitea `pr-N` when `source` says so, as separate rows. URLs for Nostr rows stay `/pulls/<event-id>`. |
| Merge PR (git + bridge) | `mergePullRequest` | git merge + bridge push + **30618** + **1631** |
| Star | `starRepo`, `unstarRepo`, `listStars` | NIP-25 kind **7** on **30617** event id (`e`, `k`, `+`/`-`) |
| Watch | `watchRepo`, `unwatchRepo`, `listWatchedRepos` | NIP-51 kind **10018** full `a` list |
| Pay-to-push | `getPushPaywallStatus`, `createPushPaywallIntent`, `syncRepoPushPolicy` | `push_cost_sats` on **30617** + bridge SQLite |
| Bounties | `createBountyInvoice`, `publishBountyToNostr`, `listBountiesForIssue`, … | kind **9806** + `/api/bounty/*` (unchanged by comment tools) |
| Bridge reads | `bridgeListFiles`, `bridgeGetFileContent`, `bridgeListRefs`, `bridgeListCommits` | same HTTP API as the site |
| Import / mirror | `mirrorRepo`, `importRemoteToBridge` | `mirrorRepo` is the website Push of a forge repo: `POST /api/nostr/repo/sync-from-source` (exact forge commits, including when the repo already exists), then 30617 with the website clone list and `source`, then 30618 naming those commits. `HEAD` is the forge default branch (`main` before `gh-pages`). A second call keeps the existing name, description, web links, maintainers, and paywall unless new values are passed. `importRemoteToBridge` only does the git copy. `pushToBridge` is the file-edit snapshot and drops forge history. `forkedFrom` only for a real parent. **Foreign GRASP hosts** (ngit/shakespeare/…) are **not** permanently mirrored onto `git.gittr.space`. |
| Reverse forge → Nostr | `findReposBySource` (alias `findReposByGithub`) — exact forge URL on `source`/`forkedFrom`, returns npub | `GET/POST /api/nostr/repos-by-github?source=` |
| Maintainers | `addCollaborator` | republish **30617** with `maintainers` tag (owner must sign) |
| App announce (Zapstore / NIP-82) | `announceSoftwareFromForgeRelease`, `fetchForgeReleases`, `listForgeReleases`, `deleteSoftwareAnnounce` | Kinds **32267** / **30063** / **3063** from a forge **Release tag** + hashed announceable binary (APK preferred; AppImage/DMG/linux `tar.gz`/MSI/EXE/IPA also). Omit `tag` = latest (Code sidebar **Nostr Apps**); `tag=` = Releases tab **Announce on Nostr**. Sibling MIME files become extra `e` tags on **30063**. Kind **32267** `image` tags come from the forge `zapstore.yaml` **`images:`** list (`GET /api/repo/zapstore-yaml`) plus optional extra HTTPS URLs. Optional `pinToBlossom` → `POST /api/repo/forge-release-blossom-pin` (primal/ditto/haven; **`blossom.gittr.space` only for the official gittr APK `space.gittr.app`**). Pin failure still announces the forge URL. |
| Nostr Pages | `publishNostrPages` | Kind **35128** + Blossom via `POST /api/gittr-pages/blossom-proxy-upload` (signed kind **24242**). Requires `index.html`. Default server `https://blossom.gittr.space`. Site `d` tag is **1–13** characters (DNS label), same as gittr Pages. |
| Security audit | `auditRepoDependencies` | Parses manifests from the bridge tree, then `POST /api/security/audit` (OSV.dev). Same data as the Dependencies tab; does not need the website UI flag. |

## Partial / caveats

| Topic | MCP | gittr UI gap |
|-------|-----|----------------|
| **Forge-imported tickets** | `closeIssue` / `reopenIssue` / `mergePullRequest` / `markPullRequestMerged` refuse `issue-N`, `pr-N`, and bare numbers | Same: close/merge on the origin; comment on gittr is Nostr-only |
| **PR update (1619)** | `updatePullRequest` supported | PR detail UI may not publish **1619** yet |
| **Fork** | `forkRepo` imports clone + `forkedFrom` on **30617** | UI fork flow also sets local `forkedFrom` before publish |
| **Trending** | `getTrendingRepos` = recent **30617** only | Not real engagement ranking |
| **Contributors** | `getRepoContributors` from issues/PRs on relays | UI also uses local `contributors[]` weights |
| **Nostr Pages** | `publishNostrPages` | NIP-5A kind **35128** + Blossom — same as web **Pages**. Needs `index.html`; optional `fromBridge` reads the git tree. |

## Not the same as the website

| MCP tool | Reality on gittr.space |
|----------|------------------------|
| `createRelease` | **Unsupported** for UI release notes — use `announceSoftwareFromForgeRelease` for Zapstore/NIP-82, or git tags + `publishRepoState` |
| `getFile` | Bridge first, then a short GRASP `/raw/` list. **Not** the Code tab: latest live **30617**; forge **`source`** is the tree when present (stale bridge listing is replaced); otherwise first non-empty `clone[]` listing. Prefer `bridgeListFiles` / `bridgeGetFileContent` after `importRemoteToBridge` / `mirrorRepo`, or resolve **30617** clone URLs and call gittr HTTP APIs. [FILE_FETCHING_INSIGHTS.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/FILE_FETCHING_INSIGHTS.md). |
| `listReleases` | Returns **git tags** from bridge `refs` only — **not** the website Releases tab. Use `listForgeReleases` for forge notes + assets, and `announceSoftwareFromForgeRelease` / `fetchForgeReleases` for NIP-82. |
| `getTrendingRepos` | Heuristic only |

## Recommended agent flows

Step-by-step which-tool map: [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md).

1. **GitHub / GitLab / Codeberg onto gittr:** `mirrorRepo` once (1.0.10+). Do not call `pushToBridge` after it. If that forge later returns **403** (account suspended or blocked), do not call `mirrorRepo` again and do not point it at a different URL. The commits already on `git.gittr.space/<npub>/<repo>.git` stay; read them with `bridgeListFiles`. A new forge URL is safe only after `git ls-remote` on that URL shows the commits you mean to keep — `mirrorRepo` copies that URL onto gittr and replaces branches. See [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md).
2. **New repo from files:** `createRepo` (or push + publish + state).
3. **Bug fix on files already on gittr:** `createIssue` → `pushToBridge` on a branch → `createPR` → `mergePullRequest` (snapshot, same as the website Merge button). On a forge mirror, merge with git and `git push` so the forge history stays.
4. **Star vs watch:** `starRepo` for appreciation; `watchRepo` for follow list (**10018**).
5. **Read code:** Prefer `bridgeGetFileContent` / `bridgeListFiles` after the repo is on the bridge. `getFile` is bridge-then-GRASP-raw — not the Code tab (live 30617, forge `source` tip, then first clone listing). See gittr [FILE_FETCHING_INSIGHTS.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/FILE_FETCHING_INSIGHTS.md).
6. **Announce software:** linked forge with a tagged Release + hashed binary → `announceSoftwareFromForgeRelease({ sourceUrl })` (latest) or `{ sourceUrl, tag }` (chosen tag). Screenshots: commit `images:` in that repo’s `zapstore.yaml`. Optional `pinToBlossom: true`. Preview with `fetchForgeReleases({ sourceUrl, hash:true, tag })` or `listForgeReleases({ sourceUrl })`.
7. **Publish Pages:** `publishNostrPages({ files:[{path:'index.html', content:'…'}], dTag })` or `{ fromBridge:true, ownerPubkey, repoId }`. `dTag` is clipped to 1–13 characters.
8. **Audit dependencies:** `auditRepoDependencies({ ownerPubkey, repoId })`.

See also: [NIP25_STARS_NIP51_FOLLOWING.md](https://github.com/arbadacarbaYK/gittr/blob/main/docs/NIP25_STARS_NIP51_FOLLOWING.md) in the gittr repo.
