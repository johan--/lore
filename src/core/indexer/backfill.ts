import type { Store } from "../store/open-store.js";
import { indexFile } from "./index-file.js";
import { discoverTranscripts } from "../../adapters/claude-code/discover.js";
import { logger } from "../logger.js";

export interface BackfillOptions {
  /** Index subagent files too. Slice 1 default indexes primary files only. */
  includeSubagents?: boolean;
  maxTextChars?: number;
}

export interface BackfillResult {
  files: number;
  messages: number;
  toolCalls: number;
  skipped: number;
}

/**
 * Index every transcript under `root`. Returns rolled-up totals. Each file is
 * indexed in its own transaction so a failure on one file doesn't lose the rest.
 */
export async function backfillDirectory(
  db: Store,
  root: string,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  const discovered = await discoverTranscripts(root);
  const targets = opts.includeSubagents
    ? discovered
    : discovered.filter((f) => f.kind === "primary");

  const totals: BackfillResult = { files: 0, messages: 0, toolCalls: 0, skipped: 0 };
  for (const file of targets) {
    try {
      const result = await indexFile(db, {
        path: file.path,
        kind: file.kind,
        agentFile: file.agentFile,
        maxTextChars: opts.maxTextChars,
      });
      totals.files++;
      totals.messages += result.messages;
      totals.toolCalls += result.toolCalls;
      totals.skipped += result.skipped;
    } catch (err) {
      logger.error("failed to index file", { path: file.path, error: String(err) });
    }
  }
  logger.info("backfill complete", { ...totals });
  return totals;
}
