#!/usr/bin/env bash
# Chi beta smoke script for exe.dev / fresh machines.
#
# Non-interactive phases (1-4) validate the environment, auth, package
# install, and module load. Interactive phases (5-7) print manual steps.
#
# Usage:
#   scripts/smoke-dev-exe.sh              # run all non-interactive phases
#   scripts/smoke-dev-exe.sh env auth     # run selected phases
#   scripts/smoke-dev-exe.sh --list       # list phases
#
# Phases: env auth install load manual
#
# This script NEVER prints secret values. Provider checks are presence-only.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../packages.env
source "$REPO_ROOT/packages.env"

PASS=0
FAIL=0
FAILED_CHECKS=()

ok()   { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); FAILED_CHECKS+=("$1"); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       hint: %s\n' "$2"; }
info() { printf '  info %s\n' "$1"; }
hdr()  { printf '\n== %s ==\n' "$1"; }

require_cmd() { # name, hint
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1 found ($("$1" --version 2>&1 | head -1))"
  else
    bad "$1 not found" "${2:-install $1 (see docs/BOOTSTRAP.md section 0)}"
  fi
}

# ---------------------------------------------------------------- phase: env
phase_env() {
  hdr "Phase 1: environment"
  require_cmd pi "npm install -g @earendil-works/pi-coding-agent"
  require_cmd node "install Node via nvm (docs/BOOTSTRAP.md)"
  require_cmd npm
  require_cmd git
  require_cmd gh "sudo apt-get install -y gh"
  require_cmd gitleaks "download release into ~/.local/bin (docs/BOOTSTRAP.md)"
  require_cmd trufflehog "install script into ~/.local/bin (docs/BOOTSTRAP.md)"

  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      ok "node major version $major >= $MIN_NODE_MAJOR"
    else
      bad "node major version $major < $MIN_NODE_MAJOR" "nvm install --lts"
    fi
  fi
}

# --------------------------------------------------------------- phase: auth
phase_auth() {
  hdr "Phase 2: auth (no secrets printed)"

  # GitHub: needed for private package clones.
  if gh auth status >/dev/null 2>&1; then
    ok "gh auth status: logged in"
  else
    bad "gh auth status failed" "run: gh auth login && gh auth setup-git"
  fi
  if git config --get-all credential.helper >/dev/null 2>&1 ||
     git config --get-regexp '^credential\.' >/dev/null 2>&1; then
    ok "a git credential helper is configured"
  else
    bad "no git credential helper configured" "run: gh auth setup-git"
  fi

  # The real test: can git read a private chi repo non-interactively?
  local first_pkg="${CHI_PACKAGES[0]}"
  if GIT_TERMINAL_PROMPT=0 git ls-remote "$first_pkg" HEAD >/dev/null 2>&1; then
    ok "git can read private repo ${first_pkg##*/}"
  else
    bad "git cannot read private repo ${first_pkg##*/}" "gh auth login && gh auth setup-git; confirm repo access with: gh repo view ${first_pkg#https://github.com/}"
  fi

  # Providers: presence-only env checks. NEVER print values.
  local any_provider=0
  local v
  for v in ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY GOOGLE_API_KEY; do
    if [ -n "${!v:-}" ]; then
      ok "$v is set (value not shown)"
      any_provider=1
    else
      info "$v unset"
    fi
  done

  # Pi may hold credentials in its own auth store even without env vars.
  local models
  models="$(pi --list-models 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${models:-0}" -gt 0 ]; then
    ok "pi --list-models reports $models model lines"
    any_provider=1
  else
    info "pi --list-models returned nothing"
  fi

  if [ "$any_provider" -eq 1 ]; then
    ok "at least one provider credential path available"
  else
    bad "no provider credentials detected" "get Henkaku-provided credentials; export the env var (do not paste into logs)"
  fi
}

# ------------------------------------------------------------ phase: install
phase_install() {
  hdr "Phase 3: package install"

  if ! gh auth status >/dev/null 2>&1; then
    bad "skipping install: GitHub auth missing" "gh auth login && gh auth setup-git"
    return
  fi

  local pkg
  for pkg in "${CHI_PACKAGES[@]}"; do
    if pi install "$pkg" >/dev/null 2>&1; then
      ok "pi install $pkg"
    else
      bad "pi install $pkg" "private repo clone failed? check gh auth status / repo access"
    fi
  done

  local listing
  listing="$(pi list 2>/dev/null || true)"
  for pkg in "${CHI_PACKAGES[@]}"; do
    local name="${pkg##*/}"
    if grep -q "$name" <<<"$listing"; then
      ok "pi list shows $name"
    else
      bad "pi list missing $name"
    fi
  done
}

# --------------------------------------------------------------- phase: load
phase_load() {
  hdr "Phase 4: module load"

  local tmp out
  tmp="$(mktemp -d)"
  # Non-interactive load check: ask pi to run a trivial prompt-free startup.
  # --print with a no-op prompt exercises extension loading; failures in
  # chi-* extensions surface on stderr.
  out="$( (cd "$tmp" && pi --print --no-session --verbose "reply with exactly: ok" 2>&1) || true)"

  if grep -iE 'error|failed' <<<"$out" | grep -qi chi; then
    bad "chi extension load errors detected" "run pi --verbose manually and read startup output"
  else
    ok "no chi-* load errors in startup output"
  fi

  local name
  for name in chi-base chi-buzz chi-sync chi-commons; do
    if grep -qi "$name" <<<"$out"; then
      ok "startup output mentions $name"
    else
      info "startup output does not mention $name (verify manually with pi --verbose)"
    fi
  done
  rm -rf "$tmp"
}

# ------------------------------------------------------------- phase: manual
phase_manual() {
  hdr "Phase 5-7: manual smoke steps (interactive)"
  cat <<'EOF'
  Run inside the Pi TUI (see docs/BOOTSTRAP.md section 6 for details):

  [5a] /chi opens                 -> start pi, type /chi
  [5b] @mention cohort fallback   -> type @, completion offers cohort handles
                                     even with no cohort config present
  [6a] /sync scanner gate         -> hide gitleaks from PATH, /sync must fail
                                     with an install hint BEFORE syncing;
                                     restore PATH, /sync must pass
  [6b] fresh-machine hydrate      -> PI_CODING_AGENT_DIR=$(mktemp -d) pi
                                     then hydrate/resume the prior session
  [7]  /commons R1 insertion      -> reduce a fixture session to R1, insert
                                     historical context, verify no raw-log leak
EOF
}

# ------------------------------------------------------------------- runner
ALL_PHASES=(env auth install load manual)

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${ALL_PHASES[@]}"
  exit 0
fi

PHASES=("${@:-}")
[ -z "${PHASES[0]:-}" ] && PHASES=("${ALL_PHASES[@]}")

for p in "${PHASES[@]}"; do
  case "$p" in
    env) phase_env ;;
    auth) phase_auth ;;
    install) phase_install ;;
    load) phase_load ;;
    manual) phase_manual ;;
    *) echo "unknown phase: $p (see --list)"; exit 2 ;;
  esac
done

hdr "Summary"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '  failed: %s\n' "${FAILED_CHECKS[@]}"
  exit 1
fi
exit 0
