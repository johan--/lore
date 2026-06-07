import Database from "better-sqlite3";
import { initSchema } from "./schema.js";
import { runMigrations } from "./migrate.js";

export type Store = Database.Database;

/**
 * Open (or create) the lore store at `path` (":memory:" for tests). Sets WAL
 * + a busy timeout for concurrent readers/writers, ensures the base schema,
 * then runs any pending migrations and stamps the schema version.
 */
export function openStore(path: string): Store {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  runMigrations(db);
  return db;
}
