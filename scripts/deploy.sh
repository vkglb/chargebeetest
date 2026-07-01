#!/usr/bin/env bash
# Trigger a Render deploy via Deploy Hook (no dashboard click needed).
#
# One-time setup:
#   1. Render dashboard -> your service -> Settings -> Deploy Hook -> copy the URL.
#   2. export RENDER_DEPLOY_HOOK="https://api.render.com/deploy/srv-xxxxx?key=yyyyy"
#      (add it to your ~/.bashrc to persist).
#
# Usage:
#   ./scripts/deploy.sh                 # uses $RENDER_DEPLOY_HOOK
#   ./scripts/deploy.sh "<hook-url>"    # or pass the hook as the first argument
set -euo pipefail

HOOK="${RENDER_DEPLOY_HOOK:-${1:-}}"
if [ -z "$HOOK" ]; then
  echo "error: set RENDER_DEPLOY_HOOK (Render -> Settings -> Deploy Hook), or pass the URL as arg 1" >&2
  exit 1
fi

echo "Triggering Render deploy..."
curl -fsS -X POST "$HOOK"
echo
echo "Deploy triggered. Watch progress in the Render dashboard (Events / Logs)."
