# Chi Releases MVP plan

Date: 2026-08-03
Role: beta/workshop install, dev.exe bootstrap, and smoke validation
Owner: Grisha

## MVP outcome

`chi-releases` gives beta participants and test agents one clear path from a clean dev.exe environment to a working Pi terminal with Chi modules installed, provider auth available, scanners present, dynamic `@mentions`, Commons import, and cross-machine sync/resume smoke-tested.

## In scope

- Human install instructions.
- Pinned package refs for private GitHub Pi packages.
- dev.exe bootstrap checklist.
- Scanner checks:
  - `gitleaks`
  - `trufflehog`
- GitHub auth checks:
  - `gh auth status`
  - `gh auth setup-git`
- Pi package install/update commands.
- Henkaku-provided provider auth checks for Codex/Gemini/Claude through Pi/dev.exe.
- Smoke scripts:
  - packages load
  - `/chi` opens
  - dynamic `@mention` completion has cohort fallback
  - `/sync` scanner gate works
  - fresh-machine/dev.exe hydrate/resume works
  - `/commons` can insert R1 historical context

## Out of scope

- Private module source code.
- Raw/rich session logs.
- Backend implementation.
- Provider secret material.
- LMS/PWA/service-layer UI.

## Package install order

For private GitHub sources during beta:

```bash
gh auth login
gh auth setup-git

pi install https://github.com/henkaku-center/chi-base
pi install https://github.com/henkaku-center/chi-buzz
pi install https://github.com/henkaku-center/chi-sync
pi install https://github.com/henkaku-center/chi-commons
```

`jsonl-reduce` is a library dependency of `chi-commons`; install separately only if it becomes a Pi package with its own extension.

## dev.exe validation checklist

A real target-environment test must confirm:

- `pi --version` works.
- Node/npm environment matches package needs.
- `gh auth status` works for private package clones.
- `gitleaks` and `trufflehog` are installed and runnable.
- Henkaku provider auth is available to Pi without exposing secrets in logs.
- `pi install` can install all private packages.
- Pi starts inside the workshop project cwd.
- Project trust flow allows project `.pi/settings.json` package refs if used.

## Smoke script outline

Create `scripts/smoke-dev-exe.sh` with phases:

1. Environment:
   - print versions of `pi`, `node`, `npm`, `gh`, `git`, `gitleaks`, `trufflehog`
2. Auth:
   - `gh auth status`
   - Pi model/provider listing or minimal no-output auth check
3. Install:
   - `pi install` pinned refs
   - `pi list`
4. Module load:
   - start Pi in a test repo with packages enabled
   - verify `/chi` command exists
5. Collaboration:
   - configure cohort handles
   - verify `@` autocomplete fallback path manually or through Pi UI test if available
6. Sync:
   - create short test session
   - sync
   - hydrate from clean PI_CODING_AGENT_DIR
7. Commons:
   - reduce a fixture/session to R1
   - insert historical context

## Acceptance tests

- A new beta participant can follow README from clean dev.exe to working Pi session.
- Missing scanner fails before sync and tells user how to fix the environment.
- Private package install failure points to GitHub auth setup, not generic npm errors.
- Provider auth validation does not print provider tokens.
- Fresh dev.exe resume test passes before the beta.

## Agent start command

```bash
cd ~/chi/github/henkaku-center/chi-releases
pi
```

Suggested first prompt:

> Build the beta/dev.exe bootstrap: pinned Pi package install docs, scanner/provider auth checks, and a smoke script that validates module load, @mention fallback, sync/resume, and Commons insertion without leaking secrets.
