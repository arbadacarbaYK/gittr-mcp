#!/usr/bin/env bash
# Cut a release: test, build .mcpb, tag, push, attach MCPB to GitHub Release.
# Works with GITHUB_PLATFORM_TOKEN (no workflow scope needed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_TEST=0
SKIP_TAG=0
for arg in "$@"; do
  case "$arg" in
    --skip-test) SKIP_TEST=1 ;;
    --skip-tag) SKIP_TAG=1 ;;
  esac
done

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
  echo "ERROR: set GITHUB_PLATFORM_TOKEN or GITHUB_TOKEN (e.g. in ../gittr/.env)" >&2
  exit 1
}

load_token

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
REPO="arbadacarbaYK/gittr-mcp"
REMOTE="https://arbadacarbaYK:${GITHUB_TOKEN}@github.com/${REPO}.git"

echo "==> gittr-mcp release ${TAG}"
if [[ "$SKIP_TEST" -eq 0 ]]; then
  npm test
fi
npm run build:mcpb

MCPB="dist/gittr-mcp-${VERSION}.mcpb"
if [[ ! -f "$MCPB" ]]; then
  echo "ERROR: missing $MCPB" >&2
  exit 1
fi

if [[ "$SKIP_TAG" -eq 0 ]]; then
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Tag $TAG already exists locally."
  else
    git tag -a "$TAG" -m "gittr-mcp ${VERSION}"
  fi
fi

echo "==> pushing main and tags"
git push "$REMOTE" main --tags

RELEASE_JSON="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" 2>/dev/null || echo '{"message":"Not Found"}')"

if echo "$RELEASE_JSON" | grep -q '"message": "Not Found"'; then
  echo "==> creating GitHub release ${TAG}"
  RELEASE_JSON="$(curl -fsS -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases" \
    -d "{\"tag_name\":\"${TAG}\",\"name\":\"gittr-mcp ${VERSION}\",\"body\":\"See CHANGELOG.md\",\"draft\":false,\"prerelease\":false}")"
else
  echo "==> release ${TAG} already exists"
fi

UPLOAD_URL="$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('upload_url','').replace('{?name,label}',''))")"
ASSET_NAME="gittr-mcp-${VERSION}.mcpb"

RELEASE_ID="$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")"
if [[ -n "$RELEASE_ID" ]]; then
  ASSET_ID="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets" | \
    python3 -c "import sys,json; assets=json.load(sys.stdin); print(next((a['id'] for a in assets if a.get('name')=='${ASSET_NAME}'), ''))")"
  if [[ -n "$ASSET_ID" ]]; then
    echo "==> removing old ${ASSET_NAME} asset"
    curl -fsS -X DELETE -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/${REPO}/releases/assets/${ASSET_ID}" >/dev/null
  fi
fi

echo "==> uploading ${ASSET_NAME}"
curl -fsS -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/octet-stream" \
  "${UPLOAD_URL}?name=${ASSET_NAME}" --data-binary @"${MCPB}" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('Download:', d.get('browser_download_url', d))"

echo "==> done. Local copy: gittr-mcp-${VERSION}.mcpb"
