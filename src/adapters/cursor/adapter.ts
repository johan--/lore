import type { SourceAdapter } from "../contract.js";
import { discoverCursorTranscripts } from "./discover.js";
import { ingestCursorConversation } from "./ingest.js";

/**
 * The Cursor adapter: ingests Cursor's `globalStorage/state.vscdb` chat history
 * into the `cursor` namespace. Unlike the JSONL adapters, Cursor is a
 * database-backed source — it implements `ingest` directly (opening SQLite,
 * filtering to one composer, resuming by rowid) rather than wrapping a per-line
 * mapper. It is honestly text-only: Cursor bubbles store no tool-call data, so
 * none is fabricated.
 */
export const cursorAdapter: SourceAdapter = {
  source: "cursor",
  discover: discoverCursorTranscripts,
  ingest: ingestCursorConversation,
};
