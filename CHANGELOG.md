# Changelog

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
