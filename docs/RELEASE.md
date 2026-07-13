# Releasing gittr-mcp

The `.mcpb` is a **snapshot bundle** (not a symlink). Releases are **automatic** — you should not need to remember `npm run release`.

## Recommended: bump version (fully automatic)

```bash
npm version patch   # or minor / major
```

That single command:

1. Runs tests
2. Bumps `package.json` and syncs `server.json` + `mcpb/manifest.json`
3. Commits and tags `vX.Y.Z`
4. Builds the `.mcpb`
5. Pushes `main` + tag to GitHub
6. Creates/updates the GitHub Release and uploads `gittr-mcp-X.Y.Z.mcpb`

Uses `GITHUB_PLATFORM_TOKEN` from your environment or `../gittr/.env`.

## Safety net: git hook after any commit

On `npm install`, hooks install automatically (`prepare` script).

If you **manually** change `version` in `package.json` and commit, the **post-commit hook** checks GitHub — if the `.mcpb` asset is missing, it runs the release upload for you.

Skip once: `GITTR_MCP_SKIP_AUTO_RELEASE=1 git commit ...`

## Manual release (same as auto)

```bash
npm run release
```

## Local `.mcpb` only (no GitHub)

```bash
npm run build:mcpb
```

Creates:

- `dist/gittr-mcp-<version>.mcpb`
- `gittr-mcp-<version>.mcpb` in repo root (for Google form uploads)

## Future: GitHub Actions

`.github/workflows/release.yml` is ready locally. When a PAT with **`workflow`** scope can push it, tag pushes will also run in CI (redundant with the above until then).

Optional: add **`NPM_TOKEN`** secret for npm publish from Actions.
