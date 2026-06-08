import { optimizeFts, type Store } from "../store/open-store.js";
import { indexFile } from "./index-file.js";
import { logger } from "../logger.js";
import type { SourceAdapter } from "../../adapters/contract.js";
import { claudeCodeAdapter } from "../../adapters/claude-code/adapter.js";

export interface BackfillOptions {
  /** Index subagent files too. Slice 1 default indexes primary files only. */
  includeSubagents?: boolean;
  maxTextChars?: number;
  /** Emit a progress log line every N files processed. Default 100. */
  progressEvery?: number;
  /** Opt-in secret redaction over text/tool payloads. Off by default. */
  redact?: boolean;
  /** Source adapter for discovery + parsing. Defaults to the Claude Code adapter. */
  adapter?: SourceAdapter;
}

export interface BackfillResult {
  /** Files discovered and processed (whether indexed or skipped). */
  files: number;
  /** Files that had new content indexed (full or append). */
  filesIndexed: number;
  /** Files the watermark found unchanged and skipped without re-reading. */
  filesSkipped: number;
  messages: number;
  toolCalls: number;
  skipped: number;
}

/**
 * Index every transcript under `root`. Incremental by construction: the
 * per-file watermark in `indexFile` skips unchanged files (a cheap stat + head
 * hash), appends only new tails, and fully re-indexes rewritten files. Each file
 * is indexed in its own transaction so a failure on one file doesn't lose the
 * rest, and files are streamed line-by-line so memory stays bounded regardless
 * of transcript size.
 */
export async function backfillDirectory(
  db: Store,
  root: string,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  const adapter = opts.adapter ?? claudeCodeAdapter;
  const discovered = await adapter.discover(root);
  const targets = opts.includeSubagents
    ? discovered
    : discovered.filter((f) => f.kind === "primary");

  const progressEvery = opts.progressEvery ?? 100;
  const totals: BackfillResult = {
    files: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    messages: 0,
    toolCalls: 0,
    skipped: 0,
  };
  for (const file of targets) {
    try {
      const result = await indexFile(db, {
        path: file.path,
        kind: file.kind,
        agentFile: file.agentFile,
        sessionId: file.sessionId ?? undefined,
        maxTextChars: opts.maxTextChars,
        redact: opts.redact,
        adapter,
      });
      totals.files++;
      if (result.mode === "skip") {
        totals.filesSkipped++;
      } else {
        totals.filesIndexed++;
      }
      totals.messages += result.messages;
      totals.toolCalls += result.toolCalls;
      totals.skipped += result.skipped;
      if (totals.files % progressEvery === 0) {
        logger.info("backfill progress", {
          processed: totals.files,
          total: targets.length,
          indexed: totals.filesIndexed,
          skipped: totals.filesSkipped,
        });
      }
    } catch (err) {
      logger.error("failed to index file", { path: file.path, error: String(err) });
    }
  }
  // Compact the FTS segments left behind by this batch's inserts, but only when
  // we actually wrote something — an all-skipped incremental re-run shouldn't pay
  // for an optimize. This keeps the merge on the heavy `index`/`setup` paths and
  // off the hot per-message `hook` path (which calls indexFile directly).
  if (totals.filesIndexed > 0) {
    optimizeFts(db);
  }
  logger.info("backfill complete", { ...totals });
  return totals;
}
