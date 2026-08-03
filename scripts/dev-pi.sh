#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

# Run one Pi session with every checked-out Chi extension loaded directly from
# source. This is the orchestrator/development entrypoint; no npm install is
# involved when source files change. Use /reload after edits.
exec pi --no-extensions \
  -e "$ROOT/chi-base/src/extension.ts" \
  -e "$ROOT/chi-buzz/src/extension.ts" \
  -e "$ROOT/chi-sync/src/extension.ts" \
  -e "$ROOT/chi-commons/src/extension.ts" \
  "$@"
