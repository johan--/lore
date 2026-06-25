# CSH-001 - Claude Code detected sync and setup include subagents

Type: AFK · Label: ready-for-agent · Blocked by: None - can start immediately · Plan: docs/PRD-claude-code-sync-hardening.md

## Parent

docs/PRD-claude-code-sync-hardening.md

## User stories covered

1-8, 34-36

## What to build

Make Claude Code detected-source ingestion full-fidelity for the user-visible
paths that claim to freshen Claude Code memory. Both manual detected sync and
first-run setup must index primary transcripts and nested subagent transcripts,
then make both searchable with preserved provenance.

This slice is complete when an agent can create a synthetic Claude Code project
tree with one primary transcript and one nested subagent transcript, run the
public setup/sync behavior, and search for sentinel text from both files.

## Acceptance criteria

- [ ] `lore sync claude-code --home <dir>` indexes primary and nested subagent transcripts from the detected `~/.claude/projects` root.
- [ ] `lore setup --home <dir>` indexes Claude Code subagent transcripts during first-run onboarding.
- [ ] Search can find a sentinel from a synced subagent transcript.
- [ ] Subagent provenance remains distinguishable through the stored agent/source-file metadata.
- [ ] Tests prove the behavior through the CLI/setup seam using synthetic fixtures.
- [ ] Existing Codex detected sync behavior remains unchanged.

## Blocked by

None - can start immediately

## Verification

Run targeted CLI/setup tests for detected sync and onboarding, then include the
slice in the final `npm run check`.
