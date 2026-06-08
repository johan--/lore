# PRD — `lore`: server-free retrieval (CLI search), session scoping, and scale

> Status: ready-for-agent · Created 2026-06-07 · Survived critic pass 2026-06-07 · Repo: `~/lore`

## Problem Statement

Lore's promise is that any agent, in any session, can pull memory back out anytime. Today there is exactly one way to read that memory: the MCP server. An agent must have the `lore` MCP server registered in its client, running, and reloaded into the current session before a single `search_memory` call can be made. When any of those three things is not true — a fresh shell, a CI job, a cron-driven agent, a teammate who never reloaded, a harness that doesn't speak MCP at all — the memory is fully indexed, sitting on disk, and completely unreachable.

This was verified against the code, not assumed: the `lore` CLI can pull sessions in (`index`, `setup`, `hook`), inspect a file's format (`sample`), and start the server (`serve`) — but it has no way to *search*. The search engine (`searchMemory`) exists and works well; the only caller is the MCP server. So "anytime" is a promise the product cannot currently keep from a plain terminal.

Three further gaps make retrieval weaker than it should be even when the server *is* up:

- **No way to narrow to a session.** Search can filter by project, source, agent, skill, tool, role, model, and date range — but not by session. "Show me just my last session in this repo" is the single most common thing an agent wants to ask, and the search surface cannot express it.
- **Scoping can drift across frontends.** The CLI (once it can search) and the MCP server must apply the same filters in the same way. If each parses filters independently, they fall out of sync the first time someone adds a flag to one and not the other.
- **Retrieval is not tuned for the size it is already at.** The store is multi-gigabyte today and headed for tens of gigabytes. The database opens without the memory-mapping and cache settings that keep a large SQLite fast, and two of the most common narrowing columns (`project` and `source`) have no index, so those filtered searches scan more than they should and degrade as the store grows.

## Solution

Give the search engine a second front door that does not depend on the server, make that door able to ask narrowly, keep it fast at scale, and teach agents to use it.

**A server-free search command.** Add `lore search "<query>"` to the CLI. It opens the store read-only and calls the same `searchMemory` the MCP server uses, with the server completely out of the picture. Output is readable in a terminal by a human and parseable by an agent (a `--json` mode emits the same hit shape the MCP tool returns). This is the load-bearing change: it removes the MCP dependency from the read path entirely.

**Session scoping, applied identically everywhere.** Add a `session` filter to the search options so any caller can scope to one logical session. Because the CLI and the MCP server must never diverge, the filter set is defined once as a single typed options shape and consumed by both; the CLI's flag parsing produces that same shape rather than a parallel one.

**Scale tuning on the real store.** Set the SQLite memory-map and cache pragmas when the store opens, add indexes on the two unindexed narrowing columns (`project` on messages, `source` on source files), and run the FTS5 `optimize` maintenance step so keyword search stays fast as the corpus grows. Each change is proven on the real on-machine store with before/after timing or an `EXPLAIN QUERY PLAN`, not asserted.

**A skill that teaches the search path.** Update the onboarding skill (as a whole bundle, via skill-creator) so an agent learns it can search from the terminal without the server — otherwise the new door is built and never opened.

From the user's perspective: memory is reachable from any shell whether or not the server is running, an agent can ask for exactly the session it means instead of a flood, search stays fast as the store grows into tens of gigabytes, and every agent that reads the skill knows the server-free path exists.

## User Stories

