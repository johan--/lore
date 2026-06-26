import type { Store } from "../core/store/open-store.js";
import type { Source } from "../core/records.js";
import { backfillDirectory } from "../core/indexer/backfill.js";
import { getAdapter } from "../adapters/registry.js";
import { searchMemory } from "../core/search/search-memory.js";
import { detectSources } from "./detect-sources.js";

export interface IndexedSource {
  source: Source;
  files: number;
  messages: number;
  toolCalls: number;
}

export interface SetupResult {
  /** Sources found on disk and indexed into the store. */
  indexed: IndexedSource[];
  /** True if a search over the freshly indexed store returned at least one hit. */
  verified: boolean;
  /** Number of hits returned by the self-verification search. */
  verifyHits: number;
}

export interface SetupOptions {
  /**
   * Credential redaction for the backfill. Omit to use the write path default
   * (on). Pass `false` to store transcripts verbatim (--no-redact).
   */
  redact?: boolean;
}

/**
 * The end-to-end onboarding action: probe the machine for known harnesses, index
 * each into the shared store, then prove the search path works by querying a
 * token drawn from the freshly indexed content. `home` is injectable for tests.
 * This never touches any MCP client config — registration is the agent's job.
 */
export async function runSetup(
  db: Store,
  home?: string,
  opts: SetupOptions = {},
): Promise<SetupResult> {
  const detected = await detectSources(home);
  const indexed: IndexedSource[] = [];
  for (const found of detected) {
    const adapter = getAdapter(found.source);
    if (!adapter) continue;
    const totals = await backfillDirectory(db, found.dir, {
      adapter,
      includeSubagents: found.source === "claude-code",
      progressEvery: 25,
      redact: opts.redact,
    });
    indexed.push({
      source: found.source,
      files: totals.files,
      messages: totals.messages,
      toolCalls: totals.toolCalls,
    });
  }

  const verifyHits = verifySearch(db);
  return { indexed, verified: verifyHits > 0, verifyHits };
}

/**
 * Prove retrieval works by pulling a real token out of an indexed message and
 * searching for it. A self-referential query guarantees a hit whenever any
 * content was indexed, so it tests the live FTS path rather than a fixed word
 * that might be absent.
 */
function verifySearch(db: Store): number {
  const row = db.prepare("SELECT text FROM messages WHERE length(text) > 0 LIMIT 1").get() as
    | { text: string }
    | undefined;
  if (!row) return 0;
  const token = row.text.match(/[a-zA-Z0-9]{3,}/)?.[0];
  if (!token) return 0;
  return searchMemory(db, token, { limit: 1 }).length;
}
