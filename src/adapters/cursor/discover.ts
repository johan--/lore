import { readdir } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { DiscoveredFile } from "../contract.js";
import { makeDbRef } from "../sqlite/db-ref.js";

/**
 * Cursor stores all of its agent chats in a single SQLite file
 * (`globalStorage/state.vscdb`), keyed in the `cursorDiskKV` table as
 * `bubbleId:<composerId>:<bubbleId>`. One Cursor "composer" is one conversation,
 * so discovery enumerates the distinct composer ids and returns one
 * `DiscoveredFile` per conversation — each with a `<dbPath>#<composerId>` ref so
 * the shared writer (which recomputes one session per batch) sees one session per
 * file. Per-workspace `state.vscdb` files carry the `cursorDiskKV` table too but
 * no bubbles, so they yield nothing.
 */
export async function discoverCursorTranscripts(root: string): Promise<DiscoveredFile[]> {
  const dbPaths: string[] = [];
  await walk(root, dbPaths);

  const found: DiscoveredFile[] = [];
  for (const dbPath of dbPaths) {
    for (const composerId of composerIds(dbPath)) {
      found.push({
        path: makeDbRef(dbPath, composerId),
        kind: "primary",
        agentFile: null,
        sessionId: composerId,
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
      await walk(full, acc);
    } else if (entry.isFile() && entry.name === "state.vscdb") {
      acc.push(full);
    }
  }
}

/** Distinct composer ids that actually have bubbles in this database. */
function composerIds(dbPath: string): string[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const hasTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'")
      .get();
    if (!hasTable) return [];
    const rows = db
      .prepare(
        "SELECT DISTINCT substr(key, 10, 36) AS composerId FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'",
      )
      .all() as { composerId: string }[];
    return rows.map((r) => r.composerId).filter((id) => id.length > 0);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}
