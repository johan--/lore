import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Resolve the store location. Honors `RECALL_DB` (absolute path), else defaults
 * to `~/.recall/recall.db`. Creates the parent directory if needed. The DB lives
 * outside any repo and is gitignored — transcript content never leaves the box.
 */
export function resolveDbPath(): string {
  const fromEnv = process.env.RECALL_DB;
  if (fromEnv && fromEnv.trim().length > 0) {
    ensureParent(fromEnv);
    return fromEnv;
  }
  const path = join(homedir(), ".recall", "recall.db");
  ensureParent(path);
  return path;
}

function ensureParent(path: string): void {
  const parent = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
  if (parent.length > 0) mkdirSync(parent, { recursive: true });
}
