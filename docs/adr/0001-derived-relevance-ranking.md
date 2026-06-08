# Relevance ranking: relevance-led, recency a weak prior, importance derived not recorded

Status: accepted · 2026-06-07

## Context

`find_relevant` ranks by `bm25 * 1/(1+ageHours)`. Measured on the live 2.6 GB store
(372k messages): for "adapter substrate" the candidate pool's median age is 26 days, yet the
two strongest keyword matches (11 and 35 days old) are knocked out of the top 12 and **every
top-12 result is age 0** — a today-hit with bm25 10.9 beats the single best match in the whole
store (bm25 14.2, 11 days old) by ~90×. The blend is really a recency sort with bm25 as a
same-day tiebreaker. It violates the tool's own acceptance criterion (issue 03: rank old-stronger
above new-weaker "when recency doesn't dominate"), which passed only because the unit test used
synthetic, same-age timestamps. MCP, CLI, and the in-progress server-free skill all share this
one function, so every agent on the "smart" path silently gets newest-not-best.

## Decision

1. **Relevance leads; recency is a gentle prior.** Rank by lexical (bm25) match first, with
   recency damping on a ~week scale (not a 1-hour half-life), so a clearly stronger older match
   beats a weak fresh one and recency only settles near-ties. `search_memory` remains the pure
   relevance escape hatch. The fixed `find_relevant` is the single documented default; the
   server-free skill must point agents at it.

2. **Relevance stays lexical; semantic/vector deferred.** Embeddings would catch paraphrase but
   tax lore's local-only, no-model taste (model dependency, vector index, re-embedding 372k rows).
   Revisit only if lexical + importance proves too blind.

3. **Importance is *derived*, not *recorded*.** A memory's query-independent worth (recurrence
   across sessions, human authorship, position) is computed from transcripts already on disk.
   We do **not** write a usage record at retrieval time. Rejected — write-on-read counters: they
   turn parallel reads into contended single-writer writes, create a rich-get-richer ranking
   bubble, log the user's own attention, and measure "opened" not "useful." Derivation gets the
   bulk of the value with none of those costs. Importance uses only signals true by construction
   (authorship, recurrence, explicit pin) — never prose-guessing heuristics, which would be a
   fake control.

4. **Usage-stamps, if ever added, serve pruning — not ranking.** The one thing derivation cannot
   provide is the *negative* signal: what is never retrieved. That is the honest basis for pruning
   ("never useful" ≠ "merely old"). Deferred; when built it must be best-effort/droppable and kept
   off the read path.

## Consequences

- The default retrieval surface for MCP, CLI, and the server-free skill must be the fixed
  relevance-led `find_relevant`.
- Auto-pruning stays out of scope until usage data exists; until then lore retains everything and
  **forget** is a separate, explicit, user-initiated action.
- Importance scoring adds at most a background recurrence tally — no new writes on the read path.
