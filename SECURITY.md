# Security policy

Report a suspected vulnerability privately to the Henkaku Center maintainers
through GitHub private vulnerability reporting when enabled. If that option is
unavailable, open an issue asking for a private contact **without exploit details,
credentials, personal data or session logs**. Never paste private diagnostics into
this public repository.

The supported release line will be `@henkaku-center/chi@1.x`; it is not published
yet. Pi packages below 1.0.0 are deprecated and unsupported, but remain available.

## Trust boundary

Public commits contain reviewed installer source snapshots, not the private
monorepo's history. An exact-file allowlist plus gitleaks gates export; scanning
does not detect arbitrary private prose, so human source review is also required.
An exporter with Contents write can push source/tags, but has no npm credential.
Only this repository's protected `release.yml` publish job receives the OIDC
identity accepted by npm. Tag creation authority, immutable tag rules and human
environment approval are essential; see `docs/OPERATIONS.md`.

Auto-update requires the reviewed npm registry signature, exact tarball URL and
SHA-512, and Sigstore SLSA v1 provenance. The workflow repository/path/ref and
certificate identity must name `henkaku-center/chi-releases`,
`.github/workflows/release.yml`, and the exact `chi-v<version>` tag. Certificate
identity matching is anchored and regex-escaped. Checksums alone are not release
authorization. Trusted-root rotation requires a reviewed bootstrap; updates fail
closed until then.

CI uses synthetic fixtures and isolated HOME/XDG. It neither runs historical Pi
scripts nor authenticates to live collaborators' services. npm publication and
GitHub release creation cannot be proven end to end by these non-publishing
tests; the first authorized release must inspect its registry attestation.
