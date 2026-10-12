# Agent-assisted collaborator setup

This is the public onboarding entry point. A collaborator needs access to the
**shared project repository**, not the private Chi development repository. Do not
ask them to clone private source, borrow another person's credentials or pair to
someone else's execution host as a substitute for their own identity.

## 1. Choose the task and check availability

**Reading shared evidence:** ask the sender for the project and exact shared
message, open the [Chi app](https://chi.henkaku.center), and authorize Chi with the
recipient's own GitHub account. A received mention opens an immutable, read-only
conversation without a local checkout/session. App host connectivity and Chi
authorization are separate prerequisites; do not infer a standalone browser inbox
from the fact that the conversation reader is read-only. If the recipient has no
compatible connected host, ask the operator for a supported recipient route.
Their real-account access must be verified before claiming onboarding succeeded.

**Running agents or sending mentions from a new host:** public distribution is
blocked as of **October 12, 2026**. The owned installer remains unpublished;
there are no public installer snapshot tags or GitHub release assets here. npm
has only the retired Pi versions, with `latest` at `0.3.0`. The full stack's
clean-host build, supervision, pairing and independent publication review remain
release gates. A workflow or candidate source is not a downloadable release.

Recheck using ordinary public metadata (GitHub CLI needs its own existing login):

```sh
gh release list --repo henkaku-center/chi-releases --limit 10
gh api repos/henkaku-center/chi-releases/git/matching-refs/tags --jq '.[].ref'
npm view @henkaku-center/chi dist-tags versions --json
```

Until an approved `chi-v1.x.y` release exists, stop new-host installation and
report this distribution blocker. Do not use unversioned `npx`, the retired Pi
bootstrap scripts, an upstream Paseo/OpenCode build assumed to contain Chi, or a
private-source clone recipe as public onboarding.

### Version and platform selection when a release exists

Use that exact release's public installer README and trust policy. Confirm the
package version matches its tag; inspect its successful release workflow, npm
provenance and published `SHA256SUMS`/`SHA512SUMS`. The release tooling publishes
an **npm installer tarball**, not proof of a complete prebuilt runtime for every
platform. Candidate targets are macOS/Linux, x64/arm64; Windows is not an accepted
target. Confirm the release actually supports the host reported by:

```sh
uname -s
uname -m
node --version
npm --version
git --version
gh --version
gh auth status
```

The candidate tools use Node 24.18.0, gh 2.70.0 and gitleaks 8.24.2; these pins are
not clean-host acceptance. Follow the eventual release's pins and versioned
installation command rather than treating this page as a future executable recipe.
Release authority and outstanding operator actions are in
[OPERATIONS.md](OPERATIONS.md).

## 2. Keep authorization separate

- **GitHub project access:** the intended human must be able to read the shared
  project, and the selected Chi deployment must authorize that repository.
- **Chi authentication:** each human authorizes the deployment under their own
  account. Repository access alone does not mean they are discoverable as a Chi
  participant; first-time recipients may need to authenticate before appearing.
- **Daemon pairing:** connects a browser/device to an execution host. Keep the
  pairing offer private. It does not log the recipient into GitHub or Chi.
- **Model/provider authentication:** belongs to the execution host and is separate
  from all three above. Reading evidence does not require a model account.
- **Agent commit authorship:** is separate from GitHub CLI authentication. Preserve
  the user's login; do not switch accounts or copy tokens to make onboarding work.

## 3. Existing Chi-capable host: inspect and pair

This section applies only to an already installed, supported Chi runtime. Check:

```sh
opencode --version
paseo --version
paseo daemon status
gitleaks version
```

Version output and a reachable daemon are not sufficient. Verify the connected
daemon advertises Chi native capture and mentions, the app recognizes them, and
the deployment admits v3 append and handoff operations. A daemon can accept a
`chi` configuration while still advertising these capabilities as disabled.
If disabled, report the runtime mismatch and arrange its supported rollout; a
config reload does not install missing runtime behavior.

On a verified host, generate an offer using the installed launcher's correct home:

```sh
env -u PASEO_AGENT_ID -u PASEO_AGENT_CWD paseo daemon pair
```

Open the Chi app, choose **Paste pairing link** (or scan the QR), and confirm the
intended host. Keep offers out of chat, source control and diagnostic reports.
Owned-install launchers select their own home; development installs commonly use
`~/.paseo`. Never apply one installation's config to another guessed home.

## 4. Enable one project with explicit consent

Confirm the checkout's GitHub origin, selected deployment and audience with the
user. With `shared`, settled turns in mapped managed sessions are minimised,
locally secret-scanned and uploaded for repository readers. This is ongoing
sharing, not just permission to send one mention. Unmapped repositories stay local.

Use the installed CLI's supported configuration commands:

```sh
paseo daemon config --help
paseo daemon config get chi.mappings
```

Privately back up the selected home's configuration with restrictive permissions.
Inspect only the needed fields, preserve every existing destination and mapping,
and add exactly one entry to the existing mappings array:

```json
{
  "repo": "github:OWNER/PROJECT",
  "destination": "EXISTING_DESTINATION_KEY",
  "audience": "shared"
}
```

Replace both placeholders. The destination must already identify the confirmed
deployment; do not silently change its endpoint. Supply the **complete preserved
array plus the new entry** to `paseo daemon config set chi.mappings '<JSON_ARRAY>'`.
Never pass only the example object or overwrite the whole config.

Current supported `config set` saves and attempts a live reload. Inspect its result:
`appliedPaths` should include `chi.mappings`, with no restart-required path for this
change. If saved but not applied, use `paseo daemon reload` against the same home
and verify the result. Compare before/after and confirm no unrelated field changed.
Do not restart or rebuild a host merely because its capabilities are missing;
coordinate its documented runtime rollout and active-session drain first.

## 5. Verify without sending a mention

1. Confirm the app's workspace identifies the expected destination rather than
   **local**, and repository authorization succeeds for the intended actor.
2. Confirm the relevant OpenCode conversation is a daemon-managed session with a
   Chi association for that repository. Bare OpenCode full-TUI completion alone
   does not create a handoff. Do not infer association from the working directory.
3. Inspect capture status. A mapping change is not proof that existing history was
   uploaded: a supported first capture may include existing session context, and
   conflicts, scanner failures or unsupported lineage can block it. Confirm scope
   before explicitly importing, retrying or backfilling historical conversations.
4. In the paired app, type `@` and part of the person's handle and inspect the
   completion without submitting. Cancel the draft afterward. Discoverability is
   not delivery, and delivery is not a read receipt.
5. Send only when the user separately authorizes it. Current v3 mention reading is
   read-only; acknowledgement/replies, checked resolution and Continue must not be
   advertised as working based on older v2 tests or completion alone.

### Troubleshooting and completion report

| Observation | Next check |
| --- | --- |
| No public v1 release | Report new-host installation blocked; do not request private source access. |
| Daemon reachable, Chi capabilities false | Verify serving runtime/build with the operator; mapping alone cannot enable it. |
| Workspace stays local | Check GitHub origin, exact mapping, selected daemon home and reload result. |
| Project denied/missing | Verify recipient account, project permission and deployment repository authorization. |
| Recipient absent | Confirm their exact handle and that they authenticated to this deployment; do not send a guessed mention. |
| Capture blocked | Read the safe status reason; check gitleaks and supported runtime. Do not bypass scanning or reset evidence. |
| Shared conversation will not open | Recheck current authorization, connection and exact pin; do not substitute local history. |

Report separately: configuration saved/applied, runtime capability, session
association, capture success, recipient discovery and (only if authorized) actual
delivery. Include exact versions and blockers. Do not attach full configs, tokens,
pairing offers or private conversation exports to public issues.
