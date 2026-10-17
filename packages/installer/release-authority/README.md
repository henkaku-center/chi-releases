# Release authority — authorized dogfood policy

The public publisher is **henkaku-center/chi-releases**, workflow **release.yml**,
environment **npm-release**. The private monorepo must stay private. npm provenance
requires a **public** source repository; publishing in private CI and uploading
a tarball elsewhere does not change the attested publisher identity.

The checklist lives in the public repository's `docs/OPERATIONS.md`. On October
17, 2026 the operator explicitly authorized agents to configure and execute this
dogfood release path through the existing `gszep` GitHub identity (user ID
17977117). Preserve that login; bot commit authorship is separate. These templates
are reviewable inputs, never proof that settings were applied.

Use separate builder/reviewer agent sessions and record exact-head review and CI
before release. They share one GitHub principal: this is **not independent human
approval**. The existing reviewer can approve `npm-release` with self-review
allowed; no new non-shared account/team is required. Shared credentials and
writer-controlled CI remain dogfood trust limits, not stronger ecosystem guarantees.

## Tag authority

The creation rule permits only the existing `gszep` user to create `chi-v*` tags.
Do not activate an empty-bypass creation restriction: update its actor and
enforcement together. This bypass applies only to tag creation, never protected
branches or tag updates/deletions:

```sh
REPO=henkaku-center/chi-releases
gh api --method POST repos/$REPO/rulesets \
  --input packages/installer/release-authority/tag-ruleset.json
```

Use POST only when the rule is absent; update an existing matching rule with PUT
to its exact ruleset ID instead of creating duplicates. Verify the saved actor,
scope and enforcement after every write.

Create or retain a **second** active tag ruleset for the same `refs/tags/chi-v*`
pattern using `immutable-tag-ruleset.json`, with **no bypass actors**. A creation bypass must not
allow rewriting or deleting releases. Apply equivalent private-`chi` tag rules
before granting export access. Protect public main with PR review and required
CI; the exporter only creates `snapshots/chi-v1.x.y` plus the matching tag, never
writes main. The public control files come from the reviewed public main.
Keep the private `public-export` environment tag-only and disable administrator
bypass there too; do not add another human-identity gate or alter its secret value.

## Environment and npm identity

The publish job declares `environment: npm-release`. Create it in **chi-releases**:

```sh
gh api --method PUT repos/$REPO/environments/npm-release \
  --input packages/installer/release-authority/npm-release-environment.json
gh api --method POST repos/$REPO/environments/npm-release/deployment-branch-policies \
  --field name='chi-v*' --field type=tag
```

The template uses `custom_branch_policies: true`, `protected_branches: false`,
the existing user as reviewer and `prevent_self_review: false`. This makes agent
execution through that same principal workable after separately recorded review.
In Settings → Environments → npm-release turn off **Allow administrators to bypass**.
A workflow environment name alone does not create these protections.
Public environments support these controls on the organization's Team plan.

Using existing npm owner access, verify **henkaku-center / chi-releases /
release.yml / npm-release**, with direct `npm publish` allowed. Preserve a valid
matching connection; renew only an expired matching connection through the normal
UI. Prefer 2FA with bypass-2FA publishing tokens disallowed; all npm publishing
access options are compatible with OIDC, so an otherwise validated first dogfood
release need not wait on changing an already-compatible selection. Never introduce
a publishing-token fallback. Leave
`jsonl-reduce`'s publisher alone; it remains in private `chi/release.yml`. A browser
security-key/2FA challenge requires actual interactive completion, never a workaround.

## Export credential

First reuse and verify the existing export-secret binding; do not read its value
or request a replacement token merely because ownership is not yet confirmed.
The existing export workflow verifies that secret's authenticated principal against
the reviewed creation actor after scanning and before any public write.
If a real access failure requires replacement, the existing authorized account creates a fine-grained PAT selected for
**chi-releases only**, with **Contents read/write** and automatic Metadata read.
No Workflows, Administration, npm or private-repository permission. Obtain org
approval and an expiry. Store it as **CHI_RELEASES_CONTENTS_TOKEN** in private
`chi`'s **public-export** environment, restricted to tags `chi-v*`. This is the
implemented credential option; do not create an SSH key unless the workflow is
separately reviewed to use it. A normal `GITHUB_TOKEN` cannot cross-push here or
trigger the destination workflow. No credential value belongs in Git or chat.

## Release order

1. Merge both reviewed pipeline PRs after final-head CI passes, public tooling
   first. Authorized agents may configure the controls and npm binding through
   existing authenticated access. Stop only for actual permission/interactive-2FA
   barriers; never extract credentials or bypass a challenge.
2. Finish clean-host build/supervision/pairing and independent publication review;
   only then change installer `private` to `false` in a reviewed source PR.
3. Synchronize exact allowlists in both repositories whenever files change.
4. The authorized release agent, using the existing principal, pushes the matching private `chi-v1.x.y` tag. The
   exporter scans the source snapshot and creates public-only branch/tag refs.
5. Review the public snapshot and passing Linux/macOS tests before approving
   `npm-release`. Inspect the registry attestation and release checksums after
   the first real publish. No such operation is performed by this change.

Retries never overwrite tags or npm versions. If npm succeeds but GitHub release
creation fails, verify that run's artifact against npm provenance and create only
the missing GitHub release; never republish or retag. See public OPERATIONS for
details. Tests do not establish live OIDC or clean-host acceptance.
