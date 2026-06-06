import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoveredFile } from "../contract.js";

/**
 * Walk a directory tree for Codex transcripts. Codex writes one file per session
 * as `rollout-<timestamp>-<uuid>.jsonl` under `~/.codex/archived_sessions` (and
 * `~/.codex/sessions`). We match the `rollout-` prefix so pointing recall at the
 * whole `~/.codex` dir doesn't sweep in unrelated logs (`history.jsonl`,
 * `session_index.jsonl`, …). Subagent forks are marked inside the file's
 * `session_meta`, not by directory, so discovery tags every file `primary`.
 */
export async function discoverCodexTranscripts(root: string): Promise<DiscoveredFile[]> {
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
    } else if (
      entry.isFile() &&
      entry.name.startsWith("rollout-") &&
      entry.name.endsWith(".jsonl")
    ) {
      acc.push({ path: full, kind: "primary", agentFile: null, sessionId: null });
    }
  }
}
