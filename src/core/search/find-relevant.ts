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
  // Hash each candidate once. searchMemory returns the full stored `text` (the
  // same text the indexed content_hash was computed from), so this recomputation
  // is authoritative; reuse it for both the recurrence query and the score below
  // rather than hashing every candidate twice.
  const hashes = candidates.map((hit) => contentHash(hit.text));
  const recurrence = recurrenceBySession(db, hashes);

  return candidates
    .map((hit, i) => {
      const hash = hashes[i];
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
 * For the candidate hits (passed as their precomputed content hashes), count how
 * many distinct sessions each canonical content recurs across, in a single grouped
 * query over the indexed content_hash. System-role messages are excluded from the
 * tally: in the shared multi-harness store they are tool/harness plumbing
 * (command-failure notices, spawn/permission banners, tool-output echoes) that
 * recur verbatim across hundreds of sessions and would otherwise dominate
 * importance. They remain fully searchable; they just don't earn a recurrence
 * boost.
 *
 * Note on session forking: a resumable harness can fork one conversation into
 * several session_ids re-emitting identical authored content, which inflates
 * `COUNT(DISTINCT session_id)`. This is accepted, not corrected: there is no
 * reliable fork key across adapters (codex blanks uuids; forked copies carry
 * distinct timestamps), and the damage is bounded — `importanceBoost` is
 * log-saturated and hard-capped, so a forked lineage and a genuinely recurring
 * one land at nearly the same lift.
 */
function recurrenceBySession(db: Store, candidateHashes: (string | null)[]): Map<string, number> {
  const hashes = new Set<string>();
  for (const hash of candidateHashes) {
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
          AND role != 'system'
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
