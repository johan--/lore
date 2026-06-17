import Database from "better-sqlite3";
import { initSchema } from "./schema.js";
import {
  getSchemaVersion,
  runMigrations,
  SCHEMA_VERSION,
  StoreSchemaTooNewError,
} from "./migrate.js";

export type Store = Database.Database;

/**
 * Tuning for a multi-gigabyte store. `mmap_size` (1 GiB) lets SQLite map the
 * file and let the OS page it in, instead of read()-ing each page over the
 * syscall boundary — a large win for the cold, scan-heavy first query of a
 * session. `cache_size` is negative, so it's KiB: 64 MiB of hot index/leaf
 * pages kept per connection. Both are advisory and harmless on a small store
 * (mmap only maps what's touched), so we apply them uniformly on every open.
 */
function applyReadTuning(db: Store): void {
  db.pragma("mmap_size = 1073741824");
  db.pragma("cache_size = -65536");
}

/**
 * Open (or create) the lore store at `path` (":memory:" for tests). Sets WAL
 * + a busy timeout for concurrent readers/writers, ensures the base schema,
 * then runs any pending migrations and stamps the schema version.
 */
export function openStore(path: string): Store {
  const db = new Database(path);
  try {
    const current = getSchemaVersion(db);
    if (current > SCHEMA_VERSION) {
      throw new StoreSchemaTooNewError(current, SCHEMA_VERSION);
    }

    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    applyReadTuning(db);
    initSchema(db);
    runMigrations(db);
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Open an existing store read-only for query-only callers (the CLI, any
 * shell-capable agent) that must never migrate or mutate. Unlike `openStore`,
 * this skips `initSchema`/`runMigrations` entirely — those are write paths — and
 * requires the file to already exist, so a typo'd path fails loudly instead of
 * silently creating an empty database.
 */
export function openStoreReadonly(path: string): Store {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  applyReadTuning(db);
  return db;
}

/**
 * Merge the FTS5 b-tree into fewer, larger segments. Incremental indexing
 * (every hook fire, every backfilled file) leaves many small segments that
 * slow MATCH and bloat the index; `optimize` compacts them. It's a write, so
 * it belongs only on write paths (`index`/`setup`), never on a query, and it's
 * idempotent — safe to run at the tail of every backfill.
 */
export function optimizeFts(db: Store): void {
  db.prepare("INSERT INTO messages_fts(messages_fts) VALUES ('optimize')").run();
}