1. As a coding agent in a fresh shell, I want to search Lore from the command line, so that I can recall past work without the MCP server running.
2. As a coding agent in a harness that does not speak MCP, I want a command-line search, so that my tool can still read the shared memory.
3. As the user, I want `lore search "<query>"` to return ranked hits in the terminal, so that I can find a past decision without opening an MCP client.
4. As a coding agent, I want a `--json` output mode for `lore search`, so that I can parse the hits programmatically with the same shape the MCP tool returns.
5. As the user, I want the CLI search to open the store read-only, so that searching can never modify or corrupt my memory.
6. As the user, I want CLI search results to carry full provenance (source, session, project, role, timestamp), so that I know where each memory came from and can cite it.
7. As a coding agent, I want CLI search to honor every filter the MCP search honors (project, branch, source, agent, skill, tool, role, model, since, until, limit), so that I lose no precision by using the terminal instead of MCP.
8. As a coding agent, I want to scope a search to a single session, so that I can pull just the turns from one conversation instead of everything matching.
9. As the user, I want "my last session in this repo" to be expressible as a search, so that I can resume work without wading through unrelated hits.
10. As a maintainer, I want the CLI and the MCP server to share one filter definition, so that the two retrieval frontends can never drift apart.
11. As a coding agent, I want the session filter available through both the CLI and MCP identically, so that the same query means the same thing in either frontend.
12. As the user, I want CLI search to respect the same default and explicit result limit as MCP, so that one giant query can never flood my terminal or an agent's context.
13. As the user, I want long messages elided in CLI output with a pointer to fetch the full text, so that a single huge transcript line cannot blow up the terminal or the context window.
14. As the user, I want `lore search` to print a clear, friendly message when there are no hits, so that an empty result is obviously "nothing matched" and not a failure.
15. As the user, I want `lore search` to fail cleanly with a helpful message when given no query, so that the mistake is obvious.
16. As the user, I want `lore search` to fail cleanly and exit non-zero when the store does not exist or has not been initialized, telling me to run `lore setup` or `lore index` first, so that a missing or stale store reads as a clear instruction, not a raw database error.
17. As a coding agent in a fresh shell with no server, I want a command-line way to list recent sessions (with project and timestamps), so that I can discover the session id I need before scoping a search to it.
18. As the user, I want "my last session in this repo" to be answerable end to end from the terminal — list sessions, then scope a search to one — so that the server-free path is actually complete, not just a keyword box.
19. As the user, I want search to stay fast when my store is tens of gigabytes, so that recall never stalls as my history grows.
20. As the user, I want the store to use sensible memory-map and cache settings, so that large reads are served from memory rather than re-read from disk.
21. As the user, I want the FTS5 index maintained (optimized) as part of indexing, so that keyword search quality and speed hold up as the corpus grows without slowing down each search.
22. As the user, I want common session-rollup and timeline filters (by project and source) backed by indexes where measurement shows it helps, so that browsing my history by project or harness stays fast as the store grows.
23. As the user, I want each performance change proven with real before/after measurement (timing and query plan) on my actual store, and any index that the query planner does not actually use left out, so that "faster" is demonstrated and I carry no dead indexes that only slow writes.
24. As a coding agent reading the onboarding skill, I want to learn that I can search from the terminal without the server, so that I actually use the server-free path.
25. As a contributor, I want the skill to show how to scope and filter a CLI search, so that I can teach an agent precise recall, not just keyword grep.
26. As the user, I want the existing MCP search behavior to keep working unchanged after the session filter is added, so that the upgrade costs nothing to current MCP users.
27. As the user, I want the CLI search command covered by tests that prove a real query returns the expected hit, so that the server-free path is verified behavior, not a claim.

## Implementation Decisions

**One typed search-options shape, consumed by both frontends (deep module boundary).**
The set of search filters is defined once as the existing search-options type, and that *type* is the single contract both the CLI and the MCP server speak. To be precise (the critic flagged the original wording as over-claiming): there is no single runtime parser shared between them, and there should not be — the MCP server receives already-structured, Zod-validated named arguments, while the CLI must parse `argv` strings (`--limit` into a number, dates into strings) itself. So both *construct* the same `SearchOptions` type by different means; the shared type is what prevents field drift at compile time. The MCP tool additionally declares the field list a second time as its Zod input schema; deriving that schema and the type from one source to keep them in lockstep is a reasonable future tidy-up but is not required by this work.

**Add a `session` filter to search.**
Extend the search options with an optional `session` field and add the corresponding equality clause to the search query's WHERE builder (the message row already carries `session_id`). All existing filters keep working unchanged; this is purely additive. The MCP search tool and the CLI both expose it. From a prototype of the option shape:

```ts
interface SearchOptions {
  // ...existing: project, branch, source, agent, skill, tool, role, model, since, until, limit
  /** Logical session id; scopes results to one conversation. */
  session?: string;
}
```

