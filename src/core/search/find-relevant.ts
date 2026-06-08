import type { Store } from "../store/open-store.js";
import { searchMemory, type SearchHit, type SearchOptions } from "./search-memory.js";
import { scoreRelevance } from "./score-relevance.js";

export interface FindRelevantOptions extends SearchOptions {
  /** Reference time for the recency prior (ISO-8601). Defaults to now. */
  now?: string;
}

const DEFAULT_LIMIT = 20;

/**
 * Relevance-led ranking. Where `searchMemory` ranks by pure bm25, this re-ranks a
 * larger bm25 candidate pool with `scoreRelevance`: relevance leads, recency is a
 * bounded prior on a ~week scale, so a clearly stronger older match beats a weak
 * fresh one and recency only settles near-ties. A memory whose timestamp is missing
 * or unparseable simply earns no freshness bonus rather than being crushed.
 */
export function findRelevant(
  db: Store,
  query: string,
  opts: FindRelevantOptions = {},
): SearchHit[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const now = typeof opts.now === "string" ? Date.parse(opts.now) : Date.now();
  const candidatePool = Math.max(limit * 5, 100);

  const candidates = searchMemory(db, query, { ...opts, limit: candidatePool });

  return candidates
    .map((hit) => ({
      ...hit,
      score: scoreRelevance({ bm25: hit.score, ageHours: ageHoursOf(hit.timestamp, now) }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function ageHoursOf(timestamp: string | null, now: number): number {
  if (typeof timestamp !== "string") return Infinity;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return Infinity;
  return Math.max(0, now - parsed) / 3_600_000;
}
