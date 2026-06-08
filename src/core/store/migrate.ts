import type DatabaseType from "better-sqlite3";
import { contentHash } from "./content-hash.js";

/**
 * The schema version this build of lore expects. A fresh store created by
 * `initSchema` is at version 1. Bump this whenever you append a migration step.
 */
export const SCHEMA_VERSION = 3;

/**
 * Ordered migration steps. Each step's `to` is the schema version it produces,
 * and `up` performs the change. To evolve the schema later (for example, adding
 * a `state_signal` column), append a step with the next version number and the
 * DDL that applies it:
 *
 *   { to: 2, up: (db) => db.exec("ALTER TABLE messages ADD COLUMN state_signal TEXT") }
 *
 * Existing user stores are upgraded in order; a fresh store gets the base schema
 * from `initSchema` and is simply stamped to the latest version.
 */
const MIGRATIONS: { to: number; up: (db: DatabaseType.Database) => void }[] = [
  {
    // Source-agnostic resume: store a tagged ResumeToken (JSON) per source file.
    // Byte sources keep their legacy byte_offset/line_count/prefix_sha256/mtime
    // columns (resume falls back to them when this column is null), so existing
    // stores upgrade without a re-index.
    to: 2,
    up: (db) => db.exec("ALTER TABLE source_files ADD COLUMN resume_token TEXT"),
  },
  {
    // Recurrence-based importance: hash each message's canonical organic content
    // so the same authored content recurring across distinct sessions can be
    // counted at query time. Null for boilerplate/short messages. Backfilled in
    // pages (full text loaded a page at a time, never the whole corpus at once;
    // a read cursor must be fully drained before writing on the same connection).
    to: 3,
    up: (db) => {
      db.exec("ALTER TABLE messages ADD COLUMN content_hash TEXT");
      db.exec("CREATE INDEX IF NOT EXISTS idx_messages_content_hash ON messages (content_hash)");
      // Re-scope the FTS sync trigger to text-only BEFORE backfilling. The v1
      // trigger fired on any UPDATE, so writing content_hash would needlessly
      // re-index every row's text in FTS5 — turning this backfill into a full
      // FTS rebuild under one lock. Scoped to `OF text`, the backfill touches
      // only the new column and leaves the index alone.
      db.exec(`
        DROP TRIGGER IF EXISTS messages_au;
        CREATE TRIGGER messages_au AFTER UPDATE OF text ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
          INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
        END;
      `);
      backfillContentHash(db);
    },
  },
];

function backfillContentHash(db: DatabaseType.Database): void {
  const page = db.prepare(
    "SELECT rowid AS rid, text FROM messages WHERE rowid > ? ORDER BY rowid LIMIT 1000",
  );
  const update = db.prepare("UPDATE messages SET content_hash = ? WHERE rowid = ?");
  let lastRowid = 0;
  for (;;) {
    const rows = page.all(lastRowid) as { rid: number; text: string }[];
    if (rows.length === 0) break;
    for (const row of rows) {
      update.run(contentHash(row.text), row.rid);
      lastRowid = row.rid;
    }
  }
}

/** Read the store's current schema version (`PRAGMA user_version`). */
export function getSchemaVersion(db: DatabaseType.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

/**
 * Bring `db` up to SCHEMA_VERSION. Assumes `initSchema` already created the base
 * tables. A store reporting user_version 0 is treated as a base (version 1)
 * store: it was either just created, or it predates versioning but already
 * carries the v1 schema via the `IF NOT EXISTS` DDL. Each pending migration runs
 * in its own transaction, and user_version is advanced only after it succeeds,
 * so an interrupted upgrade never leaves a half-stamped store.
 */
export function runMigrations(db: DatabaseType.Database): void {
  const current = getSchemaVersion(db);
  // An unstamped store (0) is already at the base version 1.
  let version = current === 0 ? 1 : current;

  for (const step of MIGRATIONS) {
    if (step.to > version) {
      const apply = db.transaction(() => {
        step.up(db);
        db.pragma(`user_version = ${step.to}`);
      });
      apply();
      version = step.to;
    }
  }

  // Stamp the base version on a store that was unstamped and had no migrations
  // to run (the common fresh-install and pre-versioning cases).
  if (version !== current) {
    db.pragma(`user_version = ${version}`);
  }
}
