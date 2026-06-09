# Issue 7 — Forget/exclude operations + re-index guard (resurrection-proof)

Type: AFK · Blocked by: Issue 5 (tombstone substrate), Issue 6 (write-path default) · Plan: docs/PRD-memory-control.md

## What to build

The verbs and the backstop that makes them permanent. A forget/exclude operations module (preview + execute, transactional) and a row-filter guard inside the shared write path so re-indexing or `push` can never resurrect forgotten/excluded memory. This is the highest-value correctness slice — its resurrection test is the proof the whole feature works.

Scope:
- **Forget/exclude operations module** — a new deep module (e.g. `src/core/ingest/forget.ts`) holding the verbs with a preview/execute split:
  - Preview functions return counts and scope without mutating.
  - Execute functions delete rows (via Issue 5's helpers) and write tombstones (via the tombstone store) in **one transaction**.
  - `forget --session X`: delete X's rows, insert `(session, X, "forget")`.
  - `forget --project P`: enumerate sessions with `SELECT DISTINCT session_id FROM messages WHERE project = P` (NOT the `sessions` rollup — `sessions.project` is the last non-null project and can miss null-last-message sessions), delete rows by `messages.project = P`, insert one `(session, …, "forget")` per enumerated session, and **no** project row (future sessions resume).
  - `exclude --project P`: delete P's rows, insert `(project, P, "exclude")`.
  - `exclude --remove P`: delete the `(project, P)` tombstone (lifts the rule; does not restore data).
  - Project matching is exact-string on the cwd path.
- **Re-index guard** — inside `writeRecordBatch`, load the tombstone sets once per batch and drop any normalized row whose `session_id` is session-tombstoned or whose `project` is project-tombstoned. Keep it off the hot path's per-row cost where reasonable (load sets once, set-membership per row). The guard must not interfere with redaction (Issue 6) — both operate on the same batch.

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] `forget --session` preview reports the true count; execute deletes only that session and writes its tombstone; other sessions untouched.
- [ ] `forget --project` deletes the project's current rows, tombstones each enumerated session, writes no project tombstone, and a session whose last message had a null project is still caught.
- [ ] `exclude --project` deletes existing rows and writes a project tombstone; `exclude --remove` lifts it without restoring data.
- [ ] Operations are transactional — a forced failure mid-execute leaves the store unchanged (no half-delete).
- [ ] **Resurrection test (session):** forget a session, then force a full re-index of its source (rewrite/grow the file so the watermark invalidates and `writeRecordBatch` actually runs — a plain re-index returns `skip` and would be a false green), and separately `push` the same records; assert the data stays gone in both paths.
- [ ] **Resurrection test (project):** same for an excluded project.
- [ ] **Multi-session isolation:** a non-tombstoned session sharing a multi-session store file is unaffected by forgetting its neighbor.

## Verification

`npm run check`
