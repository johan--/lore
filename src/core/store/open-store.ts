import Database from "better-sqlite3";
import { initSchema } from "./schema.js";

export type Store = Database.Database;

/**
 * Open (or create) the recall store at `path` (":memory:" for tests). Sets WAL
 * + a busy timeout for concurrent readers/writers, then ensures the schema.
 */
export function openStore(path: string): Store {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}
