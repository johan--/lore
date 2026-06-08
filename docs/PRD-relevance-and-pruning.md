# PRD — `lore`: relevance ranking & memory hygiene

> Status: ready-for-grill · Created 2026-06-07 · Repo: `~/lore` · Branch: `integration/adapters-substrate`
> Companion: ADR `docs/adr/0001-derived-relevance-ranking.md` · Glossary: `CONTEXT.md`

## Problem Statement

Two gaps, found by pressure-testing lore's memory quality against the live store.

1. **The "smart" search returns newest, not best.** `find_relevant` blends bm25 with
   `1/(1+ageHours)`. Measured on the live 2.6 GB store (372k messages): for "adapter substrate"
   the pool median age is 26 days, the two strongest keyword matches (11 and 35 days old) fall out
   of the top 12, and **all top-12 results are age 0** — a today-hit (bm25 10.9) beats the best
   match in the whole store (bm25 14.2, 11 days old) by ~90×. The blend is a recency sort with
   bm25 as a same-day tiebreaker. It fails issue 03's own acceptance criterion; the unit test
   passed only on synthetic same-age timestamps. MCP, CLI, and the in-progress server-free skill
   share this one function, so the defect is system-wide.

2. **An unbounded local hoard with no sense of what matters.** 2.6 GB and growing ~15k messages/day;
   age distribution nearly flat (≈11.8k messages still retained at 40 days). Nothing is ever
   pruned, redaction is opt-in/off-by-default, and ranking has no signal for which memories are
   load-bearing vs. noise. (Origin: "cross-agent memory gets creepy fast" — how do you handle
   pruning/stale context.)

## Solution

Make relevance lead, give lore an honest sense of importance derived from data it already has, and
reserve behavioral logging for the one job only it can do — pruning. Definitions in `CONTEXT.md`.

### Phase 1 — Fix the blend (ranking) · do now

- Replace `1/(1+ageHours)` with a **relevance-led** score: rank by bm25, apply recency as a
  bounded multiplier on a ~7-day scale, so a clearly stronger older match outranks a weak fresh
  one and recency only settles near-ties.
- Fold in **derived importance** — human-authored and recurrence-across-sessions as small,
  capped, log-saturated boosts. Computed from existing columns plus a background recurrence tally;
  **zero writes on the read path**.
- Make the fixed `find_relevant` the single documented default; the server-free skill points
  agents here. `search_memory` stays the explicit pure-lexical escape hatch.
- Rewrite the acceptance test against realistic mixed-age data, not synthetic same-age fixtures.

### Phase 2 — Pruning via usage (hygiene) · later, deliberate

- Add best-effort, droppable **usage-stamps**, off the read path (drop on lock contention).
- Use them only for the **negative signal**: surface "never retrieved" memories as prune/forget
  candidates — "never useful," not "merely old."
- Add an explicit, user-initiated **forget** (delete/redact by session/project/age), independent
  of auto-pruning.

### Non-pillars / honest caveats

- **Echo-in-next-turn reuse detection** (a retrieved memory's content reappearing verbatim in a
  later message): low recall without vectors, noisy attribution. Optional low-weight corroborator
  at most — not a pillar.
- **No importance-by-prose-guessing.** A regex "decision detector" is a fake control; excluded.
  Importance uses only signals true by construction (authorship, recurrence, pin).

## Out of Scope

- Semantic / vector / embedding search (phase 3, separate, opt-in).
- Usage-stamps influencing ranking (pruning only).
- Automatic deletion without usage evidence.

## Open Questions

- Recurrence: background pass vs. incremental at ingest. _Lean: background pass._
- Exact recency curve / half-life and importance-weight caps — tune against the live DB.
- Phase 1 sequencing: ship importance with the recency fix, or recency fix first and importance as
  fast-follow.

## Acceptance Criteria (Phase 1)

- [x] `find_relevant` returns a clearly-stronger older match above a weak fresh one — behavior test
      on mixed-age data (`find-relevant.test.ts`, "clearly stronger older match"). Pure scorer
      contract in `score-relevance.test.ts`.
- [x] `search_memory` behavior unchanged (pure lexical) — untouched.
- [x] No new writes on the read/search path — recurrence is one read-only grouped query over the
      indexed `content_hash`; importance is derived, never logged.
- [x] Skill + docs name the fixed `find_relevant` as the default retrieval surface — README tool
      table + "what a search returns" now lead with `find_relevant` (default) and frame
      `search_memory` as the pure-lexical escape hatch; AGENT-ONBOARD usage blurb does the same.
      CONTEXT.md glossary + ADR-0001 already encode the mandate. Setup-verify steps stay on
      `search_memory` (keyword-existence proof, the right tool there).
- [x] `npm run check` passes (full suite green).

> **Live-store step (not done — needs the user):** the "on the *live* store" check and the schema-v3
> backfill of `~/.lore/lore.db` (~372k rows) run automatically the next time a v3 build opens that
> store. That is a one-time, hard-to-reverse mutation (adds a column, hashes every row), so it is
> deliberately left for the user to trigger rather than run unilaterally.

## What shipped (Phase 1)

- **Recency fix** (commit `f2f7598`): pure `scoreRelevance({bm25, ageHours, importanceBoost})` —
  relevance leads, recency a multiplier clamped to `[0.5,1]` on a 7-day e-fold. Any match >2x
  stronger in bm25 wins at any age; recency only settles near-ties. Missing timestamp ⇒ no freshness
  bonus (was: crushed to ~0).
- **Derived importance** (commit `096ea32`): `content_hash` of canonical *organic* content (injected
  harness blocks stripped, true-by-construction) stored + indexed at write (schema v3, paged
  backfill); `find_relevant` counts distinct-session recurrence in one read-only query → capped
  (`<=25%`), log-saturated `importanceBoost`.

### Honest limitations (recorded, not hidden)

- Recurrence is **verbatim-organic only** — it catches the same authored content reappearing, not
  paraphrase (that is semantic/vectors, deliberately deferred).
- Authorship gating is **tag-based**, not full provenance: a message dominated by known injected
  blocks (`<system-reminder>` etc.) is excluded, but a true parse-time "human vs tool" flag across
  all adapters remains a follow-up. tool_results already fall out (they carry empty message text).
- Candidate-pool ceiling unchanged: importance re-ranks **within** the bm25 top-N pool
  (`max(limit*5,100)`); a match buried below the pool by bm25 still cannot surface. Documented; not
  addressed in Phase 1.
