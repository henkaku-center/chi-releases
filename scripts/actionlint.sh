#!/usr/bin/env bash
set -euo pipefail
version=1.7.12
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) asset="actionlint_${version}_linux_amd64.tar.gz"; sha="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8" ;;
  Darwin-arm64) asset="actionlint_${version}_darwin_arm64.tar.gz"; sha="aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f" ;;
  Darwin-x86_64) asset="actionlint_${version}_darwin_amd64.tar.gz"; sha="5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644" ;;
  *) echo "Unsupported actionlint platform" >&2; exit 1 ;;
esac
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/$asset" "https://github.com/rhysd/actionlint/releases/download/v${version}/${asset}"
if command -v sha256sum >/dev/null 2>&1; then
  echo "$sha  $tmp/$asset" | sha256sum -c - >/dev/null
else
  echo "$sha  $tmp/$asset" | shasum -a 256 -c - >/dev/null
fi
tar -xzf "$tmp/$asset" -C "$tmp" actionlint
"$tmp/actionlint"
