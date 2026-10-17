# Release operations — authorized dogfood policy

The operator authorized agents to perform this setup and a validated dogfood
release on October 17, 2026 using the existing `gszep` GitHub/npm access. Preserve
the login; bot commit authorship is separate. Use a separate agent reviewer and
record exact-head review/CI, without pretending two agents sharing one GitHub
identity are independent human principals. No new non-shared account/team or
human self-review prohibition is required for this dogfood route.
Merge reviewed pipeline PRs only after final-head CI is green. A PR or template
is not evidence that settings were applied. Shared-principal authorization and
writer-controlled CI remain explicit trust limits.
Keep `henkaku-center/chi` private: its history is not approved for disclosure.

## 1. Protect release authority before granting export access

On **henkaku-center/chi-releases**, protect main with pull requests, required
`release-tools` CI and review of workflow/allowlist changes. Do not give the export
principal a main-branch bypass. The exporter writes only new `snapshots/chi-v*`
branches and matching tags, based on the reviewed public main commit.

Create two active tag rulesets matching `refs/tags/chi-v*`:

1. Restrict **creation**, bypass only the existing `gszep` user (GitHub ID
   `17977117`). Configure actor and active enforcement together; never activate
   an empty-bypass creation rule. Bot authorship confers no GitHub authority.
   The creation bypass grants no protected-branch bypass.
2. Restrict **updates and deletions**, with **no bypass actors**. Separate rules
   keep the creation bypass from permitting retags. Never move a published tag.

In private `chi`, restrict `chi-v*` tag creation to the same existing user and
forbid updates/deletions likewise. Limit its `public-export` environment to tag
pattern `chi-v*`, and store the export secret there. Private-repository environment
reviewers may be unavailable on the organization's plan; tag rules remain
mandatory. Release authority here comes from explicit operator authorization,
not from an agent's bot commit identity.
Retain tag-only `public-export` scope and disable administrator environment bypass.
Update existing exact ruleset IDs; create only missing rules. Verify saved scope,
actors and enforcement, without altering protected-branch bypass settings.

## 2. Fine-grained export token

Reuse the existing **CHI_RELEASES_CONTENTS_TOKEN** binding first. Its presence
does not prove owner/scope, but uncertainty alone is not a reason to request or
create a replacement. Never read or export its value. If an actual access failure
requires replacement, use the existing authorized account with a fine-grained PAT,
resource owner **henkaku-center**, selected
repository **chi-releases only**, **Contents: read and write** and the automatically
required **Metadata: read**. No Workflows, Actions, Administration, npm or private
repository access is needed. Use expiry and org approval if required. Store it in private
`chi`'s `public-export` environment as **CHI_RELEASES_CONTENTS_TOKEN**. Do not print
it, put it in Git or share it through agent chats. Rotate/revoke through human
settings. The token is used only after the snapshot passes allowlist and gitleaks.

This workflow implements the fine-grained-token option, not an SSH deploy key.
The ordinary private-repo `GITHUB_TOKEN` cannot push across repositories, and its
pushes would not trigger the destination release workflow. The PAT push does.
The exported commit inherits public workflows from main; it cannot replace them.

## 3. Public npm-release environment

Create **npm-release** in **chi-releases**, with:

- the existing `gszep` user as the environment reviewer;
- allow self-review (`prevent_self_review: false`), so authorized agents can approve
  after the separate recorded agent review instead of requiring another human account;
- disable **Allow administrators to bypass**;
- selected deployment tags only: `chi-v*` (no branch policy).

The workflow declares `environment: npm-release` only on its publish job, after
both build/test platforms finish. Its job-scoped permissions are Contents write
for the GitHub release and ID-token write for npm/Sigstore. PR CI and build jobs
have only Contents read. A missing environment can be auto-created unprotected
by GitHub; **create and verify the protections before the first tag**.

## 4. Move the npm trusted publisher

Using existing npm owner access, verify the **@henkaku-center/chi** binding in
package Settings → Trusted publishing:

- organization: **henkaku-center**;
- repository: **chi-releases**;
- workflow filename: **release.yml** (not the full path);
- environment: **npm-release**;
- explicitly allow direct **npm publish** (not stage-only).

Retain a valid matching connection. If npm marks that exact connection expired,
delete/recreate only it and verify the saved fields/status. Do not change unrelated
publishers or `jsonl-reduce`. Prefer publishing access requiring 2FA and disallowing
bypass-2FA tokens. npm states all access options are compatible with OIDC; changing
an already-compatible option is not an extra first-dogfood-release blocker.
Use an existing authenticated browser when available; a CLI 401 alone does not
establish missing owner access. Stop at an actual security-key/2FA challenge—no
credential extraction, account switching or token fallback. No `NPM_TOKEN`
or `NODE_AUTH_TOKEN` secret is part of this design. Node 24.18.0 and npm 11.16.0
are pinned; npm trusted publishing requires npm >=11.5.1 and Node >=22.14.0.

Official references: npm's **Trusted publishing for npm packages** and
**Generating provenance statements**; GitHub's **Managing rulesets for a
repository** and **Managing environments for deployment**. Review their current
UI/API fields when applying these authorized settings.

## 5. First authorized release (a later operation)

1. Complete the installer's clean-host build/supervision/pairing acceptance and
   independent security review. The candidate remains `private: true` until a
   reviewed private-source PR explicitly changes it to `false` and sets version.
2. Keep the exact export allowlists synchronized through PRs. Public tooling must
   be merged first. The snapshot is built from committed blobs, not local files;
   source/tag mismatch, new paths, missing files, links and scanner errors fail
   before any public push. Review allowlisted prose for private facts too.
3. The authorized agent using the existing principal pushes matching `chi-v1.x.y` in private `chi`.
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
error; do not republish or retag. An authorized agent may verify the existing attestation and
tarball against that run's artifacts, then create only the missing GitHub release
with its checksums. New code or changed artifacts require a new version/tag.
Keep the release artifact within its seven-day retention or download it privately
for this recovery. No automated "already published" bypass accepts arbitrary
registry bytes.
