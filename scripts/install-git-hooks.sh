#!/usr/bin/env bash
# Point this repo at .githooks/ so post-commit can auto-publish releases.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x .githooks/* 2>/dev/null || true
git config core.hooksPath .githooks
echo "[git-hooks] core.hooksPath=.githooks (auto-release on version bump)"
