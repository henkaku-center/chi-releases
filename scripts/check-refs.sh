#!/usr/bin/env bash
# Cross-repo version/ref consistency for the Chi package set.
#
# Usage:
#   scripts/check-refs.sh        # check pins across sibling checkouts + sha drift
#   scripts/check-refs.sh --pin  # also rewrite CHI_*_SHA in packages.env from origin/main
set -euo pipefail

RELEASES="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(dirname "$RELEASES")"
REPOS=(chi-base chi-buzz chi-sync chi-commons jsonl-reduce)
fail=0

declare -A V
for r in "${REPOS[@]}"; do
  [ -f "$ROOT/$r/package.json" ] && V[$r]="$(node -p "require('$ROOT/$r/package.json').version")"
done

for r in "${REPOS[@]}" chi-releases; do
  f="$ROOT/$r/package.json"
  [ -f "$f" ] || continue
  for dep in "${REPOS[@]}"; do
    [ "$dep" = "$r" ] && continue
    spec="$(node -p "const p=require('$f');(p.dependencies?.['@henkaku-center/$dep'] ?? p.peerDependencies?.['@henkaku-center/$dep'] ?? p.devDependencies?.['@henkaku-center/$dep'] ?? '')")"
    [ -z "$spec" ] && continue
    case "$spec" in
      "github:henkaku-center/$dep#main") ;;   # floating git ref, allowed during beta
      "${V[$dep]:-}") ;;                       # exact version match
      *) echo "MISMATCH $r -> @henkaku-center/$dep: '$spec' (actual: ${V[$dep]:-not checked out})"; fail=1 ;;
    esac
  done
done

# Sha pins in packages.env: report drift, or rewrite with --pin.
ENV_FILE="$RELEASES/packages.env"
for r in base buzz sync commons; do
  var="CHI_${r^^}_SHA"
  remote="$(git ls-remote "https://github.com/henkaku-center/chi-$r" main | cut -f1)"
  pinned="$(sed -n "s/^$var=\"\(.*\)\"/\1/p" "$ENV_FILE")"
  if [ "${1:-}" = "--pin" ]; then
    sed -i "s/^$var=.*/$var=\"$remote\"/" "$ENV_FILE"
    echo "PINNED $var=$remote"
  elif [ -n "$pinned" ] && [ "$pinned" != "$remote" ]; then
    echo "DRIFT $var: pinned $pinned, origin/main $remote"
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "OK"
exit $fail
