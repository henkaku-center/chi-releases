# Installer verification inputs

`src/trusted-root.json` is the public Sigstore trusted root from
`sigstore/root-signing@644d7f24720ff4cddbc49908ead3c6459e637616`,
`targets/trusted_root.json`, retrieved October 2, 2026. It is bundled into
`dist/sigstore.js` with locked `@sigstore/verify@4.1.2`, `@sigstore/bundle` and
protobuf dependencies. Verification requires their default one certificate-
transparency entry, one transparency-log entry and one authenticated timestamp.
No runtime trust download, cache or root override exists. A root rotation requires
a reviewed installer release. Dependency licenses are retained in the bundle.

## Exact public publisher identity

The release policy accepts only SLSA v1 GitHub Actions workflow statements and a
Fulcio certificate with issuer `https://token.actions.githubusercontent.com` and
the full SAN
`https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v<version>`.
`src/sigstore.ts` pins that repository and workflow; `src/registry.ts` checks the
signed workflow repository/path/ref against the same constants. The former
private `henkaku-center/chi` publisher is rejected.

Because `@sigstore/verify` treats `subjectAlternativeName` as a JavaScript regular
expression, the installer escapes that identity and anchors it (`^…$`) before
matching. Longer/altered tags (`chi-v1.0.10`, `chi-v1.0.1-evil`, `chi-v1x0x1`),
prefix/suffix injection and a different repository/workflow are rejected even
when the signed statement names the exact expected tag. The sole subject must
be `pkg:npm/%40henkaku-center/chi@<version>` with the tarball's SHA-512. The
reviewed npm ECDSA key separately authenticates `name@version:integrity`.

`test/fixtures/sigstore-verify-4.1.2.json` is public npm attestation data retrieved
October 2, 2026. It exercises production roots against real signed/logged
provenance, then demonstrates rejection under Chi's identity. It does not
authorize that package as an installer. Lifecycle fixtures use ephemeral
synthetic CAs, signing keys and logs, generated only in the test process.

## Public source snapshots, private development history

`henkaku-center/chi` remains private. Its history contains material that must not
be made public. On a matching stable `chi-v1.x.y` tag, its export workflow reads
only exact allowlisted committed installer/plugin-closure files and LICENSE, rejects links and
unreviewed paths, and runs gitleaks before making any public write. It creates
a new commit in **chi-releases' public history**, on `snapshots/chi-v1.x.y`, and
atomically pushes that branch and matching tag. No private `.git`, authors,
messages, history or non-allowlisted source is copied. No private source-commit
metadata is added; existing reviewed runtime pins remain part of installer source. A SHA-256
manifest binds the exported bytes; it is a consistency check, not a signature.

The public `.github/workflows/release.yml` independently validates the manifest,
builds and tests from the visible source, and publishes the exact tested tarball
with `--provenance` after `npm-release` approval. npm's SLSA/Sigstore identity is
therefore the public repository/workflow that actually executes `npm publish`.
GitHub release assets include the tarball and SHA-256/SHA-512 checksums. Neither
checksums nor an exporter credential grant npm publication authority.

The package remains `private: true` until clean-host acceptance and independent
publication review explicitly change it to `false`; export and publication both
refuse a private candidate. See `release-authority/README.md` for the authorized
dogfood identity, existing export binding, npm trusted publisher, immutable tag
rules and environment setup. Nothing
is published by tests or a PR. OIDC publishing still needs first-release live
verification; local fixtures are not evidence of npm accepting a live attestation.

If Sigstore rotates its trusted roots, auto-update fails closed until the user
bootstraps a newer reviewed installer that bundles those roots, then retries
`update`/auto-update. Rotation is never adopted from registry metadata or cache.
