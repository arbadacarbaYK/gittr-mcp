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

The website has no control that changes this. Settings → SSH Base is only the hostname in a displayed `git@host:<nostr-key>/repo.git` line. The next Push does not send the git data there, and saving settings keeps the existing `source` tag (the GitHub URL). “Link source URL” appears only when no forge is linked.

### Check where the files actually are

```bash
git ls-remote https://git.gittr.space/<npub>/<repo>.git
```

Use the npub and repo name from the latest kind 30617. If that prints commit ids, gittr has the copy. Other hosts count only when they are on that announcement’s `clone` list **and** `git ls-remote` on that exact URL prints commits. Do not assume every announced host succeeded. Do not use the GitHub URL as a copy.

### What to tell the user to do

Leave `source` pointing at GitHub. Read and continue from the gittr URL.

- **Read:** `bridgeListFiles` and `bridgeGetFileContent`. Those read the gittr bridge, not GitHub. `getFile` is also bridge-first. The website Code tab is not: while `source` is still the GitHub URL, the file list asks GitHub first. A 403 there is GitHub refusing. It is not proof the bridge is empty. After that refusal, opening one file on the website tries the bridge.
- **New commits that must keep the imported history:** clone the gittr URL above and `git push` to it with the owner key. Then `publishRepoState` with the refs from that push. Do not use `pushToBridge` for this.
- **New issues:** `createIssue` (a Nostr issue). GitHub issue numbers and `issue-N` will 403. Do not try to close them on GitHub.

A website Push with no local edits, while `source` is still GitHub, tries once to copy from GitHub. On 403 that copy fails. The Push then keeps the commit ids already on the bridge when those refs exist. It does not remove the GitHub `source` tag, so the Code tab keeps asking GitHub first.

### What not to call

- **`mirrorRepo` or `importRemoteToBridge` on the suspended GitHub URL.** The copy fails. A bare repo that already has branches is left in place when that fetch fails. Calling either tool again does not clear the 403.
- **`mirrorRepo` or `importRemoteToBridge` on a new Forgejo, or any other URL, to “change the source”.** Both tools copy **from that URL onto** the gittr bare repo and force every branch to match it. An empty or different forge replaces the history gittr is holding.
- **`pushToBridge` to rescue the import.** That replaces the branch with one snapshot and drops the imported commits.

### When a new forge is safe

Only after the same commits are already on that forge: the owner pushed the gittr clone **to** the forge, and `git ls-remote` on the forge URL shows those commits. Then `mirrorRepo` with that URL is the normal website Push. Until that `ls-remote` succeeds, do not change `source`.

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
