# Owned Chi installer — 1.0.0 release inputs

Use only the exact published `@henkaku-center/chi@1.0.0` artifact after verifying
its `chi-v1.0.0` release, checksums and public-workflow provenance as described in
[TRUST](TRUST.md). Source files or a PR do not prove the release exists. If the
version/tag is absent, stop; versions below 1 are retired Pi packages, never a
fallback. Installation requires no private Chi source checkout or private Git
credentials. Release operations are in public `chi-releases/docs/OPERATIONS.md`.

This release is for a **fresh supported host**. It does not uninstall, replace or
migrate a foreign Paseo/OpenCode installation. Inventory existing binaries and
state first; if replacement is needed, stop until its consented, history-preserving
takeover path is verified. Do not start a silent second empty instance.

After the exact release is available and verified:

```sh
npx --yes @henkaku-center/chi@1.0.0 install --choices /absolute/path/choices.json --dry-run
# Review the exact plan, then run without --dry-run and confirm it interactively.
```

Your own GitHub CLI login, provider login, repository permission and the Chi
deployment's repository admission remain separate. A successful installation or
pairing is not proof of sharing, mention delivery or recipient reading.

| Capability | Acceptance boundary |
| --- | --- |
| Public source/dependency build and real native plugin loading | Darwin x64 build and all ten real loader cases passed on Paseo `fc46610aa635a0c49ce4d335eefba7fd7e3ec42d` / OpenCode `54f70dc4bb2d53b823aeb746f192d432058c028c` (`2.0.15-chi.2`), October 17, 2026. No private checkout or user credentials; loader authorization uses local synthetic fixtures |
| Fresh macOS arm64 supervision and encrypted pairing | Passed on the exact fc46610 / OpenCode chi.2 source pins (run `38998655703`, receipt `12088755046`), using synthetic auth-status admission and a local real relay; owned cleanup passed |
| Fresh macOS x64 supervision and encrypted pairing | Passed on the exact fc46610 / OpenCode chi.2 source pins (run `38999016865`, receipt `12088861631`), using synthetic auth-status admission and a local real relay; owned cleanup passed |
| Linux | Filesystem/lifecycle contracts are tested; real clean-host supervision/pairing is not certified by this release record |
| Personal auth and repository-scoped collaboration | Requires the user's own identity and authorized deployment/project; real-account hosted pairing/read/mention acceptance is separate |
| Existing-install takeover, native/tool updates, global Inbox, managed Resume/Fork | Not enabled or certified by this installer release |

## Try the plan

Build this checkout with Node 24:

```sh
npm ci --prefix packages/installer
npm --prefix packages/installer run build
node packages/installer/dist/cli.js install --choices /absolute/path/choices.json --dry-run
```

An explicit choices file looks like this (replace the example endpoint and repo):

```json
{
  "endpoint": "https://chi.example/api",
  "name": "My deployment",
  "mappings": [{ "repo": "github:owner/repo", "audience": "private" }],
  "permissions": "ask",
  "autoUpdate": false,
  "linger": false
}
```

`mappings: []` keeps every repository local. Each mapped repository's settled
turns are minimised, scanned and uploaded to the selected endpoint under its
explicit audience. An owner wildcard is an explicit choice, never an inferred
default. Linux requires already-enabled linger or `linger: true` consent.

Optional bot authorship adds:

```json
{
  "bots": {
    "selected": "builder",
    "identities": {
      "builder": { "name": "Your bot", "email": "your-bot@example.org" }
    }
  }
}
```

The launcher sets authorship environment variables. GitHub operations still use
the human's login; no account switching or credential copying occurs.

The existing configuration writer generates `config/opencode/AGENTS.md` for
root, named-role and native-child OpenCode sessions, including when no bot roles
are configured. Its tracked `workflow-v1` template owns role-independent child
orchestration, authorized commit/push, shared-login/worktree safeguards and concise
writing. Named roles carry only their task and explicit identity override; the
selected bot supplies the root default when configured. Shared policy is not
duplicated in every role. Neither template authorizes bypassing protected PR flow
or restarting services merely because tests passed. CI routing remains owned by
the shared runtime and each project's approved policy.

