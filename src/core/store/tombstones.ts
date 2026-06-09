import type { Store } from "./open-store.js";

/**
 * Deep module for the tombstones table. This is the only code that reads or
 * writes that table. Callers treat tombstones as a black box through this
 * interface; nothing else should reach into the table directly.
 *
 * Tombstone kinds:
 *   "session" — a specific session_id is barred from the index
 *   "project" — a project cwd path is barred (all current and future sessions)
 *
 * Tombstone reasons:
 *   "forget"  — user invoked `lore forget` (point-in-time removal)
 *   "exclude" — user invoked `lore exclude` (standing exclusion rule)
 *   any other string — a user-supplied note
 */

export type TombstoneKind = "session" | "project";

export interface Tombstone {
  kind: TombstoneKind;
  value: string;
  reason: string;
  created_at: string;
}

export interface TombstoneSets {
  sessions: Set<string>;
  projects: Set<string>;
}

/**
 * Add (or replace) a tombstone. Idempotent on (kind, value): re-adding the
 * same pair with the same or a different reason never throws and never
 * duplicates the row — it simply updates it.
 */
export function addTombstone(
  db: Store,
  entry: { kind: TombstoneKind; value: string; reason: string },
): void {
  db.prepare(
    `INSERT INTO tombstones (kind, value, reason, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(kind, value) DO UPDATE SET
       reason     = excluded.reason,
       created_at = excluded.created_at`,
  ).run(entry.kind, entry.value, entry.reason, new Date().toISOString());
}

/**
 * Remove a tombstone by (kind, value). No-op if the entry does not exist.
 */
export function removeTombstone(db: Store, kind: TombstoneKind, value: string): void {
  db.prepare("DELETE FROM tombstones WHERE kind = ? AND value = ?").run(kind, value);
}

/**
 * List all tombstones, optionally filtered to a single kind. Returns rows in
 * insertion order (created_at ascending).
 */
export function listTombstones(db: Store, kind?: TombstoneKind): Tombstone[] {
  if (kind !== undefined) {
    return db
      .prepare(
        "SELECT kind, value, reason, created_at FROM tombstones WHERE kind = ? ORDER BY created_at",
      )
      .all(kind) as Tombstone[];
  }
  return db
    .prepare("SELECT kind, value, reason, created_at FROM tombstones ORDER BY created_at")
    .all() as Tombstone[];
}

/**
 * Load the full tombstone table into two in-memory sets for fast guard lookups.
 * The write-path guard (Issue 7) calls this once per batch, then checks each
 * normalized row's session_id against `sessions` and its project against
 * `projects` before writing.
 */
export function loadTombstoneSets(db: Store): TombstoneSets {
  const rows = db.prepare("SELECT kind, value FROM tombstones").all() as {
    kind: TombstoneKind;
    value: string;
  }[];

  const sessions = new Set<string>();
  const projects = new Set<string>();

  for (const row of rows) {
    if (row.kind === "session") {
      sessions.add(row.value);
    } else {
      projects.add(row.value);
    }
  }

  return { sessions, projects };
}
