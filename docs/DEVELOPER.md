# Developer reference

Use **`require('gittr-mcp')`** (see `package.json` `main`) or import from this repo. For full flows, see [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md).

## Relay verification (agent contract)

After publishing **30617**, **1621**, or **1618**, the library **polls relays** until either:

- **`verification.confirmed === true`** and **`confirmedOnRelays`** lists where the event was read twice (stability check), or  
- **`verification.confirmed === false`** with **`outcome: 'timeout_not_readable'`** and **`missingOnRelays`** — definitive failure for “readable on these relays within `GITTR_RELAY_VERIFY_TIMEOUT_MS`”.

MCP tool errors from `publishRepoAnnouncement` / `createIssue` / `createPR` include a JSON **`verification`** object on failure (see `server.js`). There is no “maybe”: publish either **passes verification** or **throws `VERIFICATION_FAILED`…** with that object.

**`createRepo`** additionally returns **`gitSmartHttpCheck`** (`cloneHttpVerified` true/false) from an HTTP probe of the primary `git.gittr.space` clone URL.

## API reference

### Repository operations

#### `pushToBridge(options)`

Push files to the gittr bridge. **Requires `privkey`** for NIP-98 (challenge signed automatically; cached briefly).

- `ownerPubkey` — 64-char hex  
- `repo`, `branch` (default `main`)  
- `files` — `{ path, content }[]`; optional `isBinary` (base64)  
- `privkey` — hex or `nsec` (same as other tools)

Returns `{ success, pushedFiles, refs: [{ ref, commit }] }`.

#### `publishRepoAnnouncement(options)`

Kind **30617**. Requires signing.

- `repoId`, `name`, `description`, `web[]`, `clone[]`, `privkey`, `relays[]`

**Clone vs relays:** NIP-34 / relay policy expects **coherent** metadata—typically the **HTTPS host** in each `clone` URL should pair with a **`wss://` relay** your relays accept (often the same GRASP hostname for both). If you use **`https://git.gittr.space/<hex>/repo.git`**, ensure your `relays` list matches what you publish and what gittr docs recommend for that host. Mismatched domains are a common rejection cause.

#### `publishRepoState(options)`

Kind **30618**. `refs` from `pushToBridge`; `privkey`; `relays`.

#### `listRepos(options)`

Optional `pubkey`, `search`, `limit`, `relays`.

#### `resolveRepoByNostrId(ownerNpubOrHex, repoId, options?)`

Returns `cloneUrl` (prefers `git.gittr.space`), `cloneUrls`, `relays`, etc.

### Issues

- **`listIssues`** — `ownerPubkey`, `repoId`, optional `labels`, `relays`  
- **`createIssue`** — requires `privkey`; `subject`, `content`, …

### Pull requests

- **`listPRs`**, **`createPR`**, **`getPullRequestById`**, **`updatePullRequest`**, **`mergePullRequest`**, etc. — see `gittr-agent.js` / `server.js` tool schemas for the full list.

### Bounties

Optional LNbits: `GITTR_LNBITS_URL`, `GITTR_LNBITS_ADMIN_KEY` (or per-call args). Tools include `createBountyInvoice`, `publishBountyToNostr`, `listBountiesForIssue`, release/withdraw helpers.

## Known GRASP-style hosts (examples)

Used in the wild for git + Nostr; availability changes over time:

- `relay.ngit.dev`, `git.shakespeare.diy`, `ngit-relay.nostrver.se`, `git-01.uid.ovh`, `git-02.uid.ovh`, `ngit.danconwaydev.com`, **`git.gittr.space`**

Prefer **`https://git.gittr.space/<hex-pubkey>/<repo>.git`** for HTTPS git when you want gittr’s git HTTP. Align **`relays`** with your announcement and relay policy.

## Common issues

- **Multiple `clone` tags** — some relays reject duplicates; use one `clone` tag with multiple values.  
- **“Announcement must list service in both clone and relays”** — add `wss://` for the clone URL’s host where required.  
- **Repo shows 0 files on web** — push alone is not enough; publish **30617** + **30618** (or use **`createRepo`**).  
- **`duplicate url`** — usually non-fatal; de-duplicate `relays`.  
- **Bridge `429`** — push 10/min per IP, 5/min per identity; challenge 30/min; MCP retries once using `retry_after`.

## Limitations

### `getFile()`

Needs GRASP/Nostr visibility — not for files that exist only on the bridge before publish.

### PRs (kind 1618)

**Publish PR event:** succeeds or fails per relay response — binary.

**“Can relays / others verify my commits?”** depends on your published **`clone`** URL: if that URL does **not** answer `git` HTTP, verification fails — treat that as **bad metadata for git workflows**, same as a failed `git clone` on that URL. Prefer **`https://git.gittr.space/...`** (or another URL you have confirmed with `git ls-remote`), then re-publish if needed.

**If publish fails:** gittr CLI / `nostr://`, external GitHub/GitLab in **30617**, patches (**1617**), or `git-remote-nostr`.

**Rule of thumb:** same host in `clone` (https) and `relays` (`wss://`) where your relay set requires GRASP pairing; when in doubt, follow [Common issues](#common-issues) and gittr.space UI defaults.

## Security

- Never commit `nsec` / hex keys; use ignored `.nostr-keys.json` or env.  
- Bridge uses NIP-98; Nostr publishes use the same key material—treat logs and transcripts as sensitive.
