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
});
