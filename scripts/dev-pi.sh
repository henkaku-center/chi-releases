#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

# Run one Pi session with every checked-out Chi extension loaded directly from
# source. Restart with --continue after edits; reloading can mix these explicit
# paths with globally installed Chi packages.
#
# Keep the installed auth extension explicit: --no-extensions disables normal
# package discovery, and Claude OAuth otherwise falls back to Pi's built-in
# provider path (which can have different billing/quota behavior).
PI_DIR=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
AUTH_EXTENSION="$PI_DIR/npm/node_modules/pi-claude-auth/src/index.ts"

args=(
  --no-extensions
  -e "$ROOT/chi-base/src/extension.ts"
  -e "$ROOT/chi-buzz/src/extension.ts"
  -e "$ROOT/chi-sync/src/extension.ts"
  -e "$ROOT/chi-commons/src/extension.ts"
)
if [[ -f "$AUTH_EXTENSION" ]]; then
  args+=( -e "$AUTH_EXTENSION" )
else
  echo "warning: pi-claude-auth is not installed; Claude subscription auth may differ" >&2
fi

exec pi "${args[@]}" "$@"
