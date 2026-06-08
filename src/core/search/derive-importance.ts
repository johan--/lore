/**
 * Derived importance: how much a memory matters independent of the query, from a
 * signal that is true by construction — how many *distinct sessions* its canonical
 * content recurs across. Content seen in only its own session is not recurring and
 * earns nothing; each further session adds a log-saturated, capped lift.
 *
 * The result is a fractional boost for `scoreRelevance`, deliberately small: a
 * gentle prior that settles near-ties, never enough to drag a weak match over a
 * clearly stronger one.
 */

/** Maximum fractional lift importance can ever add (a gentle prior, not an override). */
export const IMPORTANCE_CAP = 0.25;
/** Recurrence scale: how fast the boost approaches the cap. */
const RECURRENCE_SCALE = 3;

export function importanceBoost(recurrenceSessions: number): number {
  const extra = Math.max(0, recurrenceSessions - 1);
  if (extra === 0) return 0;
  return IMPORTANCE_CAP * (1 - Math.exp(-extra / RECURRENCE_SCALE));
}
