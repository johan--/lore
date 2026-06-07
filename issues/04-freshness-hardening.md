# Issue 4 — Freshness + hardening: resume-safe watermark, hooks, privacy, README

Type: AFK · Blocked by: Issue 1 (walking skeleton) · Plan: docs/PRD-lore.md

## What to build

Make `lore` keep itself current without re-reading the world, survive interruption, respect privacy, and be usable by a stranger from the README. This is the slice that turns the walking skeleton + full ingestion into something you can leave running and trust over time.

Scope:
- **Resume-safe watermark**: per `source_files` row, persist `(byte_offset, line_count, prefix_sha256)`. On re-index, seek to `byte_offset` and append only new lines when the prefix hash still matches; on prefix mismatch (file rewritten/rotated) do a full re-index of that file. Append-only transcripts must incur near-zero re-work.
- **Incremental + batched backfill**: `lore index <dir>` becomes incremental — only changed/new files are touched. Backfill the full corpus in bounded batches with progress logging, never loading a whole file into memory (streaming parse from Slice 1 holds).
- **Compaction-survival hooks**: a `PreCompact` hook that indexes the current session before context is compressed, and a `SessionEnd` (or equivalent) hook to flush. Document install in the README. This is the original point of the project — memory that outlives compaction.
- **Privacy**: DB is local-only and gitignored; fixtures are synthetic; provide an optional secret-redaction pass over indexed `text`/tool payloads (opt-in, documented). No transcript content leaves the machine.
- **README**: what it is, install, how to backfill, how to wire the hooks, how to point an MCP client (Claude Code and at least one other, e.g. Cursor/Cline) at the stdio server, and the privacy posture. This is the public-repo face of the project.

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] Re-indexing an unchanged file does near-zero work (watermark short-circuit asserted by behavior test, e.g. no new rows + early return).
- [ ] Appending lines to a fixture file indexes only the appended lines.
- [ ] A rewritten file (prefix-hash mismatch) triggers a full, correct re-index.
- [ ] Backfill processes a multi-file fixture corpus in batches with progress logging and no full-file memory load.
- [ ] PreCompact hook indexes the active session; documented and exercised by a test or scripted smoke run.
- [ ] Optional redaction pass removes seeded secrets from indexed content when enabled, and is off by default.
- [ ] README lets a fresh user install, backfill, wire hooks, connect an MCP client, and understand the privacy posture.

## Verification

`npm run check`
