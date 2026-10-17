# Chi: shared conversations for agent work

Chi connects people working with coding agents: share repository-scoped conversation
evidence, mention a collaborator, and open the exact message behind a request.
OpenCode runs the agent, Paseo connects its host to the app, and Chi controls shared
evidence and repository access.

## For collaborators

- Open the [Chi app](https://chi.henkaku.center) and use **your own GitHub account**
  for Chi authorization. Access is checked against the **project being shared**;
  you do not need access to Chi's private development repository.
- A received mention opens a **read-only** shared conversation. Reading that view
  needs no local project checkout or running agent. This is not a promise of a
  host-free inbox: the current Paseo app's host connection and Chi authorization
  are separate, and another person's paired host does not establish your identity.
- **Fresh-host installer 1.0.0 is published**, verified October 17, 2026. Follow
  [the exact release](https://github.com/henkaku-center/chi-releases/releases/tag/chi-v1.0.0)
  and [setup/verification instructions](AGENTS.md); no private Chi checkout is
  required. Existing-install takeover is not supported. Versions below 1 remain
  retired Pi packages, not an installation fallback.
- Current v3 shared reading does not establish working replies, checked resolution
  or Continue. Ask the sender to confirm your access and supported reading route
  before relying on a mention for a handoff.

**[Agent setup and verification — AGENTS.md](AGENTS.md)** gives the detailed readiness
checks, authentication boundaries and existing-host configuration procedure.

## Installer releases

Public source snapshots and release automation for `@henkaku-center/chi@1.x`.
The first release is **`@henkaku-center/chi@1.0.0`**, tag **`chi-v1.0.0`**,
public source **`88db51338ba89339d602ee8ca077999b5698053c`**. The registry tarball,
tested artifact and GitHub release asset match, with verified npm signature and
Sigstore provenance from this repository's `release.yml` and exact tag.
Tarball SHA-256: `d61aeb1c51a001bef305f90bca469a3d295091fa7a09099ca70cd927b1ff8c9c`.

After checking the release, host and consent requirements in [AGENTS.md](AGENTS.md):

```sh
npx --yes @henkaku-center/chi@1.0.0 install --choices /absolute/path/choices.json --dry-run
```

Review the plan, then omit `--dry-run` and confirm interactively. This builds the
pinned public forks locally. Real fresh-host supervision and encrypted local-relay
pairing passed on macOS arm64 and x64. Linux has contract tests, not equivalent
real clean-host acceptance. Personal authentication and real-account hosted
collaboration remain separate; installation is not proof of mention delivery.

## Release boundary

1. A reviewed stable `chi-v1.x.y` tag in the private development repository
   selects **only** the exact files in `scripts/snapshot-files.json`: the
   standalone installer, its locks/build/tests, minimal embedded plugin/helper
   source closure, license and trust documentation.
   New installer paths require allowlist review in both repositories.
2. The private export job reads committed blobs (never copies `.git`), refuses
   symlinks/submodules and scans the complete snapshot with pinned gitleaks.
   It exports no private history, private commit metadata, backend service,
   sessions or secrets; one allowlisted HTTP helper supports the embedded plugin.
3. A fresh checkout of **this repository's main** supplies the release tooling.
   The export creates a public-only commit on `snapshots/chi-v1.x.y` and atomically
   pushes that branch plus the matching tag. Main is not changed by the exporter.
   The snapshot includes a file-by-file SHA-256 manifest, without private
   source-commit metadata. Reviewed runtime pins remain in installer source.
4. **This repository's** `.github/workflows/release.yml` verifies the snapshot,
   builds, tests and mutation-tests it on Linux/macOS, packs the tested Linux
   output, and publishes that exact tarball with `npm publish --provenance`.
   The publish job requires the protected `npm-release` environment and OIDC.
   Its source, workflow and tag are publicly inspectable before publication.
5. The workflow creates a GitHub release with the npm tarball, `SHA256SUMS` and
   `SHA512SUMS`. The installer separately checks npm signatures and Sigstore
   provenance bound to this repository, `release.yml`, and the exact release tag.

No release runs on pull requests, main pushes, manual dispatch or malformed tags.
An installer manifest with `private: true` is refused; the 1.0.0 publication flag
was changed only after clean-host acceptance and publication review. Exporting source and
publishing npm are distinct privileges. The root package is private tooling;
only `packages/installer` in a release snapshot is publishable.

## Operators and contributors

- [Operator setup and recovery](docs/OPERATIONS.md): scoped export credential,
  tag rules, environment approval and npm trusted publisher migration.
- [Security policy](SECURITY.md): disclosure and trust boundaries.
- A release tag's `packages/installer/README.md` and `TRUST.md` describe the
  installer and its exact verification policy.
- With Node 24.18.0: `npm ci --ignore-scripts && npm test && npm run test:mutations`.
  Snapshot branches additionally run the installer's own locked install/tests.

## Retired Pi packages

The former Pi distribution and modules remain on npm, **deprecated, never
unpublished**. [Legacy inventory](docs/LEGACY-PI.md) lists versions and retained
bootstrap URLs. Historical scripts are not executed by CI or release jobs.
The standalone `@henkaku-center/jsonl-reduce` library is not retired and keeps its
separate release pipeline; this repository does not publish it.
