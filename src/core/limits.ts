/**
 * Shared bounds that keep any single retrieval call from returning a
 * session-sized dump. A logical session can hold thousands of messages
 * (millions of tokens); the contract is drill-down, never dump. Every paged or
 * ranked reader clamps its requested count through `clampLimit` so no caller —
 * CLI or MCP — can coerce a command into handing back an unbounded slab.
 */

/** Default page size for `getSession` when no limit is requested. */
export const DEFAULT_SESSION_PAGE = 30;
/** Hard ceiling on a single `getSession` page. Requests above this are clamped. */
export const MAX_SESSION_PAGE = 40;
/** Generous ceiling for keyword/relevance hit counts and session-list rollups. */
export const MAX_RESULTS = 200;

/**
 * Clamp a requested count into `[1, max]`. An absent or non-positive request
 * falls back to `fallback` (itself clamped to `max`), so the default can never
 * exceed the ceiling and a caller can never request zero, a negative, or more
 * than the ceiling allows.
 */
export function clampLimit(requested: number | undefined, fallback: number, max: number): number {
  if (requested === undefined || !Number.isFinite(requested) || requested < 1) {
    return Math.min(fallback, max);
  }
  return Math.min(Math.floor(requested), max);
}
