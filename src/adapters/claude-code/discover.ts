import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SourceFileKind } from "../../core/records.js";

export interface DiscoveredFile {
  path: string;
  kind: SourceFileKind;
  /** For subagent files, the agent file name (basename without extension). */
  agentFile: string | null;
  /**
   * Authoritative session id. For subagent files this is the parent session,
   * derived structurally from the path (`<sessionId>/subagents/agent-*.jsonl`).
   * Null for primary files, where the indexer infers it from the payload/filename.
   */
  sessionId: string | null;
}

/**
 * Walk a directory tree for Claude Code transcripts. Files directly named
 * `<sessionId>.jsonl` are `primary`; files under a `subagents/` directory
 * (`<sessionId>/subagents/agent-<hash>.jsonl`) are `subagent`. Slice 1 indexes
 * primary files; full subagent handling lands in slice 2, but discovery already
 * tags both so the indexer can opt in.
 */
export async function discoverTranscripts(root: string): Promise<DiscoveredFile[]> {
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
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const isSubagent = basename(dir) === "subagents";
      acc.push({
        path: full,
        kind: isSubagent ? "subagent" : "primary",
        agentFile: isSubagent ? entry.name.replace(/\.jsonl$/i, "") : null,
        // <sessionId>/subagents/agent-*.jsonl → the parent session is the dir
        // that holds `subagents/`.
        sessionId: isSubagent ? basename(dirname(dir)) : null,
      });
    }
  }
}
