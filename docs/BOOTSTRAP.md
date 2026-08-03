# Chi beta bootstrap (exe.dev / fresh machine)

One clear path from a clean [exe.dev](https://exe.dev) VM (or any fresh Linux
machine) to a working Pi terminal with the Chi beta modules installed.

Order matters. Follow the phases top to bottom. Every phase has a check you
can run; `scripts/smoke-dev-exe.sh` automates all of them.

## 0. Prerequisites

A fresh exe.dev VM ships with `git` and a shell. You need:

- Node.js >= 20 (nvm recommended)
- `gh` (GitHub CLI)
- `gitleaks` and `trufflehog` (secret scanners, required by `/sync`)

### Node via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install --lts
node --version   # expect v20+
```

### GitHub CLI

```bash
# Debian/Ubuntu (exe.dev default image)
sudo apt-get update && sudo apt-get install -y gh
gh --version
```

### Secret scanners

```bash
mkdir -p ~/.local/bin

# gitleaks (pick the latest release for your arch)
curl -sL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_8.21.2_linux_x64.tar.gz \
  | tar -xz -C ~/.local/bin gitleaks

# trufflehog
curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh \
  | sh -s -- -b ~/.local/bin

export PATH="$HOME/.local/bin:$PATH"   # add to ~/.bashrc too
gitleaks version && trufflehog --version
```

## 1. Install Pi

```bash
npm install -g @earendil-works/pi-coding-agent
pi --version
```

If `pi` is not found afterwards, your npm global bin is not on `PATH`
(`npm bin -g` shows where it is).

## 2. GitHub auth (required before package install)

The Chi beta packages live in private GitHub repos. `pi install` clones them
over HTTPS, so git must be able to authenticate via `gh`:

```bash
gh auth login          # choose GitHub.com, HTTPS, login via browser
gh auth setup-git      # wires gh as the git credential helper
gh auth status         # must show: Logged in to github.com
```

If `pi install` later fails with a clone/auth error, the fix is here — not
in npm. Re-run `gh auth status` and `gh auth setup-git` first.

## 3. Install Chi packages (in order)

Pinned refs live in [`packages.env`](../packages.env) at the repo root.
Install in this order — `chi-base` first:

```bash
pi install https://github.com/henkaku-center/chi-base
pi install https://github.com/henkaku-center/chi-buzz
pi install https://github.com/henkaku-center/chi-sync
pi install https://github.com/henkaku-center/chi-commons
pi list    # all four should appear
```

Notes:

- `jsonl-reduce` is a library dependency of `chi-commons`; do **not** install
  it separately unless it becomes its own Pi package.
- To update later: `pi update`.

## 4. Provider auth (Codex / Gemini / Claude)

Henkaku provides provider access for the beta. Pi reads provider credentials
from environment variables or its own auth store. Validate **without printing
token values**:

```bash
# Presence-only check (prints SET/UNSET, never the value):
for v in ANTHROPIC_API_KEY GEMINI_API_KEY GOOGLE_API_KEY OPENAI_API_KEY; do
  if [ -n "${!v:-}" ]; then echo "$v: SET"; else echo "$v: unset"; fi
done

# Pi can enumerate models it has credentials for:
pi --list-models | head
```

Never `echo` a key, paste one into a session, or commit one. The `/sync`
scanner gate exists to catch exactly that, but do not rely on it.

## 5. Start Pi in the workshop project

```bash
mkdir -p ~/chi/workshop && cd ~/chi/workshop
pi
```

On first start in a project containing `.pi/settings.json`, Pi asks you to
trust the project. Approve it so project-local package refs load (or run
`pi --approve` / `pi -a` once).

## 6. Manual MVP smoke steps

Run these inside the Pi TUI after bootstrap. Automated pre-checks:
`scripts/smoke-dev-exe.sh` (phases 1–4 are non-interactive).

1. **Modules load** — start `pi`; startup output lists the four chi packages
   with no load errors.
2. **`/chi` opens** — type `/chi`; the command must exist and open.
3. **`@mention` fallback** — type `@` in the composer; completion should
   offer cohort handles. With no cohort config present, the fallback list
   must still appear (not an empty/broken completion).
4. **`/sync` scanner gate** — temporarily move `gitleaks` off `PATH`
   (`PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '.local/bin' | paste -sd:)`)
   and run `/sync`: it must fail *before* syncing with a message telling you
   to install the scanner. Restore `PATH` and `/sync` again: it should pass.
5. **Fresh-machine hydrate/resume** — in a new shell:

   ```bash
   export PI_CODING_AGENT_DIR=$(mktemp -d)
   cd ~/chi/workshop && pi
   ```

   Run the chi hydrate/resume flow; the prior session must be recoverable
   from sync storage on this "clean machine".
6. **Commons R1 insertion** — run `/commons` and insert R1 historical
   context from a reduced fixture session; verify context appears in the
   conversation without raw log leakage.

## Acceptance criteria (from MVP_PLAN.md)

- A new participant gets from clean exe.dev to a working Pi session using
  only this document.
- A missing scanner fails before sync with an actionable message.
- A private package install failure points at GitHub auth, not npm.
- No provider token is ever printed by any check in this repo.
- The fresh `PI_CODING_AGENT_DIR` resume test passes before the beta.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `pi install` fails cloning a `henkaku-center` repo | `gh auth status`, then `gh auth setup-git`, retry |
| `pi: command not found` | npm global bin not on `PATH`; check `npm bin -g` |
| `/sync` refuses to run | install `gitleaks` + `trufflehog` (section 0) |
| `pi --list-models` shows nothing for a provider | provider env var unset; get credentials from Henkaku |
| project settings ignored | project not trusted; re-run `pi -a` in the project dir |
