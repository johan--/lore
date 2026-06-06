import type { Store } from "../core/store/open-store.js";
import { indexFile } from "../core/indexer/index-file.js";
import { logger } from "../core/logger.js";

/**
 * Index the current session's transcript in response to a harness lifecycle
 * hook (Claude Code PreCompact / SessionEnd). These hooks deliver a JSON payload
 * on stdin that names the live transcript file; indexing it just before
 * compaction or session end is what lets recall survive context loss — the
 * verbatim history is in the store before the window is wiped.
 *
 * Hooks must never crash the harness, so every failure path here is a quiet
 * no-op: malformed payloads, missing paths, and index errors all return
 * `{ indexed: false }` rather than throwing.
 */

export interface HookResult {
  indexed: boolean;
  reason?: string;
}

interface HookPayload {
  transcript_path?: unknown;
}

export async function indexFromHookPayload(
  db: Store,
  payload: string,
  opts: { maxTextChars?: number; redact?: boolean } = {},
): Promise<HookResult> {
  let parsed: HookPayload;
  try {
    parsed = JSON.parse(payload) as HookPayload;
  } catch {
    logger.debug("hook payload was not valid JSON; skipping");
    return { indexed: false, reason: "invalid_json" };
  }

  const path = typeof parsed.transcript_path === "string" ? parsed.transcript_path : null;
  if (!path) {
    logger.debug("hook payload had no transcript_path; skipping");
    return { indexed: false, reason: "no_transcript_path" };
  }

  try {
    const result = await indexFile(db, {
      path,
      maxTextChars: opts.maxTextChars,
      redact: opts.redact,
    });
    logger.info("indexed current session from hook", { path, mode: result.mode });
    return { indexed: true };
  } catch (err) {
    logger.error("hook index failed", { path, error: String(err) });
    return { indexed: false, reason: "index_error" };
  }
}
