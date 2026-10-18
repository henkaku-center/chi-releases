# Agent instructions and collaborator setup

Use this root guide when assisting a collaborator with Chi setup. It is the
authoritative public agent onboarding entry point. A collaborator needs access to the
**shared project repository**, not the private Chi development repository. Do not
ask them to clone private source, borrow another person's credentials or pair to
someone else's execution host as a substitute for their own identity.

## 1. Choose the task and check availability

**Joining as a collaborator:** open the [Chi app](https://chi.henkaku.center)
and choose **Connect with GitHub**. Its personal sign-in page is
[Chi Connect](https://chi.henkaku.center/connect/). Authorize Chi with the intended
human's own GitHub account, then check the project's access. Personal sign-in
registers a participant; it is not proof of delivery or evidence reading. It needs
no paired host, model account or private-source installation. Verify actual
sign-in and project access before claiming success; never sign in as the recipient
yourself. If the route or sign-in is unavailable, report the deployment blocker.

**Reading shared evidence:** ask the sender for the project and exact shared
message. The current host-backed app reader still needs a compatible connected
host and fresh Chi authorization. A standalone browser evidence reader is deferred;
do not infer one from the host-free sign-in page. A collaborator who only needs
registration can stop after Connect. Do not force a private clone or full fork
installation as a workaround for a missing supported reading route.

**Running agents or sending mentions from a new host:** fresh-host installer
**`@henkaku-center/chi@1.0.0`** was published and verified on **October 17, 2026**.
Its immutable tag is `chi-v1.0.0`, public source commit
`88db51338ba89339d602ee8ca077999b5698053c`. The registry tarball matches the tested
artifact and GitHub release asset; npm signature and Sigstore provenance were
verified against this repository's `release.yml` and exact tag. No private Chi
checkout or borrowed credentials are required. Versions below 1 remain retired Pi.

Recheck using ordinary public metadata (GitHub CLI needs its own existing login):

```sh
gh release view chi-v1.0.0 --repo henkaku-center/chi-releases
gh api repos/henkaku-center/chi-releases/git/ref/tags/chi-v1.0.0 --jq '.object.sha'
npm view @henkaku-center/chi@1.0.0 version dist --json
```

If the exact tag/version is missing or verification fails, stop installation and
report that specific failure; do not infer that a source PR is a release.
Do not use unversioned `npx`, the retired Pi
bootstrap scripts, an upstream Paseo/OpenCode build assumed to contain Chi, or a
private-source clone recipe as public onboarding.

### Version and platform selection

Use that exact release's public installer README and trust policy. Confirm the
package version matches its tag; inspect its successful release workflow, npm
provenance and published `SHA256SUMS`/`SHA512SUMS`. The release tooling publishes
an **npm installer tarball**, not proof of a complete prebuilt runtime for every
platform. Release 1.0.0 passed real fresh-host build, supervision and encrypted
local-relay pairing on macOS x64 and arm64; those tests used synthetic GitHub
auth-status admission, not real-account collaboration. Linux x64/arm64 have
contract tests, not equivalent real clean-host acceptance; Windows is not an
accepted target. Confirm the host reported by:

```sh
uname -s
uname -m
node --version
npm --version
git --version
gh --version
gh auth status
```

Release 1.0.0 pins Node 24.18.0, gh 2.70.0 and gitleaks 8.24.2. Follow the
[exact installer README](https://github.com/henkaku-center/chi-releases/blob/chi-v1.0.0/packages/installer/README.md)
for the choices-file schema and
[trust policy](https://github.com/henkaku-center/chi-releases/blob/chi-v1.0.0/packages/installer/TRUST.md)
for signature/provenance verification. Tarball SHA-256:
`d61aeb1c51a001bef305f90bca469a3d295091fa7a09099ca70cd927b1ff8c9c`.

On a fresh supported host, after verification and agreement on the choices:

```sh
npx --yes @henkaku-center/chi@1.0.0 install --choices /absolute/path/choices.json --dry-run
```

Review the exact plan, then omit `--dry-run` and confirm interactively. Use the
person's own GitHub login and provider login. Pairing, repository admission and
authorized read/mention acceptance remain separate; never test by messaging a
collaborator without approved content. Do not run this recipe over an existing
foreign installation: follow the preservation boundary below.
Release authority and outstanding operator actions are in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

### Existing installations: consent and history come first

**WSL with existing OpenCode 2.0.22 / Paseo 0.6.1:** do not run the fresh-host
installer over that installation. Both Mac architectures passed fresh-host tests;
Linux contract tests are **not WSL takeover acceptance**. Project sharing consent
does not authorize uninstalling software, downgrading a native store or replacing
its history with an empty host.

The partner's local agent can collect one nonsecret preflight using Node already
on that host (no npm installation, sudo, service start, auth flow or database read):

```sh
preflight_dir=$(mktemp -d)
curl --fail --silent --show-error --proto '=https' \
  https://raw.githubusercontent.com/henkaku-center/chi-releases/bbd270c4a823577912f5b33a81fc21b89c176a04/scripts/existing-install-preflight.mjs \
  -o "$preflight_dir/preflight.mjs"
node "$preflight_dir/preflight.mjs"
```

It reports Linux/architecture, WSL detection, distro/glibc, PID 1/systemd,
read-only user-service-manager and linger status, executable/symlink paths,
filesystem owners and `--version` output. It never prints raw error output or
reads configuration/auth files, environment dumps, native databases or session
bodies. Filesystem ownership is not proof of npm/Homebrew/desktop ownership;
the local agent should identify that manager from its existing installation
records, not run a replacement command.
It also checks only the two known package names' manifests under conventional
nvm Node installations, without executing those candidates. A binary missing
from SSH's PATH may exist under another Node version; neither a candidate manifest
nor filesystem ownership establishes which daemon is running. Other package
managers/custom locations remain outside this bounded discovery coverage.

If the agent already knows the active Paseo home from local installation context,
repeat with its exact `agents` directory as the sole argument. Do not guess a
Windows store or assume `~/.paseo` is active. Optional counts cover the source
Paseo layout's agent records, OpenCode records and nonempty persistence mappings;
IDs/titles/configuration are never printed. Counts are a bounded live observation,
not a consistent backup or native-session count. Missing/invalid metadata is
reported as unknown/incomplete, not zero sessions. Native session count is
deliberately unknown: ordinary session-list/API commands can start a service.
Keep raw records and credentials local; return only this summary, the package
manager, and whether a custom home or more than one installation exists.

**Delivery path, not a downgrade promise:** source inspection found no Chi
capture integration in public Paseo `v0.6.1` (`3904190836e4d82577849f3ca053c36ef65f9e65`).
Adding a destination alone cannot enable it. Its agent-storage source is identical
to the 1.0.0 pinned fork's file, a useful fixture starting point—not proof that
whole-host takeover/reopening works. OpenCode `v2.0.22`
(`527f0b931d1f9b3ebd34e106c51b31ce5db5b075`) has the same session-transfer schema
as the pinned `2.0.15-chi.2`, but database schema/lifecycle code differs. Never open
the only 2.0.22 store with the older target. Use the existing public session
export/import interface only in an approved isolated rehearsal, not by copying
operational data to CI or posting exports here.

The bounded implementation gate is: synthetic source/target fixtures must prove
reopenable sessions with preserved IDs, ordered payloads, parent relationships and
Paseo persistence mappings; then verify a forward-compatible Chi runtime (or a
proved isolated transfer), WSL user-service supervision and rollback. Do not
simply add 2.0.22 to a supported-version allowlist. After those tests, the local
agent can rehearse the exact approved target against a private consistent copy,
compare counts and reopenability without a model turn, and report results only.
Actual replacement still requires consent to that plan and must preserve the
original binaries/stores/configuration. No such takeover is certified yet.
Track implementation and acceptance in [issue #3](https://github.com/henkaku-center/chi-releases/issues/3).
Repository catalog/provisioning remains a separate deployment gate: GitHub write
permission and a local mapping alone do not establish backend readiness.

The target runtime is the release's **Chi-capable Paseo and OpenCode forks**,
not arbitrary upstream builds. The public release does not authorize replacing
another installation or bypassing its release verification.

Installer 1.0.0 uses an isolated owned installation; foreign
installation replacement, its consent flow and history migration are **not
implemented or accepted**. The requirements below describe the target workflow,
not capabilities to assume from that candidate. If a release still lacks them,
stop replacement rather than creating an unrequested parallel instance or
renaming existing state directories out from under running programs.

Once an approved release supports the required lifecycle:

1. Privately inventory the exact installed versions, executable paths, installation
   owners, running tasks, state locations and plugin versions. Do not publish
   credentials, full configuration, log contents or pairing links.
2. If the machine already has the matching verified Chi installation, reuse it or
   update through its owned release path. Do not uninstall a working installation
   merely to repeat onboarding.
3. If replacement of another Paseo/OpenCode installation is necessary, explain
   exactly what will change, how active tasks will drain, which histories and
   configurations must survive, and how rollback works. **Ask for explicit user
   permission before uninstalling or replacing anything.** A request for onboarding
   instructions is not permission to modify the running machine.
4. Use the release's reviewed consent/reconfigure and backup mechanisms. Back up
   and verify logs, session IDs/history and configuration before any replacement.
   Preserve originals until restoration has been verified. Never delete HOME,
   runtime state, credentials or plugin files as an uninstall shortcut. If safe
   preservation or recovery cannot be demonstrated, stop and report the blocker.
   Replacing program files is not deleting application data: never run a generic
   uninstall command that can purge state. An active SQLite database needs a
   supported consistent backup including WAL state, not a plain copy of its main
   file. Preserve Paseo-to-native-session mappings, pairing/host IDs and discovery
   configuration as well as native history.
   Trial the exact target version against a private restored copy first. Verify
   the existing catalog, ordered history, session IDs and reopenability without a
   model turn or replay. Keep the current working runtime in place until this
   takeover check passes; no silent second empty instance. Failed trial means
   retain/restore the old working runtime, not proceed with uninstall.
5. **OpenCode V1 plugins do not work in V2 without migration.** Preserve their
   configuration and files safely but keep them inactive until a reviewed V2
   migration passes. Do not load incompatible plugins or assume every V1 log can
   be imported, replayed or read equivalently in V2. Record exactly which histories
   and IDs were preserved and which remain unsupported; keep the original readable
   backup for unsupported history.

Chi's v3 append-log format is not a promise that OpenCode's native SQLite schema
or JSON export is stable across versions. Compatibility evidence for one exact
version pair does not cover all V1/V2 installations. An unknown schema or missing
version-specific preservation/takeover path means **stop before uninstall and
report that migration is required**. Renaming a V1 plugin configuration is not a
V2 implementation migration.

## 2. Keep authorization separate

- **GitHub project access:** the intended human must be able to read the shared
  project, and the selected Chi deployment must authorize that repository. This
  requires its GitHub App installation to include the project as well as the
  human's repository permission. A local mapping or successful login grants
  neither. An organization owner can install the deployment's verified App with
  **Only select repositories**, selecting just the intended project. Review its
  current permissions in GitHub; do not grant all repositories to fix one mapping.
- **Chi authentication:** each human authorizes the deployment under their own
  account. Repository access alone does not mean they are discoverable as a Chi
  participant; first-time recipients may need to authenticate before appearing.
  The welcome screen's **Connect with GitHub** is one guided entry point, not a
  claim that personal authorization and App installation are the same grant.
  Collaborators on an already integrated repository sign in without reinstalling
  the App. If a project is missing, an owner/administrator can connect it once
  through the deployment's verified integration link, then the collaborator
  rechecks access. Do not enable a new OAuth callback flow or change App settings
  merely to make these steps look combined.
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

Version output and a reachable daemon are not sufficient. Use the client shipped
with the serving runtime to check `chiAppendV3`, `chiPinnedTimeline` and
`chiInboxActivity`, and verify the deployment admits v3 append and handoff
operations. The v3 runtime deliberately sets legacy `chiNative`, `chiMentions`
and `chiInbox` flags to false; an older client may discard the new flags and
incorrectly report that an upgrade is needed. Those legacy flags alone do not
diagnose a missing runtime or failed authorization. If the actual v3 capabilities
are absent, report the runtime mismatch; a config reload does not install them.

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
| Daemon reachable, legacy Chi flags false | Check v3 flags using the matching installed client before diagnosing a runtime problem. |
| Workspace stays local | Check GitHub origin, exact mapping, selected daemon home and reload result. |
| Project denied/missing | Verify account, project permission and the deployment's GitHub App installation for this specific repository. `chi-repository-denied` means the authorized catalog omitted it; it is not a host-pairing failure. |
| Recipient absent | Confirm their exact handle and that they authenticated to this deployment; do not send a guessed mention. |
| Capture blocked | Read the safe status reason; check gitleaks and supported runtime. Do not bypass scanning or reset evidence. |
| Shared conversation will not open | Recheck current authorization, connection and exact pin; do not substitute local history. |

Report separately: configuration saved/applied, runtime capability, session
association, capture success, recipient discovery and (only if authorized) actual
delivery. Include exact versions and blockers. Do not attach full configs, tokens,
pairing offers or private conversation exports to public issues.