This ambient file is an OpenCode consumer; it does not prove delivery to other
Paseo providers or ACP. It is generated through the same ownership journal and
no-clobber install path, not copied from personal globals. Existing installs need
explicit reconfiguration; daemon-only updates never replace personal instructions.
Private host/account bindings do not belong in this public installer template.

When `bots.identities` includes `builder` or `reviewer`, the existing configuration
writer also generates that role's `config/opencode/agents/<role>.md` from tracked
installer source. Both roles support primary and native-child selection. Each
role directs commits to use its own identity, rather than blindly inheriting the
launcher's selected role. Other identity keys do not invent new agent definitions;
without bot choices no bot roles are installed. Review approval thresholds belong
to the target project's `AGENTS.md`, not these reusable runtime roles.

Generated roles use the same ownership journal, no-clobber installation and
explicit reconfiguration lifecycle as the other configuration files. Installation
does not adopt or remove personal OpenCode instructions. An old owned install
needs explicit reconfiguration to add roles; daemon-only updates do not rewrite
configuration. This source change is not evidence that existing hosts load the
roles: new, resumed and native-child loader acceptance remains a rollout gate.

After reviewing the plan, a fresh-host acceptance operator can rerun without
`--dry-run`, confirming interactively or passing `--confirmed`. The installer
checks `gh auth status`; if needed, it reports the owned gh login command and
stops. Model-provider sign-in and confirming the host in the app remain human
steps. Pairing offers go only to the terminal, not the ownership journal.

## Ownership and lifecycle

The root is `$XDG_DATA_HOME/chi`, defaulting to `$HOME/.local/share/chi`.
Only named LaunchAgents or systemd user units live outside it. No personal
OpenCode config, `.paseo`, shell RC or Git config is adopted. Add the owned
`bin` directory to PATH yourself to use its `opencode` and `paseo` launchers.
The launchers preserve the caller's working directory and select private
OpenCode XDG directories and an explicit Paseo home.

Node 24.18.0, gh 2.70.0 and gitleaks 8.30.1 have embedded official archive
checksums for macOS/Linux x64/arm64. Source builds use exact SHAs, an npm lock
and a locked Bun 1.4.2/pnpm 11.9.0 toolchain. Linux must use glibc. Bootstrap
Node (22.22.2+ on 22.x, 24.15.0+ on 24.x, or 26+) / npm, Git, the native
compiler/make toolchain, macOS `unzip`, and a working
user service manager remain prerequisites. No sudo/package-manager automation.
Running as uid 0 is refused. Service-directory safety is checked before builds.
The CLI checks that Node floor at startup and refuses an older runtime before
parsing arguments, downloading or writing anything.

The hosted app/relay baseline copies `web/paseo.json` and is equality-tested.
The **installer daemon pin is separately explicit** in `src/pins.ts`. Its matched
tuple is OpenCode `54f70dc…` / `2.0.15-chi.2`, Paseo `4e1af55…`, and Chi
`e7318db…`. This does not advance the hosted deployment pin or promote a host.
The former `d1bc19c…` candidate's destination-admission implementation is retained
through merged Paseo #11: both test patches are patch-equivalent, and the admission
patch differs only in its historical helper/lockfile bytes. The new helper hash is
`14a3dd71de3de4da7d0c7e5990f6670736244930ea5931a684aed19bea17bddb`.

An isolated checkout of the exact Paseo merge passed the connection, destination
and append-capture suites: 81 tests passed; its Windows-only refusal case was
explicitly skipped on macOS. That covers destination admission plus new `.chi.2`
creation and `.chi.1` continuation without relabelling, not a clean-host rollout.
Source pins distribute the candidate to future installs; existing installs still
defer native/tool changes until the documented native-drain/reconfigure gates.
Do not replace private host configuration or
infer that changing this tuple installs the four deployment-specific skills.

