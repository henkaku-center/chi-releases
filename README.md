# Chi releases

Public release and workshop bootstrap repository for Chi beta packages.

This repository is also the distribution package `@henkaku-center/chi`, the canonical full-stack install target. It contains install instructions, pinned package refs, dev.exe bootstrap checks, provider-auth validation, scanner validation, and smoke scripts. It should not contain private source code or raw session logs.

Start here:

- [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) — fresh exe.dev machine to working Chi Pi session, step by step.
- [packages.env](packages.env) — pinned Chi package refs (single source of truth).
- [scripts/smoke-dev-exe.sh](scripts/smoke-dev-exe.sh) — automated environment/auth/install/load checks plus manual smoke checklist.

Canonical full-stack install once the packages are published:

```bash
pi install npm:@henkaku-center/chi
```

Individual packages remain installable:

```bash
pi install npm:@henkaku-center/chi-sync
pi install npm:@henkaku-center/chi-buzz
pi install npm:@henkaku-center/chi-commons
```

Until publication, the smoke script uses private GitHub package sources.

Development uses checked-out packages, not npm publication. To dogfood all
extensions from one orchestrator session:

```bash
cd ~/chi/github/henkaku-center
./chi-releases/scripts/dev-pi.sh
```

The agent runs from the package parent and can edit all sibling repositories.
After an extension edit, exit Pi and resume through the same launcher:

```bash
./chi-releases/scripts/dev-pi.sh --continue
```

This keeps one source for every module even when released Chi packages are also
installed globally. Push each repository independently; npm is only needed for
deliberate public releases.

Quick start on a bootstrapped machine:

```bash
scripts/smoke-dev-exe.sh          # all phases
scripts/smoke-dev-exe.sh --list   # available phases: env auth install load manual
```

See [MVP_PLAN.md](MVP_PLAN.md) for scope and acceptance criteria.

## Dev workspace

The sibling checkouts form one pnpm workspace. To (re)create it:

```bash
cd ~/chi/github/henkaku-center
cp chi-releases/workspace/pnpm-workspace.yaml .
pnpm install
```

The workspace file overrides the packages' `github:` distribution specs with
local `workspace:*` links so development always runs against the checkouts.
