import type { SourceAdapter } from "../contract.js";
import { discoverHermesTranscripts } from "./discover.js";
import { ingestHermesConversation } from "./ingest.js";

/**
 * The Hermes adapter: ingests Hermes's `state.db` chat history into the `hermes`
 * namespace. Like Cursor, Hermes is a database-backed source — it implements
 * `ingest` directly (opening SQLite, filtering to one session, resuming by rowid)
 * rather than wrapping a per-line mapper. Unlike Cursor, Hermes stores real tool
 * calls: an assistant row's `tool_calls` array paired with later `role='tool'`
 * result rows, which the adapter records as tool-call records.
 */
export const hermesAdapter: SourceAdapter = {
  source: "hermes",
  discover: discoverHermesTranscripts,
  ingest: ingestHermesConversation,
};
