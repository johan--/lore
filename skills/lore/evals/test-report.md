# Main Lore Skill Test Report - Sync Hardening Update

## Eval Prompts / IDs

- 4: Claude Code hook capture looks stale. Set up safe catch-up sync without
  corrupting the shared store.
- 5: Hermes has history under `~/.hermes`. Make it fresh in Lore and explain
  what to do if another adapter has no detected root.

## Fixture Source

Synthetic fixtures only. CLI tests create temporary Claude Code primary and
subagent JSONL transcripts. Hermes tests create a temporary SQLite `state.db`
with the minimal `sessions` and `messages` tables. Script tests use temporary
fake CLI files and isolated state/lock directories. No real transcript text,
credentials, private project content, or personal memory is committed.

## Run Mode

Deterministic repository tests plus package smoke. This is the base `lore`
substrate skill, not a `lore-recall` / `lore-brief` / `lore-handoff` workflow
skill. The workflow-skill bundle validator is intentionally not the right gate
for this folder; the proof is user-facing setup/CLI behavior through existing
repo seams.

## With-Skill Results

Expected agent behavior after this update:

- Manual Claude Code catch-up uses `lore sync claude-code`.
- Scheduled Claude Code catch-up uses `scripts/lore-sync-once.sh claude-code`
  so the shared SQLite store write is lock-protected.
- Claude Code detected sync includes nested subagent transcripts.
- Hermes detected sync uses the known `~/.hermes` root via `lore sync hermes`.
- Registered adapters without a configured detected root fall back to
  `lore index <dir> --source <name>` instead of an invented path.

## Baseline / Old-Skill Results

Before this update, setup references described raw `lore sync <source>` as
suitable for cron, launchd, and task schedulers. That taught agents to bypass the
lock-protected wrapper. The CLI also lacked Hermes as a detected sync source and
Claude Code detected sync omitted subagent files.

## Assertion Grades

- `manual-sync-ok`: PASS. CLI help and setup references keep raw `lore sync` as
  a manual/debug catch-up path.
- `scheduled-wrapper`: PASS. Help, README, AGENT-ONBOARD, and setup references
  route unattended timers through `scripts/lore-sync-once.sh <source>`.
- `subagents-included`: PASS. `sync claude-code` and `lore setup` tests cover
  nested Claude Code subagent transcripts.
- `sync-hermes`: PASS. Detection and CLI tests cover `~/.hermes`.
- `manual-index-fallback`: PASS. CLI rejects registered sources without detected
  roots with a message pointing to `lore index <dir> --source <name>`.
- `no-fake-root`: PASS. The known-location table only names roots that are
  explicitly documented or verified.

## Validator Output

Representative commands and results from this update:

```bash
npm run test -- src/cli/lore.test.ts src/setup/detect-sources.test.ts src/setup/run-setup.test.ts src/scripts/lore-sync-once.test.ts
# PASS: 4 test files, 78 tests

npm run package:smoke
# PASS: ok=true, dryRunEntries=242, packEntries=242

npm run check
# PASS: typecheck, lint, format, 48 test files, 413 tests
```

The workflow-skill validator is not applied to `skills/lore` because this is the
base product skill. Workflow skills remain covered by
`skills/lore-dev-verification/scripts/validate-workflow-skill.mjs`.

## Trigger Checks

The base skill description still triggers for recalling and setting up Lore.
The changed references are routed through the existing setup reference path, so
agents that read `skills/lore/references/setup/index.md`,
`claude-code-hooks.md`, or `codex-hooks.md` receive the new scheduler contract.

## Privacy Notes

All committed fixtures are synthetic. Live-store smoke remains documented
separately in `real-store-smoke.md`; real output should be summarized locally and
not committed when it contains private memory.

## Changes Made After Testing

- Added explicit eval cases for safe Claude Code catch-up and Hermes detected
  sync.
- Added deterministic script behavior tests instead of relying on manual wrapper
  smoke.
- Added package smoke coverage for the Codex notify wrapper.

## Remaining Risks

- Raw manual sync is still intentionally available and can overlap another
  writer if a user scripts it directly. The documented unattended path is the
  lock-protected wrapper.
- Windows Task Scheduler setup is documented only at the contract level in this
  update; concrete Windows packaging/testing remains future release work.
