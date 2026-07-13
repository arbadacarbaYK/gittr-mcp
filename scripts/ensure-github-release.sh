#!/usr/bin/env bash
# Idempotent: upload MCPB to GitHub Release when package.json version has no release asset yet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${GITTR_MCP_SKIP_AUTO_RELEASE:-}" == "1" ]]; then
  exit 0
fi

load_token() {
  if [[ -n "${GITHUB_PLATFORM_TOKEN:-}" ]]; then
    export GITHUB_TOKEN="$GITHUB_PLATFORM_TOKEN"
    return 0
  fi
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    return 0
  fi
  for envfile in "$ROOT/../gittr/.env" "$HOME/Projects/gittr/.env"; do
    if [[ -f "$envfile" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$envfile"
      set +a
      if [[ -n "${GITHUB_PLATFORM_TOKEN:-}" ]]; then
        export GITHUB_TOKEN="$GITHUB_PLATFORM_TOKEN"
        return 0
      fi
    fi
  done
  echo "[auto-release] skip: no GITHUB_PLATFORM_TOKEN (set in gittr/.env or env)" >&2
  return 1
}

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
REPO="arbadacarbaYK/gittr-mcp"

# Only act when the latest commit changed package.json version (or we're on the version tag).
PREV_VER="$(git show HEAD^:package.json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{console.log(JSON.parse(s).version)}catch{}})" || true)"
CUR_VER="$(node -p "require('./package.json').version")"
if [[ "$PREV_VER" == "$CUR_VER" && "$(git describe --tags --exact-match HEAD 2>/dev/null || true)" != "$TAG" ]]; then
  exit 0
fi

load_token || exit 0

ASSET_NAME="gittr-mcp-${VERSION}.mcpb"
RELEASE_JSON="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" 2>/dev/null || echo '{}')"

HAS_ASSET="$(echo "$RELEASE_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assets = d.get('assets') or []
name = '${ASSET_NAME}'
print('yes' if any(a.get('name') == name for a in assets) else 'no')
" 2>/dev/null || echo 'no')"

if [[ "$HAS_ASSET" == "yes" ]]; then
  exit 0
fi

echo "[auto-release] version ${VERSION} has no ${ASSET_NAME} on GitHub — running publish-release.sh"
exec bash "$ROOT/scripts/publish-release.sh" --skip-test "$@"
