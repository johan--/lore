import type { SourceAdapter } from "../contract.js";
import { lineIngest } from "../../core/indexer/line-ingest.js";
import { discoverOpenclawTranscripts } from "./discover.js";
import { getOpenclawFileMetadata, parseOpenclawLine } from "./parse-line.js";

/**
 * The openclaw adapter: ingests `~/.openclaw/agents/<name>/sessions` transcripts
 * into the `openclaw` namespace. A line-oriented JSONL source — it expresses its
 * per-line mapping (plus a file-metadata pass for the session/model_change lines)
 * and wraps it with the built-in `lineIngest` helper.
 */
export const openclawAdapter: SourceAdapter = {
  source: "openclaw",
  discover: discoverOpenclawTranscripts,
  ingest: lineIngest({
    source: "openclaw",
    getFileMetadata: getOpenclawFileMetadata,
    parseLine: parseOpenclawLine,
  }),
};