**A dedicated read-only store open path (correctness, required by the critic pass).**
The existing `openStore` is a write path: it unconditionally runs `initSchema` (CREATE TABLE/TRIGGER/VIRTUAL TABLE) and `runMigrations` (ALTER TABLE in a write transaction) on every open. A handle opened read-only throws the moment that DDL runs, so `lore search` cannot reuse `openStore`. Add a separate `openStoreReadonly(path)` helper that opens with `{ readonly: true, fileMustExist: true }` and skips schema/migrations — exactly the pattern the Cursor, Hermes, and sampler code already use to read SQLite safely. Read-only consumers do not migrate. The consequence is explicit: against a missing or stale (pre-migration) store, the read-only path cannot self-heal, so the command must detect that and fail with guidance (see the next decision). This was the critic's BLOCKER finding.

**`lore search` command (server-free read path).**
A new CLI subcommand opens the store via `openStoreReadonly` and calls `searchMemory` directly. It accepts a positional query plus flags mapping one-to-one onto the shared options (`--session`, `--project`, `--source`, `--agent`, `--skill`, `--tool`, `--role`, `--model`, `--since`, `--until`, `--limit`). Default human output is a compact ranked list carrying provenance; `--json` emits the same envelope the MCP tool returns — `{ count, hits }`, with hit `text` run through the same elision step the MCP path uses (raw `searchMemory` returns un-elided text, so the command must apply elision itself for parity and to bound output). Searching never writes. When the store is absent, or a required object like the FTS table is missing (stale schema), the command exits non-zero with a friendly message pointing at `lore setup` / `lore index` rather than surfacing a raw SQLite error.

**`lore sessions` command (makes "my last session" answerable server-free).**
`--session <id>` needs an id, and today the only id-discovery tool (`list_sessions`) is MCP-only — so from a fresh shell with no server an agent cannot find "my last session" to scope to. Add a small `lore sessions [--project] [--source] [--limit]` command that wraps the existing `listSessions` over the read-only open, printing session id, project, and first/last activity. This closes the gap the critic found: without it, the "my last session in this repo" story is promised but unbuildable server-free. It ships in the same slice as `lore search`.

**A pure results renderer (deep module, the main unit-test target).**
Formatting hits into terminal text is a separate pure function from the command dispatch: given a list of (already-elided) hits and whether JSON was requested, it returns the string to print — the `{ count, hits }` envelope in JSON mode, a compact provenance-carrying list otherwise. Keeping it pure means it is testable without a database or a process, mirroring how `renderSample` was split from the `sample` command.

**Scale tuning at the store boundary (every change measurement-gated).**
When the store opens, set `mmap_size` and `cache_size` pragmas alongside the existing WAL/busy-timeout settings — these help large reads regardless of query shape and apply to both the read-only and write open paths.

The two candidate indexes (`project` on messages, `source` on source files) come with a sharp caveat the critic surfaced: the keyword *search* query is driven by the FTS5 `MATCH`, which resolves matched rowids first and then applies `project`/`source` as residual filters on an already-small joined set — so the planner most likely will *not* use a `project` index for search. The honest rationale for these indexes is the other access paths (session rollups via `list_sessions`, the `timeline` buckets, and the `source_files` join) that filter or group by project/source over the full table. Therefore each index ships only if `EXPLAIN QUERY PLAN` on the real store shows the planner actually using it for some query; an index the planner ignores is not added, because it only taxes writes. "Add these two indexes" is a hypothesis to be proven per index, not a commitment.

FTS5 `optimize` is a write, so it cannot live on the read-only search path. It runs at the tail of the write paths (indexing / setup), never per search — re-optimizing on every read would be a regression. This pins down the placement the draft had left open.

**Skill update (whole bundle, via skill-creator).**
The onboarding skill is extended to teach the server-free `lore search` path, including session scoping and filters, treated as the whole folder per the project rule that a skill is its entire bundle. The change goes through the skill-creator workflow.

## Testing Decisions

Built test-first (TDD), in vertical slices: one failing test for one behavior, then the minimal code to pass it, then the next — never all tests up front. A good test here asserts external behavior through the public interface: a real (fixture) store, a real query, the expected hit (or empty result) with correct provenance. Tests must not assert internal SQL or parsing structure; they assert that a message that exists becomes a findable, correctly-attributed hit, so they survive refactors of the query internals.

