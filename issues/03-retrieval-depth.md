# Issue 3 — Retrieval depth: context windows, sessions, timeline, blended ranking

Type: AFK · Blocked by: Issue 1 (walking skeleton) · Plan: docs/PRD-recall.md

## What to build

Slice 1 gives a single ranked keyword lookup. This slice builds out the rest of the retrieval surface an agent actually needs to reconstruct what happened — moving from "find a hit" to "read around the hit, read the whole session, see the shape of activity over time." All of it respects the same response-size budgets and elision contract from Slice 1.

Scope (each exposed as both a library function and an MCP tool):
- **`get_context(message_id, {before?, after?})`** — return the N messages before/after a hit, scoped strictly to the same `(source_file_id, session_id)` so context never bleeds across files or sessions. Thread order uses `seq` (and `uuid`/`parent_uuid` where useful).
- **`get_session(session_id, {cursor?, limit?})`** — paginated, budgeted walk of a full logical session (parent + its subagent files folded into one timeline). Returns a cursor for continuation; never dumps an unbounded session into one response.
- **`list_sessions({project?, since?, until?, limit?})`** — enumerate sessions with rollup metadata (timespan, message count, project/branch, models) for navigation.
- **`timeline({project?, since?, until?, bucket?})`** — activity over time, bucketed (e.g. by day), so an agent can orient before drilling in.
- **`find_relevant(query, {...filters, limit?})`** — blended ranking `bm25() * recency`, recency decaying with age (prior art: Daemion's `1/(1+age_hours)` shape). Distinct from `search_memory`'s pure bm25 so callers can choose "best match" vs "best recent match."

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] `get_context` returns the correct neighbor window and never crosses `(source_file_id, session_id)` boundaries.
- [ ] `get_session` paginates with a working cursor and stays within the response budget on a large fixture session.
- [ ] A logical session that spans a parent file + a subagent file is returned as one ordered timeline by `get_session`.
- [ ] `list_sessions` returns accurate rollups and honors filters.
- [ ] `timeline` buckets activity correctly and honors filters.
- [ ] `find_relevant` ranks a recent-but-weaker textual match above an older-but-stronger one when recency dominates, and the reverse when it doesn't (behavior test on synthetic timestamps).
- [ ] All new tools are callable over the MCP stdio contract and respect budgets/elision.

## Verification

`npm run check`
