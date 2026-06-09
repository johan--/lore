# Issue 5 — Tombstone substrate: schema v3, tombstone store, deletion helpers

Type: AFK · Blocked by: none (foundation) · Plan: docs/PRD-memory-control.md

## What to build

The persistent foundation that makes forgetting durable: a `tombstones` table, a deep module that owns it, and the row-deletion helpers the forget/exclude verbs will call. No CLI, no guard wiring, no redaction here — this slice is the substrate the next two slices build on, tested in isolation.

Scope:
- **Migration v3.** Append one step to the migration array that creates the `tombstones` table and bumps `SCHEMA_VERSION` from 2 to 3. Append-only; existing stores upgrade in place. Fix the stale `{ to: 2 }` doc-comment example in `migrate.ts` while you are there (it should illustrate the real latest step).
- **`tombstones` table** (see PRD for the exact shape):
  ```
  tombstones
    kind        TEXT   -- "session" | "project"
    value       TEXT   -- session_id, or project (cwd) path
    reason      TEXT   -- "forget" | "exclude" | user note
    created_at  TEXT   -- iso timestamp
    PRIMARY KEY (kind, value)
  ```
- **Tombstone store** — a new deep module (e.g. `src/core/store/tombstones.ts`) and the only code that touches the table. Interface: `addTombstone`, `removeTombstone`, `listTombstones(kind?)`, and `loadTombstoneSets(db)` returning the session-set and project-set the guard (Issue 7) will consult. Composite-key inserts are idempotent (upsert / INSERT OR REPLACE semantics).
- **Deletion helpers** — extend the existing deletion machinery (`upsert.ts`, alongside `deleteFileRows`) with delete-by-session-id and delete-by-project helpers. They delete `messages` rows; the existing FTS delete trigger (`messages_ad`) keeps search synced automatically — verify, don't reimplement. Roll up / clean any orphaned `sessions` rows consistently with how the codebase already maintains that table.

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] A fresh store created via migrations reports `SCHEMA_VERSION = 3` and has a `tombstones` table with the documented columns + composite PK.
- [ ] An existing v2 store upgrades in place to v3 without data loss (behavior test: seed v2-shaped data, migrate, assert rows intact + table present).
- [ ] Tombstone store round-trips: add → list (with and without kind filter) → loadSets reflects the entry; remove deletes it; re-adding the same (kind,value) is idempotent (no duplicate, no throw).
- [ ] Delete-by-session removes exactly that session's messages and leaves others intact; FTS search no longer returns the deleted content (trigger verified by behavior).
- [ ] Delete-by-project removes every message whose `project` matches (exact string) and leaves other projects intact.

## Verification

`npm run check`
