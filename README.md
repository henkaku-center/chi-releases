# Chi releases

Public release and workshop bootstrap repository for Chi beta packages.

This repository should contain install instructions, pinned package refs, dev.exe bootstrap checks, provider-auth validation, scanner validation, and smoke scripts. It should not contain private source code or raw session logs.

Start here:

- [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) — fresh exe.dev machine to working Chi Pi session, step by step.
- [packages.env](packages.env) — pinned Chi package refs (single source of truth).
- [scripts/smoke-dev-exe.sh](scripts/smoke-dev-exe.sh) — automated environment/auth/install/load checks plus manual smoke checklist.

Quick start on a bootstrapped machine:

```bash
scripts/smoke-dev-exe.sh          # all phases
scripts/smoke-dev-exe.sh --list   # available phases: env auth install load manual
```

See [MVP_PLAN.md](MVP_PLAN.md) for scope and acceptance criteria.
