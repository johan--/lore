import type { SourceAdapter } from "../contract.js";
import { discoverTranscripts } from "./discover.js";
import { parseLine } from "./parse-line.js";

/**
 * The reference adapter: Claude Code transcripts. Bundles the discover/parse
 * pair into the contract object so the indexer and the conformance harness can
 * treat every harness uniformly.
 */
export const claudeCodeAdapter: SourceAdapter = {
  source: "claude-code",
  discover: discoverTranscripts,
  parseLine,
};
