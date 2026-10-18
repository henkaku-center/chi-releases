# Existing-install transfer: bounded synthetic proof

On October 18, 2026, `scripts/native-transfer-rehearsal.mjs` passed against the
official npm `@opencode/cli-darwin-x64@2.0.22` binary and installer 1.0.0's
source-built OpenCode `2.0.15-chi.2`. The source npm signature and SHA-512 were
verified before use. Binary SHA-256 values:

- Source: `58c808e3f96738dc63122e307201b9b13d4dd42d78e4c6fb86392417c973873d`
- Target: `11096e872f446bf4bbd13b04866c40dc4a012c9bb0f8a12ca267868bf90f20d1`

Five actual checks passed, serially in separate credential-free temporary homes:

1. Source imports and exports synthetic settled user, assistant text/reasoning,
   compaction and child records without model execution.
2. Target refuses child-before-parent and duplicate imports, while parent-first
   import succeeds through `/api/experimental/session/import`.
3. After target restart, exports preserve session IDs, parent relationships and
   the complete ordered message arrays exactly.
4. The compiled Paseo `fc46610` AgentStorage class reloads both fixture mappings
   twice and resolves them to the reopened native sessions. Its source blob
   `b41bc75cfc05a05781c34f1afad044f0c7d4dc12` is identical to public Paseo v0.6.1.
5. The original 2.0.22 source restarts afterward and returns unchanged full exports.

## What this enables next

There is a working **native export/import rehearsal interface**, rather than a
need to downgrade an existing database. Build the bounded adoption planner around
that interface: inventory every selected session/parent and source mapping;
refuse incomplete/unsettled exports; retain exact transfer receipts and verify
reopened target records/mappings before any consented installation replacement.
Official transfer regenerates some session metadata, so this proof asserts exact
message arrays/IDs/parent links, not byte-identical native databases or all metadata.
No restore/discovery/configuration migration, attachment-file copying, active-turn
handoff, whole Paseo manager reopening or WSL supervision is certified here.

Installer 1.0.0 **still must not be run over the existing WSL installation**.
This fixture runs on Darwin x64, uses no real-user stores, and exercises no model.
Actual WSL layout/service-manager facts and an approved private local rehearsal
are still required. Project sharing permission is not foreign-install replacement
consent. A second empty host is not a substitute for reopening existing sessions.

Run only with explicit verified binaries, compiled storage module and a new
private output path; the script refuses CI and existing output roots. It creates
its own synthetic sessions and never discovers a user's service. Source and
target run sequentially; no database directory is shared between versions.
Track rollout in [#3](https://github.com/henkaku-center/chi-releases/issues/3).
