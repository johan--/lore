import type DatabaseType from "better-sqlite3";

/**
 * The schema version this build of lore expects. A fresh store created by
 * `initSchema` is at version 1. Bump this whenever you append a migration step.
 */
export const SCHEMA_VERSION = 2;

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
];

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