```sh
node packages/installer/dist/cli.js pair --confirmed
node packages/installer/dist/cli.js update --dry-run
node packages/installer/dist/cli.js update --confirmed
node packages/installer/dist/cli.js uninstall --dry-run
node packages/installer/dist/cli.js uninstall --confirmed
node packages/installer/dist/cli.js reconfigure --choices /absolute/path/new-choices.json --dry-run
node packages/installer/dist/cli.js reconfigure --choices /absolute/path/new-choices.json
```

Same-plan install verifies owned bytes, login and live health. Daemon updates
build a new tree, atomically change a journaled release pointer and invoke
`paseo daemon restart --wait-idle`. An owned worker dispatcher resolves the
pointer only at process startup. Existing workers keep their original release
files; the retained supervisor can launch the new worker without restarting
itself. Health checks require the expected source SHA/version, owned home and
a replacement worker PID. Rollback restores the pointer and also uses wait-idle.

Daily updates are opt-in. They accept stable, newer 1.x registry packages only,
verify npm's ECDSA signature with the reviewed public key in `src/registry.ts`
and SHA-512 package integrity, and invoke the new installer without lifecycle
scripts. Version-only updates refresh the retained installer. OpenCode,
plugin and tool-pin changes explicitly **defer**: a race-free native drain
contract is not yet verified. A status-only idle read is not treated as a drain.
The same refusal applies when a Paseo-only update changes its bundled Chi helper:
the existing lifecycle compares the old and staged helper bytes before changing
the active pointer or requesting a restart, and removes the unactivated staging
tree on refusal. A preparation receipt or caller-supplied idle assertion cannot
substitute for native-drain authority.
Only the exact npm tarball URL for that version is accepted; redirects and
unknown signing keys fail closed. In addition, `dist.attestations` must supply
Sigstore-verified SLSA v1 provenance for the exact package/version/SHA-512, issued
by GitHub Actions for `henkaku-center/chi-releases/.github/workflows/release.yml` at the
matching `chi-v<version>` tag. The certificate chain, SCT and transparency-log
evidence are verified offline against bundled public Sigstore roots. No registry-
supplied trust roots or user TUF cache is accepted. See [TRUST](TRUST.md) for pins.
If Sigstore rotates its roots, auto-update fails closed on every run until the
user bootstraps a newer reviewed installer release, which bundles the rotated
roots, and retries `update`/auto-update. A root rotation is never adopted from
registry metadata, a user cache or an environment override.

`henkaku-center/chi` stays private. Its tag-triggered export workflow publishes
scanned, exact-file-allowlisted installer snapshots and the pinned mentions-plugin
source closure (four plugin modules and three helper modules), with no private
Git history, to `henkaku-center/chi-releases`. That public repository's own
`release.yml` builds/tests the source and executes `npm publish --provenance`,
binding the attestation to the public source. See `release-authority/README.md`
and [TRUST](TRUST.md) for the scoped export credential, npm trusted-publisher
migration, immutable tag protections and `npm-release` environment. These are
authorized release-agent operations under the recorded dogfood policy; they are
not applied automatically by this package. Shared GitHub identity is not
independent human approval, and does not bypass immutable tags or required CI.

The candidate embeds the mentions plugin at installer build time. `pins.ts`
records its exact source and complete generated-payload hashes; a changed compiler,
dependency lock or expanded import closure fails until
reviewed. Public release provenance covers generated `dist/plugin.js` and its
frozen public npm lock. Installation materializes it and runs `npm ci --ignore-scripts`,
not a private Chi clone or a full helper/backend compilation. The Chi source pin
is provenance metadata, not a fetch dependency; unavailable recorded payloads stop.
Fork builds isolate HOME/npm config, disable Git credential helpers/prompts and
file/ext transport, and inherit no account credentials. This is not a sandbox
against malicious reviewed source.

The explicit plugin-layer acquisition proof uses a fresh private directory:

```sh
node packages/installer/test/public-plugin.mjs /absolute/new/private/directory
```

It installs frozen public SDK dependencies and tests the actual generated modules
against synthetic local authority. It does not certify full clean-host source
builds, real runtime loading, supervision or pairing; those gates still block release.

