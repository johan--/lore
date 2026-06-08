import type { Store } from "../store/open-store.js";
import { searchMemory, type SearchHit, type SearchOptions } from "./search-memory.js";
import { clampLimit, MAX_RESULTS } from "../limits.js";

export interface FindRelevantOptions extends SearchOptions {
  /** Reference time for the recency blend (ISO-8601). Defaults to now. */
  now?: string;
}

const DEFAULT_LIMIT = 20;

/**
 * Recency-blended relevance ranking. Where `searchMemory` ranks by pure bm25,
 * this multiplies each hit's keyword score by a recency factor `1/(1+ageHours)`,
 * so a fresh memory outranks an equally-relevant stale one while a much stronger
 * keyword match can still beat a merely newer one. A candidate pool larger than
 * the requested limit is pulled by bm25 first, so a recent-but-lower-bm25 memory
 * can still surface into the final ranking.
 */
export function findRelevant(
  db: Store,
  query: string,
  opts: FindRelevantOptions = {},
): SearchHit[] {
  const limit = clampLimit(opts.limit, DEFAULT_LIMIT, MAX_RESULTS);
  const now = typeof opts.now === "string" ? Date.parse(opts.now) : Date.now();
  const candidatePool = Math.max(limit * 5, 100);

  const candidates = searchMemory(db, query, { ...opts, limit: candidatePool });

  const blended = candidates
    .map((hit) => ({ ...hit, score: hit.score * recencyFactor(hit.timestamp, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return blended;
}

function recencyFactor(timestamp: string | null, now: number): number {
  if (typeof timestamp !== "string") return Number.EPSILON;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return Number.EPSILON;
  const ageHours = Math.max(0, now - parsed) / 3_600_000;
  return 1 / (1 + ageHours);
}
