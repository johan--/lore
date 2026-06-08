/**
 * Pure relevance scorer. Relevance (bm25) leads; recency is a bounded multiplier
 * on a ~week scale, never the dominant term; importance is a small capped boost.
 *
 * The recency multiplier is clamped to [RECENCY_FLOOR, 1], so recency can dampen a
 * score by at most `1 - RECENCY_FLOOR`. With a 0.5 floor a fresh memory is worth at
 * most 2x its ancient self, which means any match more than 2x stronger in bm25
 * wins regardless of age — "a clearly stronger older match beats a weak fresh one",
 * with recency only settling near-ties.
 */
export interface RelevanceInputs {
  /** Lexical match strength; higher is a better keyword match. */
  bm25: number;
  /** Age of the memory in hours at query time; clamped at 0. */
  ageHours: number;
  /** Query-independent importance, as a fractional lift (0 = neutral). */
  importanceBoost?: number;
}

/** Smallest share of a fresh score a memory keeps once it is very old. */
export const RECENCY_FLOOR = 0.5;
/** e-folding scale of the recency prior, in hours (~7 days). */
export const RECENCY_TAU_HOURS = 7 * 24;

function recencyMultiplier(ageHours: number): number {
  const age = Math.max(0, ageHours);
  return RECENCY_FLOOR + (1 - RECENCY_FLOOR) * Math.exp(-age / RECENCY_TAU_HOURS);
}

export function scoreRelevance({ bm25, ageHours, importanceBoost = 0 }: RelevanceInputs): number {
  return bm25 * recencyMultiplier(ageHours) * (1 + importanceBoost);
}
