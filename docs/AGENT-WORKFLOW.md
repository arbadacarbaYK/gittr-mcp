# Agent workflow

**Doc index:** [docs/README.md](README.md) · **Same result as the website:** [MCP-GITTR-PARITY.md](MCP-GITTR-PARITY.md)

This is the map of which tool to call. **gittr-mcp 1.0.10** or newer. It is not an npm package. Cursor: `git pull` in the folder whose path ends with `gittr-mcp/server.js`, then reload the MCP. Or install `gittr-mcp-x.y.z.mcpb` from [GitHub Releases](https://github.com/arbadacarbaYK/gittr-mcp/releases).

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

If the tool says the repo already exists, that is fine on 1.0.10: the commits are still updated.

Stop there. Do not call `pushToBridge` or `importRemoteToBridge` after this.

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

- **Issue:** `createIssue`. The page also posts an “open” status; the issue still shows as open without it. Close a Nostr issue with `closeIssue` (64-character event id). GitHub `issue-12` is closed on GitHub.
- **Pull request:** `createPR` (kind 1618). The page also tries to pin `refs/nostr/<event-id>` on the git server; that step is optional there too.
- **Merge:** `mergePullRequest` applies the files and saves a snapshot, the same as the website Merge button. It does not keep a git merge commit. On a repo copied from GitHub, merge with git and `git push` instead, or the GitHub history is replaced.

## Read the repo

Prefer `bridgeListFiles` and `bridgeGetFileContent` after the repo is on gittr. `getFile` is not the website Code tab.

Full tool-by-tool comparison: [MCP-GITTR-PARITY.md](MCP-GITTR-PARITY.md).
