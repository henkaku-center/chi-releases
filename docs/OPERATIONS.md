# Operator setup (prepared, not applied)

These actions require human GitHub/npm accounts. Merge the reviewed pipeline PRs
only after final-head CI is green. No setup below is performed by a PR or by CI.
Keep `henkaku-center/chi` private: its history is not approved for disclosure.

## 1. Protect release authority before granting export access

On **henkaku-center/chi-releases**, protect main with pull requests, required
`release-tools` CI and review of workflow/allowlist changes. Do not give the export
principal a main-branch bypass. The exporter writes only new `snapshots/chi-v*`
branches and matching tags, based on the reviewed public main commit.

Create two active tag rulesets matching `refs/tags/chi-v*`:

1. Restrict **creation**, bypass only a dedicated release team containing the
   export credential's non-shared human owner. Do not grant OrganizationAdmin
   bypass: agent sessions share a human CLI login. Team membership, not bot commit
   authorship, controls authorization. Restrict snapshot-branch creation to the
   same release principal if desired; the tags are the publication authority.
2. Restrict **updates and deletions**, with **no bypass actors**. Separate rules
   keep the creation bypass from permitting retags. Never move a published tag.

In private `chi`, restrict `chi-v*` tag creation to a dedicated release team and
forbid updates/deletions likewise. Limit its `public-export` environment to tag
pattern `chi-v*`, and store the export secret there. Private-repository environment
reviewers may be unavailable on the organization's plan; tag rules remain
mandatory. Do not grant release authority to agents merely because they author
commits as a bot.

## 2. Fine-grained export token

A human creates a fine-grained PAT with resource owner **henkaku-center**, selected
repository **chi-releases only**, **Contents: read and write** and the automatically
required **Metadata: read**. No Workflows, Actions, Administration, npm or private
repository access is needed. Use expiry, org approval if required, and a dedicated
non-shared release account in the creation-bypass team. Store it in private
`chi`'s `public-export` environment as **CHI_RELEASES_CONTENTS_TOKEN**. Do not print
it, put it in Git or share it through agent chats. Rotate/revoke through human
settings. The token is used only after the snapshot passes allowlist and gitleaks.

This workflow implements the fine-grained-token option, not an SSH deploy key.
The ordinary private-repo `GITHUB_TOKEN` cannot push across repositories, and its
pushes would not trigger the destination release workflow. The PAT push does.
The exported commit inherits public workflows from main; it cannot replace them.

## 3. Public npm-release environment

Create **npm-release** in **chi-releases**, with:

- required independent human reviewers (not the export token owner);
- prevent self-review;
- disable **Allow administrators to bypass**;
- selected deployment tags only: `chi-v*` (no branch policy).

The workflow declares `environment: npm-release` only on its publish job, after
both build/test platforms finish. Its job-scoped permissions are Contents write
for the GitHub release and ID-token write for npm/Sigstore. PR CI and build jobs
have only Contents read. A missing environment can be auto-created unprotected
by GitHub; **create and verify the protections before the first tag**.

## 4. Move the npm trusted publisher

As an npm owner of **@henkaku-center/chi**, remove the old private-`chi` trusted
publisher and create the replacement in package Settings → Trusted publishing:

- organization: **henkaku-center**;
- repository: **chi-releases**;
- workflow filename: **release.yml** (not the full path);
- environment: **npm-release**;
- explicitly allow direct **npm publish** (not stage-only).

Publisher connections cannot be edited in place: delete the old connection and
add the new one. Do not change `jsonl-reduce`'s trusted publisher. Configure
publishing access to require 2FA and disallow long-lived tokens. No `NPM_TOKEN`
or `NODE_AUTH_TOKEN` secret is part of this design. Node 24.18.0 and npm 11.16.0
are pinned; npm trusted publishing requires npm >=11.5.1 and Node >=22.14.0.

Official references: npm's **Trusted publishing for npm packages** and
**Generating provenance statements**; GitHub's **Managing rulesets for a
repository** and **Managing environments for deployment**. Review their current
UI/API fields when applying these human-account settings.

## 5. First authorized release (a later operation)

1. Complete the installer's clean-host build/supervision/pairing acceptance and
   independent security review. The candidate remains `private: true` until a
   reviewed private-source PR explicitly changes it to `false` and sets version.
2. Keep the exact export allowlists synchronized through PRs. Public tooling must
   be merged first. The snapshot is built from committed blobs, not local files;
   source/tag mismatch, new paths, missing files, links and scanner errors fail
   before any public push. Review allowlisted prose for private facts too.
3. A release-authorized human pushes matching `chi-v1.x.y` in private `chi`.
   The export job creates a public-only commit and atomically creates its snapshot
   branch/tag. It never pushes main or private objects. Retries refuse existing
   refs; resolve failures rather than force-pushing.
4. Inspect the now-public source snapshot, its file manifest and completed tests
   before approving `npm-release`. The npm tarball and both checksum files come
   from the tested build artifact in that same workflow run. No rebuild occurs
   under the publish identity.
5. Inspect npm's attestation: public repository/workflow, matching tag, exact
   package version and tarball digest. Verify GitHub assets against the registry
   tarball. Only then advertise a versioned installation command. The workflow
   never undeprecates or unpublishes old Pi versions.

If npm publication fails, no GitHub release is created. Re-running a job after
npm succeeds but release creation fails will encounter npm's immutable-version
error; do not republish or retag. A human may verify the existing attestation and
tarball against that run's artifacts, then create only the missing GitHub release
with its checksums. New code or changed artifacts require a new version/tag.
Keep the release artifact within its seven-day retention or download it privately
for this recovery. No automated "already published" bypass accepts arbitrary
registry bytes.
