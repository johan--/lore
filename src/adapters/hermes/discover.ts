import { readdir } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { DiscoveredFile } from "../contract.js";
import { makeDbRef } from "../sqlite/db-ref.js";

/**
 * Hermes stores all chat history in a single SQLite file (`state.db`) with a flat
 * `messages` table keyed by `session_id` and a `sessions` table of per-session
 * metadata. One Hermes session is one conversation, so discovery enumerates the
 * distinct session ids that actually have messages and returns one
 * `DiscoveredFile` per conversation — each with a `<dbPath>#<sessionId>` ref so
 * the shared writer (which recomputes one session per batch) sees one session per
 * file.
 *
 * Hermes keeps several `state.db` files: the live one at the root, per-profile
 * copies under `profiles/<name>/` (legitimately distinct histories, kept), and
 * pre-update backups under `state-snapshots/` (duplicates of the live DB, skipped
 * so the same session is not indexed twice).
 */
export async function discoverHermesTranscripts(root: string): Promise<DiscoveredFile[]> {
  const dbPaths: string[] = [];
  await walk(root, dbPaths);

  const found: DiscoveredFile[] = [];
  for (const dbPath of dbPaths) {
    for (const sessionId of sessionIds(dbPath)) {
      found.push({
        path: makeDbRef(dbPath, sessionId),
        kind: "primary",
        agentFile: null,
        sessionId,
      });
    }
  }
  return found;
}

async function walk(dir: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Pre-update backups duplicate the live DB; don't descend into them.
      if (entry.name === "state-snapshots") continue;
      await walk(full, acc);
    } else if (entry.isFile() && entry.name === "state.db") {
      acc.push(full);
    }
  }
}

/** Distinct session ids that actually have messages in this database. */
function sessionIds(dbPath: string): string[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const hasTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .get();
    if (!hasTable) return [];
    const rows = db.prepare("SELECT DISTINCT session_id AS sessionId FROM messages").all() as {
      sessionId: string;
    }[];
    return rows.map((r) => r.sessionId).filter((id) => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}
