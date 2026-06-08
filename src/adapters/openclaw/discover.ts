import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { DiscoveredFile } from "../contract.js";

/**
 * Walk a directory tree for openclaw transcripts. openclaw writes one file per
 * session as `<session-uuid>.jsonl` under `~/.openclaw/agents/<name>/sessions/`.
 * We only accept `.jsonl` files whose immediate parent directory is `sessions`,
 * so pointing lore at the whole `~/.openclaw` dir doesn't sweep in unrelated
 * logs (`logs/config-audit.jsonl`, the per-agent `sessions.json`, …). The
 * filename (a session uuid) is
 * the authoritative session id, so discovery sets it directly.
 */
export async function discoverOpenclawTranscripts(root: string): Promise<DiscoveredFile[]> {
  const found: DiscoveredFile[] = [];
  await walk(root, found);
  return found;
}

async function walk(dir: string, acc: DiscoveredFile[]): Promise<void> {
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
    } else if (entry.isFile() && entry.name.endsWith(".jsonl") && basename(dir) === "sessions") {
      acc.push({
        path: full,
        kind: "primary",
        agentFile: null,
        sessionId: entry.name.replace(/\.jsonl$/i, ""),
      });
    }
  }
}
