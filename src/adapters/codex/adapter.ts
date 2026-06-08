import type { SourceAdapter } from "../contract.js";
import { lineIngest } from "../../core/indexer/line-ingest.js";
import { discoverCodexTranscripts } from "./discover.js";
import { getCodexFileMetadata, parseCodexLine } from "./parse-line.js";

/**
 * The Codex adapter: ingests `~/.codex` rollout transcripts into the `codex`
 * namespace. A line-oriented JSONL source — it expresses its per-line mapping
 * (plus a file-metadata pass for the session-meta line) and wraps it with the
 * built-in `lineIngest` helper.
 */
export const codexAdapter: SourceAdapter = {
  source: "codex",
  discover: discoverCodexTranscripts,
  ingest: lineIngest({
    source: "codex",
    getFileMetadata: getCodexFileMetadata,
    parseLine: parseCodexLine,
  }),
};