Writes carry recoverable before/after hashes. A failed update leaves the old
plan authoritative and retains recovery intent until the restored daemon is
healthy. Retry `update` for pending activation recovery. An interrupted process
can leave `.install-lock`; inspect its PID and journal before manually removing
that stale lock. It is never automatically stolen from a potentially live run.
Uninstall refuses changed service definitions, stops only owned registrations,
and removes only unchanged journaled files. Operational state, credentials,
build trees, edits, consent and linger remain. Repeated uninstall works.

Paseo's `config.json` and global OpenCode `opencode.json` and `cli.json` are written once and
then belong to their runtime config stores. Normal settings edits survive pair,
update and uninstall. The installer does not hash-verify or regenerate them.
The journal records actually-built pins/artifacts in `built`; a newer installer
finishes an interrupted install using those inputs, so a later update still
detects native/plugin changes. An older journal without built-input evidence
must be reconciled explicitly rather than guessed.
When resuming inputs different from the caller's, it prints the recorded installer
version, source pins and tool artifacts before proceeding, even before a completed
build. Use confirmed reconfigure to choose fresh inputs. Linger's original enabled
state survives reconfigure and subsequent installation. Note the resume
convergence gap: a newer installer that resumes an older unbuilt attempt finishes
it on those older recorded pins, and auto-update then reports `up-to-date` rather
than moving to the newer pins the caller supplied. Confirmed reconfigure is the
only way to advance those inputs; a same-plan install never relabels old code.

### Changing consent and recovery

`reconfigure --choices FILE` displays the exact old/new consent diff and asks for
interactive confirmation; `--confirmed` cannot bypass this question. Finish active
work first: this stops owned services and archives the entire old installation
under private `retained/reconfigure-*`, then prepares a fresh install. It works
after a failed login/build, or after uninstall. Run `install --choices FILE`
afterward, pair the new daemon, and sign into providers again. It never copies
the archived credentials or silently retargets old history. Existing browser
pairings are not revoked; unpair the old host in the app yourself.

The archive preserves the old journal, runtime state, pairing/provider credentials,
source builds and logs. Keep it private; deleting it permanently loses that local
recovery material. No archive is automatically purged. If interrupted, inspect a
stale lock as above, then repeat reconfigure with the **same exact plan**; other
actions refuse until it finishes. Edited service definitions must be reconciled
before the installer can stop them. A reconfigure dry run changes nothing.

Build failures report a private `logs/build-*/stderr.log` path (0600 files inside
0700 directories). Successful build logs are removed. Pairing is never routed to
these logs. Inspect diagnostics locally; do not paste credentials into reports.

The owned npm tree has one byte/name/mode manifest entry. Any edit, extra member,
link or executable-mode change blocks verification and preserves the whole tree
on uninstall. A failed publication resumes from its durable staging intent.

## Verification and release limits

```sh
npm --prefix packages/installer test
node packages/installer/test/mutations.mjs
# Optional real pinned-tools benchmark (isolated home, no services/auth):
node packages/installer/test/benchmark-tools.mjs --real-tools
```

Tests run under throwaway HOME/XDG with synthetic archives, authority and
subprocess responses. One subprocess test executes the real generated worker
dispatcher. CI runs the contract on macOS and inside a network-disabled Linux
container; guard mutations run separately and restore compiled bytes afterward.
The mutation runner first requires each targeted unmodified regression to pass,
then requires an assertion failure when its guard is removed.

Official pinned tar archives were separately checksum-verified and parsed for
all four targets. Archive compatibility alone is not runtime acceptance; the table
above records the narrower actual source-build/supervision/pairing evidence.
Model login and human collaboration remain separate. Native/tool updates still
require verified drain; a fresh-host release does not authorize existing-host
replacement or promotion. Publication requires the recorded clean-host gates and
independent review, not merely a successful package build.
Both export and public release require a matching stable `chi-v1.x.y` tag and
explicit `private: false`. The public publish job declares protected `npm-release`
and publishes the tested tarball using the moved npm trusted-publisher binding.
The `release-authority/` directory holds prepared operator inputs; nothing is
applied here. No package is published by this candidate, a branch push, PR or
manual dispatch. The installer tests are standalone; private CI separately
checks the embedded hosted pin against the private deployment baseline.
