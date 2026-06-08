import type { Store } from "../store/open-store.js";
import { contentHash } from "../store/content-hash.js";
import { searchMemory, type SearchHit, type SearchOptions } from "./search-memory.js";
import { scoreRelevance } from "./score-relevance.js";
import { importanceBoost } from "./derive-importance.js";

export interface FindRelevantOptions extends SearchOptions {
  /** Reference time for the recency prior (ISO-8601). Defaults to now. */
  now?: string;
}

const DEFAULT_LIMIT = 20;

/**
 * Relevance-led ranking. Where `searchMemory` ranks by pure bm25, this re-ranks a
 * larger bm25 candidate pool with `scoreRelevance`: relevance leads, recency is a
 * bounded prior on a ~week scale, and derived importance — how many distinct
 * sessions a memory's organic content recurs across — adds a small capped lift.
 * So a clearly stronger older match beats a weak fresh one, recency and importance
 * only settle near-ties, and a memory with a missing timestamp simply earns no
 * freshness bonus rather than being crushed. The recurrence lookup is a single
 * read-only query; nothing is written on the search path.
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
  const recurrence = recurrenceBySession(db, candidates);

  return candidates
    .map((hit) => {
      const hash = contentHash(hit.text);
      const sessions = hash ? (recurrence.get(hash) ?? 1) : 1;
      return {
        ...hit,
        score: scoreRelevance({
          bm25: hit.score,
          ageHours: ageHoursOf(hit.timestamp, now),
          importanceBoost: importanceBoost(sessions),
        }),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * For the candidate hits, count how many distinct sessions each one's canonical
 * content recurs across, in a single grouped query over the indexed content_hash.
 */
function recurrenceBySession(db: Store, candidates: SearchHit[]): Map<string, number> {
  const hashes = new Set<string>();
  for (const hit of candidates) {
    const hash = contentHash(hit.text);
    if (hash) hashes.add(hash);
  }
  const counts = new Map<string, number>();
  if (hashes.size === 0) return counts;

  const keys = [...hashes];
  const placeholders = keys.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT content_hash AS hash, COUNT(DISTINCT session_id) AS sessions
         FROM messages
        WHERE content_hash IN (${placeholders})
        GROUP BY content_hash`,
    )
    .all(...keys) as { hash: string; sessions: number }[];
  for (const row of rows) counts.set(row.hash, row.sessions);
  return counts;
}

function ageHoursOf(timestamp: string | null, now: number): number {
  if (typeof timestamp !== "string") return Infinity;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return Infinity;
  return Math.max(0, now - parsed) / 3_600_000;
}
