#!/usr/bin/env bash
set -euo pipefail

# Install the checked-out Chi packages as project-local Pi packages. Pi keeps
# these as paths, so no npm publication or registry propagation is involved.
# Run /reload in an existing Pi session after editing an extension.

SOURCE_ROOT=${CHI_SOURCE_ROOT:-"$(cd "$(dirname "$0")/../../" && pwd)"}
PROJECT_DIR=${1:-"$PWD"}

packages=(chi-base chi-buzz chi-sync chi-commons)
for package in "${packages[@]}"; do
  path="$SOURCE_ROOT/$package"
  if [[ ! -d "$path" || ! -f "$path/package.json" ]]; then
    echo "missing local package: $path" >&2
    echo "Set CHI_SOURCE_ROOT to the directory containing the Chi package checkouts." >&2
    exit 1
  fi
done

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
for package in "${packages[@]}"; do
  echo "linking $package from $SOURCE_ROOT/$package"
  pi install -l --approve "$SOURCE_ROOT/$package"
done

cat <<'EOF'

Local Chi packages are now active in this project's .pi/settings.json.

Development loop:
  1. edit a checked-out extension
  2. save the file
  3. run /reload in Pi
  4. commit and push normally; no npm update is needed

The package source paths are local and are not changed by `pi update`.
EOF
