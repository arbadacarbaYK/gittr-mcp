# Nostr identity: which keys and where

**Summary:** The only keypair **in this repo** (and in the credential files) is **npub1e74y...** / **nsec1hk49...**. That is what the bot and tools use. The verified NIP-05 **SatOpsHQ@gittr.space** is **npub15egk...**; its nsec is **not** in the tarball or repo — recover it elsewhere if you want to switch. Any other keypair the bot ever “showed” (e.g. npub1fj2g...) is not in any file; ignore it.

---

## Your three questions (answered)

### 1. Where did the keys the bot showed me come from? (npub1fj2g... / nsec1j2vl...)

**They are not in any file in this repo.** Grep shows no matches for `npub1fj2gln` or `nsec1j2vl95`. So the bot **did not read those from .nostr-keys.json or ~/.nostr-identity.json**. Most likely the model **hallucinated** them, or they came from another session/context. Ignore that keypair — it is not yours and not in use here.

### 2. What are we trying to set up?

One consistent Nostr identity for SatOpsHQ: all credential files and tools (nak, Clawstr, .env) use **the same** keypair. Right now that is the keypair **in the files** (npub1e74y...). If you later recover the nsec for the verified identity (npub15egk... SatOpsHQ@gittr.space), you can replace the files with that keypair so everything uses it.

### 3. Should you use a different identity for something?

**No.** Use **one** keypair everywhere. Currently that's the one in the repo (npub1e74y...). The verified NIP-05 **SatOpsHQ@gittr.space** (npub15egk...) is the identity you care about for gittr-mcp/Clawstr, but its nsec is not here — so the bot uses the key we have (npub1e74y...) until or unless you put the other into the credential files.

---

## Is the nsec for npub15egk... in the original tarball?

**No.** The tarball's `.openclaw/workspace/.nostr-keys.json` has the **other** keypair (npub1e74y... / nsec1hk49...). The nsec for npub15egk... (SatOpsHQ@gittr.space) is not in the tarball or repo; recover it from wherever you first stored that key (e.g. another client or backup).

---

## What’s in the repo vs verified identity

| Where | Keypair | Notes |
|-------|--------|--------|
| **Credential files** (workspace `.nostr-keys.json`, `.env`, `~/.nostr-identity.json`, `~/.clawstr/secret.key`) | **npub1e74y...** / nsec1hk49... | This is what the bot uses. Single source of truth for “key in use.” |
| **Verified NIP-05** SatOpsHQ@gittr.space | **npub15egk...** | nsec not in repo or tarball. Recover from elsewhere if you want to switch. |
| **IDENTITY.md** | Lists npub1e74y... (key in files) | Matches credential files so docs aren’t confusing. |

**If you recover the nsec for npub15egk... (SatOpsHQ@gittr.space):** Put it (and npub/hex) into the four credential locations above and update the Nostr line in IDENTITY.md to npub15egk... so everything stays aligned.
