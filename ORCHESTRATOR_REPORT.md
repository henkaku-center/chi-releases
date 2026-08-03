# Orchestrator report — chi-releases bootstrap scaffolding

Agent: chi-releases implementation agent
Date: 2026-08-03

## Summary

Created the fresh exe.dev install/bootstrap documentation and smoke script
scaffolding per MVP_PLAN.md:

- `docs/BOOTSTRAP.md`: full path from clean exe.dev VM to working Pi + Chi
  session — nvm/Node, gh, gitleaks/trufflehog install, Pi install from
  scratch, `gh auth login`/`setup-git` before private installs, ordered
  `pi install` of the four chi packages, presence-only provider auth checks
  (never prints token values), project trust flow, manual MVP smoke steps
  (modules load, `/chi`, `@mention` cohort fallback, `/sync` scanner gate,
  fresh `PI_CODING_AGENT_DIR` hydrate/resume, `/commons` R1 insertion), and
  a troubleshooting table mapping failures to fixes (install failure ->
  GitHub auth, not npm).
- `packages.env`: pinned package refs as single source of truth (bash-
  sourceable array + optional expected-sha placeholders + min Node major).
- `scripts/smoke-dev-exe.sh`: phased smoke script (`env auth install load
  manual`), selectable phases, PASS/FAIL summary with hints, exit 1 on any
  failure. Auth phase includes a real private-repo read check via
  `GIT_TERMINAL_PROMPT=0 git ls-remote` and `pi --list-models` as a
  no-secret provider credential probe.
- `README.md`: points to the above with quick-start commands.

## Files changed

- `docs/BOOTSTRAP.md` (new)
- `packages.env` (new)
- `scripts/smoke-dev-exe.sh` (new, executable)
- `README.md` (updated)
- `ORCHESTRATOR_REPORT.md` (this file)

## Validation results

- `bash -n scripts/smoke-dev-exe.sh` — syntax OK (shellcheck not installed
  on this machine).
- `scripts/smoke-dev-exe.sh env` — 8/8 PASS on this dev machine.
- `scripts/smoke-dev-exe.sh auth` — 6 PASS, 0 FAIL; confirmed no token
  values printed; `git ls-remote` reads private `chi-base` successfully.
- Install flow validated end-to-end: `pi install
  https://github.com/henkaku-center/chi-base` succeeded, then removed with
  `pi remove` to leave dev-machine global settings unchanged.
- `install` and `load` phases not run to completion here (would mutate the
  developer's global Pi settings with all four packages); designed for the
  actual exe.dev target run.

## Blockers

- None hard. Notes:
  - `chi-buzz`/`chi-sync`/`chi-commons` install not yet exercised (repos may
    not exist / be package-ready yet); the script will report per-package
    failures with auth-vs-access hints.
  - Pi installer ref pinning: `packages.env` has sha placeholders but drift
    is only reported, not enforced, until pinning support is confirmed.
  - Phases 5–7 (mention fallback, sync gate, hydrate, commons) are manual;
    automating them needs the chi packages to expose testable hooks.

## Next recommended prompt

> On a clean exe.dev VM (or with a scratch PI_CODING_AGENT_DIR), run
> `scripts/smoke-dev-exe.sh` end to end including the `install` and `load`
> phases against all four chi packages. Fix any per-package install/load
> failures, fill in the pinned shas in `packages.env` for the workshop, and
> convert the manual `/sync` scanner-gate check into an automated phase once
> chi-sync exposes a non-interactive check command.
