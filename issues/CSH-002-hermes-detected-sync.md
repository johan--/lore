# CSH-002 - Hermes detected sync root

Type: AFK · Label: ready-for-agent · Blocked by: None - can start immediately · Plan: docs/PRD-claude-code-sync-hardening.md

## Parent

docs/PRD-claude-code-sync-hardening.md

## User stories covered

30-33, 35-36

## What to build

Add Hermes to the detected-source sync surface using its known global root at
`~/.hermes`. The existing Hermes adapter remains responsible for walking that
root, finding live and per-profile `state.db` files, and skipping snapshot
backups.

For registered adapters that do not have a configured detected root, return a
clear unsupported-detected-sync error that points users to manual
`lore index <dir> --source <name>` instead of implying Lore searched a real
standard location.

## Acceptance criteria

- [ ] Source detection finds Hermes under the global `~/.hermes` root when a valid synthetic `state.db` is present.
- [ ] `lore sync hermes --home <dir>` indexes searchable Hermes content through the detected root.
- [ ] Detection continues to report `codex` and `claude-code` roots correctly.
- [ ] `lore sync <registered-source-without-detected-root>` fails with a precise message naming supported detected sync sources and the manual indexing fallback.
- [ ] Tests use synthetic SQLite fixtures and do not commit real Hermes history.

## Blocked by

None - can start immediately

## Verification

Run targeted source-detection, Hermes adapter, and CLI sync tests, then include
the slice in the final `npm run check`.
