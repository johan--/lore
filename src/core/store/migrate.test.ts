import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { openStore } from "./open-store.js";
import { initSchema } from "./schema.js";
import { getSchemaVersion, runMigrations, SCHEMA_VERSION } from "./migrate.js";

describe("schema migrations", () => {
  it("stamps a freshly opened store at the current schema version", () => {
    const db = openStore(":memory:");
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("upgrades an unstamped (pre-versioning) store that already has the v1 schema", () => {
    const db = new Database(":memory:");
    initSchema(db); // simulate an old store: base schema, but user_version still 0
    expect(getSchemaVersion(db)).toBe(0);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("is idempotent: running migrations again does not change the version", () => {
    const db = openStore(":memory:");
    const first = getSchemaVersion(db);
    runMigrations(db);
    runMigrations(db);
    expect(getSchemaVersion(db)).toBe(first);
    db.close();
  });

  it("backfills content_hash for rows that predate the v3 migration", () => {
    const db = new Database(":memory:");
    initSchema(db); // v1 store: messages table has no content_hash column yet
    const insert = db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, parent_uuid,
         seq, role, timestamp, text, text_truncated)
       VALUES (?, 'sf', 'sess', ?, NULL, ?, 'user', NULL, ?, 0)`,
    );
    insert.run("m-rich", "u1", 0, "Always run npm run check before committing on this repo.");
    insert.run("m-thin", "u2", 1, "ok"); // too thin to count as recurring

    runMigrations(db);

    const rows = db
      .prepare("SELECT message_id AS id, content_hash AS hash FROM messages ORDER BY seq")
      .all() as { id: string; hash: string | null }[];
    const byId = new Map(rows.map((r) => [r.id, r.hash]));
    expect(byId.get("m-rich")).toBeTruthy();
    expect(byId.get("m-thin")).toBeNull();

    // The backfill must not disturb FTS: the rich row is still searchable.
    const fts = db
      .prepare(
        `SELECT m.message_id AS id FROM messages_fts
           JOIN messages m ON m.rowid = messages_fts.rowid
          WHERE messages_fts MATCH 'committing'`,
      )
      .all() as { id: string }[];
    expect(fts.map((r) => r.id)).toContain("m-rich");
    db.close();
  });
});
