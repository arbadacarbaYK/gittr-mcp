# Agent workflow

**Doc index:** [docs/README.md](README.md) · **Same result as the website:** [MCP-GITTR-PARITY.md](MCP-GITTR-PARITY.md)

This is the map of which tool to call. **gittr-mcp 1.0.12** or newer so a second `mirrorRepo` keeps the title and links and points `HEAD` at the forge default branch. It is not an npm package. Cursor: `git pull` in the folder whose path ends with `gittr-mcp/server.js`, then reload the MCP. Or install `gittr-mcp-x.y.z.mcpb` from [GitHub Releases](https://github.com/arbadacarbaYK/gittr-mcp/releases).

The owner key is the same Nostr key as on gittr.space (`.nostr-keys.json` or `privkey` on the call). See [SIGNING-GUIDE.md](SIGNING-GUIDE.md).

## Pick the tool by the job

| Job | Call this | Do not |
| --- | --- | --- |
| Put a **GitHub / GitLab / Codeberg** repo on gittr the way the website Push does | **`mirrorRepo` once** | `pushToBridge`. `importRemoteToBridge` for the Nostr card. |
| **New repo made of files**, or **edit files** already on gittr | **`createRepo`** or **`pushToBridge`** | `mirrorRepo` (that one needs a forge URL) |
| Copy the git commits only, no Nostr card | **`importRemoteToBridge`** | Follow it with `pushToBridge` |
| Later commits you already made with git | **`git push`** (SSH or HTTPS) | `pushToBridge` if those commits must stay |

`pushToBridge` saves one new snapshot (author `gittr push`) and replaces the branch. That is the same as editing files in the browser and pressing Push. It drops imported GitHub history.

## Copy a forge repo (website Push)

One call. It updates the git server to the forge commits (history stays, and a second call refreshes them), announces the same git servers as the website, and publishes the branch tips.

```javascript
await mirrorRepo({
  sourceUrl: 'https://github.com/org/repo',
  repoName: 'repo',
});
```

A second call is fine on 1.0.12. It refreshes the commits and points `HEAD` at the forge default branch (`main`, not whichever branch sorts first). It keeps the name, description, and web links already announced. Pass `name`, `description`, or `web` only when those should change.

If an older `mirrorRepo` already replaced them with the repo name and the GitHub link, pass the old title, description, and the two `https://gittr.space/...` links once. Later calls keep them.

Stop there. Do not call `pushToBridge` or `importRemoteToBridge` after this.

## Forge returns 403 (account suspended or blocked)

GitHub’s own reply looks like `403` and `Sorry. Your account was suspended`. That means GitHub will not serve that account. It does not delete commits already stored on gittr, and it does not delete a copy another Nostr git host already accepted.

The swap is on the website, not in MCP and not over SSH. Settings → SSH Base is only the hostname in a displayed `git@host:<nostr-key>/repo.git` line. The next Push does not send the git data there, and saving settings keeps the existing `source` tag (the GitHub URL). “Link source URL” appears only when no forge is linked.

### Check where the files actually are

```bash
git ls-remote https://git.gittr.space/<npub>/<repo>.git
```

Use the npub and repo name from the latest kind 30617. If that prints commit ids, gittr has the copy. Other hosts count only when they are on that announcement’s `clone` list **and** `git ls-remote` on that exact URL prints commits. Do not assume every announced host succeeded. Do not use the GitHub URL as a copy.

### What to tell the user to do

The owner stops gittr asking GitHub from the repo page: **If this git host is gone** → **Keep the Nostr git copy**. That publishes a new card and does not fetch. MCP cannot do that. Do not drop `source` by editing settings and pressing Push. A browser that only has file names will refuse, and it must not invent an empty branch. Until the owner uses that button, the source link stays and the Code tab still asks GitHub first. Work on the gittr copy in the meantime.

On the website (same page they are staring at):

- **Files.** The Code tab also asks every `clone[]` address, including `https://git.gittr.space/<npub>/<repo>.git`. If that copy answers, the file list is the gittr copy. Clone that address. The copy-clone button can still put the GitHub URL on the clipboard, because it prefers `source`. Ignore that URL.
- **Issues and pull requests.** Old GitHub tickets will not load. **New issue** and **New pull request** on that repo are Nostr (kinds 1621 and 1618). They do not need GitHub. Do not try to close `issue-N` / a GitHub number.
- **To do and Discussions.** While `source` is still the forge, those two tabs stay the forge’s read-only copy. New conversation goes in Issues.
- **Push to Nostr** with no file edits tries GitHub once, fails, and keeps the commits already on the bridge. The `source` tag stays. Editing files in the browser and then Push saves one new snapshot. It is not a commit on top of the imported history.

With MCP, do the same jobs:

- **Read:** `bridgeListFiles` and `bridgeGetFileContent`. Those read the gittr bridge, not GitHub. `getFile` is also bridge-first.
- **New issue:** `createIssue`. **New pull request:** `createPR`. `listIssues` / `listPRs` still try the forge when `source` says so; a 403 there means the forge rows are missing, not that Nostr rows are gone.
- **New commits that must keep the imported history:** clone the gittr URL above and `git push` to it with the owner key. Then `publishRepoState` with the refs from that push. Do not use `pushToBridge` for this.

A website Push with no local edits, while `source` is still GitHub, tries once to copy from GitHub. On 403 that copy fails. The Push then keeps the commit ids already on the bridge when those refs exist. It does not remove the GitHub `source` tag, so the Code tab keeps asking GitHub first.

### What not to call

- **`mirrorRepo` or `importRemoteToBridge` on the suspended GitHub URL.** The copy fails. A bare repo that already has branches is left in place when that fetch fails. Calling either tool again does not clear the 403.
- **`mirrorRepo` or `importRemoteToBridge` on a new Forgejo, or any other URL, to “change the source”.** Both tools copy **from that URL onto** the gittr bare repo and force every branch to match it. An empty or different forge replaces the history gittr is holding.
- **`pushToBridge` to rescue the import.** That replaces the branch with one snapshot and drops the imported commits.

### When a new forge is safe

Only on the website, and only after the same commits are already on that forge. The owner pushes the gittr clone **to** the forge with ordinary `git push` (SSH or HTTPS), then `git ls-remote` on the forge URL shows those commits. They then press **Check this server** or **Use** that host. The server refuses unless every gittr branch tip is still there, and it does not delete the repo or move a branch that is already on gittr.

Do not call `mirrorRepo` for this job. It copies the URL you pass onto gittr and replaces branches, and it does not use that refusal. MCP has no tool that drops `source` without copying. Point the owner at the sidebar.

## New repo or file edits

`createRepo` pushes the files and publishes the Nostr card (kinds 30617 and 30618) in one call.

```javascript
await createRepo({
  name: 'my-repo',
  description: 'What this is',
  files: [{ path: 'README.md', content: '# My repo\n' }],
});
```

A later file edit is `pushToBridge` on that branch, then `publishRepoState` with the refs it returns. Pass `deletedPaths` to remove a file or folder.

## Issues and pull requests

- **Issue:** `listIssues` returns the same rows as the website Issues tab: Nostr issues, and GitHub or Codeberg/Gitea issues when the repo has that source. They stay separate. `createIssue` posts a Nostr issue. Close a Nostr issue with `closeIssue` (64-character event id). A GitHub `issue-12` is closed on GitHub, same as the website.
- **Comments:** `listIssueComments` on a Nostr id returns Nostr comments. On `issue-N`, pass `ownerPubkey` and `repoId` to read the forge comments. `createIssueComment` posts on Nostr only. The website does not write comments back to GitHub.
- **Pull request:** `listPRs` works the same way as the issue list. `createPR` posts kind 1618.
- **Merge:** `mergePullRequest` applies the files and saves a snapshot, the same as the website Merge button. It does not keep a git merge commit. On a repo copied from GitHub, merge with git and `git push` instead, or the GitHub history is replaced.

## Read the repo

Prefer `bridgeListFiles` and `bridgeGetFileContent` after the repo is on gittr. `getFile` is not the website Code tab.

Full tool-by-tool comparison: [MCP-GITTR-PARITY.md](MCP-GITTR-PARITY.md).
