---
name: nostr
description: Use when working with the Nostr protocol, implementing Nostr clients or relays, handling Nostr events, or discussing NIPs. Covers event structure, cryptographic operations, client-relay communication, and standard NIPs.
---

# Nostr Protocol (reference)

**Source:** [purrgrammer/grimoire](https://github.com/purrgrammer/grimoire) `.claude/skills/nostr`. Use with **nostr-tools** (JS/TS library) and **Clawstr** (nak CLI) skills when building or reasoning about Nostr.

## When to Use

- Implementing Nostr clients or relays
- Working with Nostr events and messages
- Handling cryptographic signatures and keys (schnorr on secp256k1)
- Implementing any NIP (Nostr Implementation Possibility)
- Querying or filtering events
- Discussing protocol architecture

## Core Concepts

### Protocol Foundation

- **Clients** — apps that read/write data
- **Relays** — servers that store and forward messages
- Users identified by public keys; messages signed with private keys; no central authority

### Event Structure (JSON)

```json
{
  "id": "<32-bytes hex sha256 of serialized event>",
  "pubkey": "<32-bytes hex public key>",
  "created_at": "<unix timestamp>",
  "kind": "<number>",
  "tags": [["<key>", "<value>", ...]],
  "content": "<string>",
  "sig": "<64-bytes hex schnorr signature>"
}
```

### Event Kinds (common)

- `0` — Metadata (profile)
- `1` — Text note
- `3` — Contacts (following list)
- `4` — Encrypted DM (legacy; prefer NIP-44)
- `5` — Event deletion
- `6` — Repost
- `7` — Reaction
- `40`–`44` — Channel
- `9735` — Zap receipt
- `10002` — Relay list (NIP-65)
- `30000`–`39999` — Parameterized replaceable (e.g. `30023` article)

### Tags (common)

- `["e", "<id>", "<relay>", "<marker>"]` — event ref (marker: root, reply, mention)
- `["p", "<pubkey>"]` — user ref
- `["a", "<kind>:<pubkey>:<d>"]` — replaceable event ref
- `["d", "<id>"]` — identifier for parameterized replaceable
- `["t", "<hashtag>"]` — topic

## Key NIPs (summary)

- **NIP-01** — Basic protocol: event structure, ID = SHA256(serialized), schnorr sig, WebSocket (EVENT, REQ, CLOSE, EOSE, OK, NOTICE).
- **NIP-02** — Contact list (kind 3).
- **NIP-04** — Encrypted DMs (deprecated; use NIP-44).
- **NIP-05** — DNS id: `name@domain` → `.well-known/nostr.json` → pubkey + relays.
- **NIP-09** — Deletion (kind 5, `e` tags).
- **NIP-10** — Reply threading: e/p tags, markers root/reply/mention.
- **NIP-11** — Relay info document (HTTP GET).
- **NIP-19** — bech32: npub, nsec, note, nprofile, nevent, naddr.
- **NIP-25** — Reactions (kind 7).
- **NIP-42** — Relay auth (AUTH, kind 22242).
- **NIP-44** — Encrypted payloads (preferred over NIP-04).
- **NIP-50** — Search (filter `search`).
- **NIP-65** — Relay list (kind 10002).

## Client–Relay (WebSocket)

- **To relay:** `["EVENT", event]`, `["REQ", sub_id, filter, ...]`, `["CLOSE", sub_id]`, `["AUTH", event]`.
- **From relay:** `["EVENT", sub_id, event]`, `["OK", id, ok, msg]`, `["EOSE", sub_id]`, `["NOTICE", msg]`, `["AUTH", challenge]`.

## Filters

```json
{
  "ids": ["hex..."],
  "authors": ["pubkey..."],
  "kinds": [1, 6],
  "#e": ["eventId"],
  "#p": ["pubkey"],
  "#t": ["hashtag"],
  "since": 1234567890,
  "until": 1234567890,
  "limit": 100
}
```

Arrays in a field = OR; different fields = AND.

## Crypto

- Private key: 32 bytes; public key: secp256k1; encoding: hex or bech32 (NIP-19).
- Event: serialize (order), SHA256 → `id`; sign `id` (schnorr) → `sig`. Always verify sig and `id`.

## Best Practices

- Connect to multiple relays; verify signatures; handle replaceable events (latest wins); use limits/since/until; never expose nsec.

## References

- **NIPs:** https://github.com/nostr-protocol/nips
- **nostr.how:** https://nostr.how
- **nostr-tools (JS):** https://github.com/nbd-wtf/nostr-tools

## Related (this workspace)

- **nostr-tools** — JS/TS API (finalizeEvent, SimplePool, nip19, nip44, etc.).
- **Clawstr** — Posting, replies, zaps via `nak` CLI; NIP-22, NIP-25.
- **gittr.space / gittr-mcp** — Git on Nostr (NIP-34).
