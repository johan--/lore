# Issue 2 — Full ingestion fidelity: nested layout, uuid-collision correctness, every dimension

Type: AFK · Blocked by: Issue 1 (walking skeleton) · Plan: docs/PRD-lore.md

## What to build

Take the minimal claude-code adapter from Slice 1 and make it index the **real** corpus correctly and completely. The walking skeleton proved one primary file flows through the pipeline; this slice makes ingestion trustworthy across the actual on-disk shape (86% of transcript files are nested subagent files) and locks in the data-model decisions the critic forced.

Scope:
- **Directory discovery**: walk `~/.claude/projects/<encoded-path>/` to find both primary `<sessionId>.jsonl` files and nested `<sessionId>/subagents/agent-<hash>.jsonl` files. Each physical file becomes a `source_files` row with the correct `kind` (`primary`|`subagent`), `agent_file`, and — for subagents — linkage back to the spawning `session_id`.
- **Three-ID model enforced end-to-end**: `source_file_id` (physical file), `session_id` (logical, read from line payload, shared across a parent and its subagent files), and the subagent dimension. A subagent file's messages roll up under the same logical session as the parent, while still being attributable to their specific agent file.
- **uuid-collision correctness**: synthetic `message_id = hash(source_file_id + uuid + seq)` is the PK. Indexing a file where the same `uuid` appears on lines with different content must produce **distinct** message rows (this is real in the corpus — verified repeated uuids carry different payloads). `uuid`/`parent_uuid` remain plain columns for thread reconstruction.
- **Per-type classification, complete**: handle `user`, `assistant`, `system` roles; extract every `tool_use` and `tool_result` block into `tool_calls`, paired within `(source_file_id)` scope; populate the dimension columns used by filters — `project`, `branch`, `agent`/`agent_file`, `skill`, `tool`, `role`, `model`, `timestamp`. Meta/unknown line types are skipped with a counted, logged skip (never a crash).
- **Rollups**: `sessions` row aggregates its files — first/last timestamp, message count, models seen, projects/branches seen.
- **Filter-complete search**: extend `searchMemory` to honor all dimensions: `{project?, branch?, agent?, skill?, tool?, role?, model?, since?, until?, limit?}`.

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] Discovery finds both primary and nested subagent files under a fixture mirroring the real `<sessionId>/subagents/agent-<hash>.jsonl` layout.
- [ ] Subagent-file messages share the parent's `session_id` but remain attributable to their `agent_file`/`source_file_id`.
- [ ] A fixture with the same `uuid` on two lines of differing content yields two distinct `messages` rows (no overwrite).
- [ ] `tool_use`/`tool_result` are extracted and paired correctly within file scope.
- [ ] Every filter dimension (`project, branch, agent, skill, tool, role, model, since, until`) narrows results as asserted by behavior tests.
- [ ] Unknown/meta line types are skipped and counted, not crashed on.
- [ ] Re-indexing remains idempotent on `message_id`.

## Verification

`npm run check`
