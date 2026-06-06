import type { SourceAdapter } from "../contract.js";
import { discoverCodexTranscripts } from "./discover.js";
import { parseCodexLine } from "./parse-line.js";

/** The Codex adapter: ingests `~/.codex` rollout transcripts into the `codex` namespace. */
export const codexAdapter: SourceAdapter = {
  source: "codex",
  discover: discoverCodexTranscripts,
  parseLine: parseCodexLine,
};
