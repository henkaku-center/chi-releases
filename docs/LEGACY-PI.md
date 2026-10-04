# Historical Pi distribution

Read-only inventory checked October 4, 2026 against every published version in
the public npm registry. Pi is retired. Keep these versions available for existing
installations and historical reads; never unpublish or republish them.

| Package (`@henkaku-center/`) | Published versions | Status |
| --- | --- | --- |
| `chi` | 0.1.0, 0.2.0, 0.3.0 | Deprecated Pi distribution |
| `chi-base` | 0.1.0 | Deprecated |
| `chi-buzz` | 0.1.0 | Deprecated; replaced by messaging in Chi 0.2 |
| `chi-sync` | 0.1.0, 0.2.0 | Deprecated |
| `chi-commons` | 0.1.0, 0.2.0 | Deprecated |
| `chi-messaging` | 0.1.0 | Deprecated |
| `chi-theme` | 0.1.0 | Deprecated; bundled by Chi 0.3 |
| `jsonl-reduce` | 0.1.0, 0.2.0 | **Not deprecated**; standalone library |

The old repository manifest described `chi@0.1.0-alpha.0`, which was not a
published registry version. The actual three released distribution tarballs
bundle their Pi dependencies and contain no `chi-releases` references. Their
entry points resolve within the packages, not to this repository's main branch.
They have no install/postinstall script in the distribution manifest. Do not
point new Pi installs at `chi@latest`: the name's 1.x line is reserved for the
new installer.

For compatibility with historical human links, retain these paths:

- `docs/BOOTSTRAP.md`: marked historical at the top.
- `packages.env`: original package URLs and commit pins.
- `scripts/smoke-dev-exe.sh`: original historical smoke/install helper, unchanged.

The two retained executable/config files are checksum-locked by the release-tools
tests. They are never part of a new installer tarball and are never executed by
the release pipeline. Development-only `dev-pi.sh`, `check-refs.sh`, the sibling
workspace template and old planning/report files are removed; their exact prior
versions remain at commit `c4b2267` in public history.

Before migration the repository had 10 tracked files, 27 commits, no tags,
GitHub releases or workflows. All tracked content was read; all 44 unique blobs
were checked for private-content indicators. Gitleaks (all refs) and TruffleHog
found no secrets. No private source, meeting/session records, credentials or
personal-contact data were found. This is a scoped inspection, not proof that a
secret scanner detects every possible private fact. The existing public history
is retained; no private-repository history is imported.
