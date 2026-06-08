import type { SourceAdapter } from "../contract.js";
import { lineIngest } from "../../core/indexer/line-ingest.js";
import { discoverTranscripts } from "./discover.js";
import { parseLine } from "./parse-line.js";

/**
 * The reference adapter: Claude Code transcripts. A line-oriented JSONL source,
 * so it expresses only its per-line mapping and wraps it with the built-in
 * `lineIngest` helper for streaming + byte resume.
 */
export const claudeCodeAdapter: SourceAdapter = {
  source: "claude-code",
  discover: discoverTranscripts,
  ingest: lineIngest({ source: "claude-code", parseLine }),
};