Modules and behaviors to be tested:
- **The session filter** (in `searchMemory`): a query scoped to one session returns only that session's matching messages, and the same query without the filter returns more. Prior art: the existing `search-memory.test.ts` filter cases (project, source, tool) are the exact pattern to follow.
- **The pure results renderer**: given a fixed list of hits, it produces the expected human text (with provenance and elision) and, in JSON mode, the expected serialized shape. Pure-function tests, no database — prior art: `sample-format.test.ts` `renderSample` cases.
- **The `lore search` command end to end**: against a temp store seeded with known records (opened read-only), the command returns the expected hit for a known word, honors a filter, returns a clean empty result for a non-match, and exits non-zero with guidance when the store is missing or its FTS table is absent — proving the server-free path works without MCP and fails gracefully. Prior art: the existing `lore.test.ts` CLI command tests.
- **The `lore sessions` command**: against a seeded store, it lists the seeded sessions with project and activity, and honors `--project` / `--limit`. This is what makes the "my last session" path real, so it is tested, not assumed.

Performance changes (pragmas, indexes, `optimize`) are proven by measurement on the real store (before/after timing, `EXPLAIN QUERY PLAN` showing index use), not by unit tests — these are characteristics, not behaviors, and asserting a millisecond threshold in CI would be flaky. The skill is proven by a cold agent searching via the CLI without the server and succeeding.

Regression proof: the existing `search-memory.test.ts`, `find-relevant.test.ts`, and MCP server tests must continue to pass unchanged, which is how "existing MCP search keeps working" is verified.

## Out of Scope

- **`find_relevant` candidate-pool widening.** Deferred until a real query is measured to be starved by the current pool. Optimizing an unmeasured number violates the no-premature-optimization rule; revisit only with evidence.
- **A `lore find` (recency-blended) CLI command.** Not built until `lore search` is shown insufficient in practice. Shipping two retrieval verbs before one earns its keep is scope creep.
- **Semantic / embedding search.** Unchanged from today; not part of this work.
- **Any daemon or long-running CLI process.** The whole point is fewer moving parts; CLI search is a one-shot read-only open.
- **New adapters or ingestion changes.** This PRD is read-path only; ingestion is untouched.
- **Output paging / interactive TUI.** The CLI prints a bounded, limited result set; an interactive browser is not in scope.

## Further Notes

Sequencing — three implementation issues (the session filter is too small to be its own issue, per the critic and the DAG-sizing rule, so it rides inside the CLI slice):

1. **Retrieval surface (server-free read path).** The `session` filter added to `SearchOptions` and the search WHERE builder; `openStoreReadonly`; the `lore search` command (with elision + `{ count, hits }` JSON parity); the `lore sessions` discovery command; and the pure renderer. One coherent slice — this is the load-bearing change and everything in it is the read path.
2. **Scale tuning.** `mmap_size`/`cache_size` pragmas; the `project`/`source` indexes *gated per index by `EXPLAIN QUERY PLAN`* on the real store; FTS5 `optimize` on the write path only. Independent of slice 1; proven by measurement, not unit tests.
3. **Skill update.** Teach the server-free `lore search` + `lore sessions` path through skill-creator, whole bundle.

This PRD has survived one adversarial critic pass (2026-06-07). Findings folded in: the read-only-vs-`openStore`-always-migrates BLOCKER (added `openStoreReadonly` + missing/stale-store handling); the over-claimed index win (indexes are now per-index EQP-gated and justified by session-rollup/timeline access, not by FTS-driven search); `optimize` pinned to the write path; "shared type, not shared parser" reworded honestly; elision + `{ count, hits }` envelope parity made explicit; and the US-9 gap closed by adding `lore sessions` so "my last session" is actually answerable server-free. The `find_relevant` pool-widening deferral was checked and upheld (the pool is already `max(limit*5, 100)`, not obviously starved).

Next steps: break this into the three implementation issues above (tracer-bullet slices), build each test-first, then execute end to end. Trust order once issues exist: merged code over PR over issues over this document.
