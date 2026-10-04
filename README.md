# Chi installer releases

Public source snapshots and release automation for `@henkaku-center/chi@1.x`.
The installer is still an **unpublished candidate**. This migration does not
publish a package, create a tag, or enable a trusted publisher. The npm `latest`
version is still the deprecated Pi distribution; do not use an unversioned
`npx @henkaku-center/chi` as a new-install instruction yet.

## Release boundary

1. A reviewed stable `chi-v1.x.y` tag in the private development repository
   selects **only** the exact files in `scripts/snapshot-files.json`: the
   standalone installer, its locks/build/tests, license and trust documentation.
   New installer paths require allowlist review in both repositories.
2. The private export job reads committed blobs (never copies `.git`), refuses
   symlinks/submodules and scans the complete snapshot with pinned gitleaks.
   It exports no private history, commit metadata, backend, sessions or secrets.
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
The candidate's `private: true` is a second hard block; changing it requires the
separate clean-host acceptance and publication review. Exporting source and
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
