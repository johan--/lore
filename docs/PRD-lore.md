# PRD — `lore`: full-fidelity, searchable agent memory

> Status: ready-for-agent · Created 2026-06-06 · Repo: `~/lore` (standalone, destined for its own GitHub repo)

## Problem Statement

When an AI coding agent works across many sessions, the verbatim history of those sessions is the most valuable memory it has — the exact decisions, the reasoning, the exchanges that led somewhere. But that history is effectively unsearchable in practice:

- **Compaction destroys context.** Mid-task, the agent's in-context history gets compressed to a short summary. The reasoning behind a decision becomes a one-liner, and the verbatim is gone from the working window — even though it still exists on disk.
- **A compiled wiki is the wrong tool.** A knowledge wiki stores *conclusions*, lossily and by design. It answers "what did we decide," not "show me the exact exchange from three weeks ago, with the tool calls and the reasoning intact."
- **The raw data is already on disk but inaccessible.** Claude Code writes every session to append-only JSONL transcripts (`~/.claude/projects/**/*.jsonl`) — gigabytes of perfect-fidelity history. There is no way for an agent to query it: no full-text search, no temporal filter, no "find the session where we discussed X," no way to pull the turns surrounding a hit.
- **Memory is siloed per tool.** Each agent/tool stores history in its own format. There is no shared, cross-agent, cross-project memory.

The user (Jordan) framed this as building the agent's *literal memory* — "not just a wiki but real full-fidelity memory" — a gift to the agent so it can recall its own past with full temporal, project, agent, and session context.

## Solution

`lore` is a standalone, well-typed memory system that indexes raw agent session transcripts into a searchable store and exposes retrieval over the Model Context Protocol (MCP), so any MCP-compatible agent can query its own past with full fidelity and provenance.

From the agent's perspective:

- **It never loses verbatim history.** Even after compaction, it can search the raw chunks of any session, in any project, at any time.
- **Every result is grounded.** Each hit carries complete provenance — session id, timestamp, project, git branch, agent/subagent, active skill, model — so the agent can cite exactly when and where something happened.
- **It can find the needle and read around it.** Keyword search returns hits; a companion call returns the surrounding turns, so a match is actually usable.
- **It can browse time.** "What was I working on the week of X" returns a session-level timeline, not message spam.
- **It works for any agent.** Because retrieval is over MCP and ingestion is pluggable via source adapters, the same memory serves Claude Code today and other agents (Codex, Cursor, …) as adapters are added.

The architecture separates a **universal retrieval core** (SQLite + FTS5 + search tools + MCP server) from **source-specific ingestion adapters**. The Claude Code adapter ships first; the core never knows where a message came from — it only sees normalized, Zod-validated records.

## User Stories

1. As a coding agent, I want to search my entire session history by keyword, so that I can recall what was discussed even after it left my context window.
2. As a coding agent, I want every search result to include its session id, timestamp, project, and git branch, so that I can cite exactly when and where something happened.
3. As a coding agent, I want to fetch the turns immediately before and after a search hit, so that a keyword match is actually readable in context.
4. As a coding agent, I want to filter a search to a specific project, so that I only see history relevant to the repo I'm working in.
5. As a coding agent, I want to search across all projects at once, so that I can find a decision I made in a different repo.
6. As a coding agent, I want to filter history by time window, so that I can answer "what did we decide about X recently?"
7. As a coding agent, I want results ranked by recency when I ask for "recent" things, so that the freshest relevant turn surfaces first.
8. As a coding agent, I want to filter by git branch, so that I can recall what happened on a specific feature branch.
9. As a coding agent, I want to filter by whether a message came from a subagent (sidechain), so that I can separate my own reasoning from delegated work.
10. As a coding agent, I want to filter by which agent produced a message, so that cross-agent memory stays attributable.
11. As a coding agent, I want to filter by which skill was active, so that I can find "every time I used the brainstorming skill."
12. As a coding agent, I want to filter by tool name, so that I can find "every time I ran a Bash migration" or "every time I edited this file."
13. As a coding agent, I want to filter by model, so that I can compare how different models handled similar work.
14. As a coding agent, I want to replay an entire session in order, paginated, so that I can reconstruct exactly how a piece of work unfolded.
15. As a coding agent, I want to list sessions by project and time, so that I can browse my history at the session level.
16. As a coding agent, I want a timeline rollup of sessions in a time range, so that I can see the shape of my work without reading every message.
17. As a coding agent, I want the full original JSONL line preserved for every message, so that no fidelity is ever lost to the indexing process.
18. As a coding agent, I want tool calls stored as first-class records (tool name, input, result, error flag, duration), so that I can search and analyze my tool usage.
19. As a coding agent, I want my current session indexed right before compaction fires, so that nothing is lost in the gap between "in context" and "compacted away."
20. As a coding agent, I want my session indexed when it ends, so that catch-up indexing happens without manual intervention.
21. As the user, I want a one-shot backfill command, so that my existing gigabytes of transcripts become searchable on first install.
22. As the user, I want incremental indexing that only parses the new tail of append-only files, so that re-indexing is fast and cheap.
23. As the user, I want the indexer to validate transcript lines at the boundary and skip unknown line types without crashing, so that the indexer is robust to format drift.
24. As the user, I want `lore` to run as a standalone MCP server with no dependency on any other service, so that my memory works even when other tooling is down.
25. As the user, I want `lore` usable by any MCP-compatible client, so that other agents (Cursor, Cline, Claude Desktop) can search the same memory.
26. As the user, I want ingestion behind a source-adapter interface, so that I can later add adapters for other agents and unify all my history in one store.
27. As the user, I want the whole system to be its own repo, so that I can publish it on GitHub and others can use it.
28. As the user, I want everything extremely well-typed (Zod at boundaries, no `any`), so that the memory store stays trustworthy and maintainable.
29. As a coding agent, I want to query semantically (phase 3), so that I can recall things I can't express as exact keywords.
30. As the user, I want `lore` to optionally feed notable sessions into a compiled knowledge wiki (phase 3), so that raw memory and compiled knowledge reinforce each other.
31. As a coding agent, I want subagent (sidechain) work attributed to the session that spawned it, so that I can trace what a delegated executor did within a larger task.
32. As a coding agent, I want every search/replay response to stay within a size budget, with large content elided behind an on-demand fetch, so that Lore never overflows my context or crashes the client.
33. As the user, I want messages that share a `uuid` across different transcript files to all be preserved, so that no real message is ever silently overwritten.
34. As the user, I want code identifiers, file paths, and snake_case terms to be findable by search, so that searching technical history actually works.
35. As the user, I want the memory database kept strictly local and never committed, with synthetic fixtures only, so that publishing the project never leaks secrets or PII from my transcripts.

## Implementation Decisions

### Architecture: universal core + pluggable adapters

- **`core`** — the universal retrieval layer. Owns the SQLite schema, FTS5 index, search/retrieval functions, and the MCP server. Knows nothing about transcript formats; operates only on normalized records.
- **`adapters/*`** — source-specific ingestion. Each adapter implements a small interface: `discover()` returns the set of source files (with stable ids), and `parse(rawLine)` returns zero or more validated `MessageRecord`s. The Claude Code adapter (`adapters/claude-code`) ships first and parses `~/.claude/projects/**/*.jsonl`.
- Rationale: the retrieval layer is genuinely general; only ingestion is source-specific. This split is what earns "memory for any agent" rather than just claiming it.

### Deep modules (testable in isolation)

1. **Parser / normalizer (per adapter).** Input: one raw JSONL line (untrusted). Output: zero or more `MessageRecord` + extracted `ToolCallRecord`s, or a typed "skip" for unknown/meta line types. Pure function, no I/O. Deep: complex transcript shapes in, one simple typed interface out. **High test priority.**
2. **Store.** Input: typed records. Owns schema creation, idempotent upsert (keyed by message `uuid`), session rollup derivation, and FTS sync. Interface is a handful of typed functions (`upsertMessages`, `upsertSession`, the query functions). Deep: hides all SQL behind typed calls. **High test priority** (especially idempotency and FTS sync).
3. **Search.** Input: typed query (text + optional dimension filters + time window + limit). Output: typed results with full provenance. Includes recency weighting for `find_relevant`. Pure over the store. Deep: one query type covers many retrieval shapes. **High test priority** (filters, recency ranking, provenance completeness).
4. **Indexer (orchestrator).** Ties adapter → parser → store. Owns the **watermark** logic: per source file, track last-indexed byte offset (+ mtime + hash) and only parse the new tail. Idempotent and incremental. **Medium test priority** (watermark resume, append-only tail handling).
5. **MCP server.** Thin adapter that exposes the search functions as MCP tools with typed input schemas. Deep only in the sense of being a stable boundary; logic lives in `search`. **Low test priority** (smoke/contract test).

### Data model (SQLite)

> **Critical correction (post-critique, verified against the real corpus):** `uuid` is **not** globally unique — across a 150-file sample, 4827 of 4828 repeated uuids carried *different* content, because sibling subagent transcripts reuse uuids. And a file is **not** a session — 86% of transcript files (2030/2368) live under `…/<sessionId>/subagents/agent-<hash>.jsonl`, where one logical `sessionId` fans out across the parent transcript plus every subagent file. The model below reflects this reality. Keying messages on `uuid` alone, or treating one file as one session, would silently destroy the fidelity this project exists to protect.

Three distinct identities, kept separate:

- **`source_file_id`** — the physical transcript file (the watermark/ingestion unit).
- **`session_id`** — the logical session, read from the line payload, shared across the parent file and its subagent files.
- **`subagent` dimension** — which subagent file a message came from, linked back to the spawning session.

Tables (the full original line is preserved per message for zero-loss fidelity, with the size policy in the next section):

- **`source_files`** — one row per physical file: `source_file_id` (PK, = absolute path or stable hash of it), `source` (adapter id), `session_id`, `kind` (`primary` | `subagent`), `agent_file` (the `agent-<hash>` basename when subagent), `byte_offset`, `line_count`, `prefix_sha256`, `mtime`, `indexed_at` (the watermark lives here).
- **`sessions`** — one row per *logical* session: `session_id` (PK), `source`, `project_path`, `project_slug`, `git_branch`, `started_at`, `ended_at`, `message_count`, `model`, `cc_version`, `first_user_prompt`, `title`/`slug`. Rollup is derived across all files sharing the `session_id`.
- **`messages`** — one row per substantive line. PK is a **synthetic `message_id` = hash(`source_file_id` + `uuid` + `seq`)**; `uuid` and `parent_uuid` are plain columns (not unique). Columns: `message_id` (PK), `source_file_id` (FK), `session_id` (FK), `uuid`, `parent_uuid`, `seq`, `timestamp`, `role`, `type`, `is_sidechain`, `agent_name`, `skill`, `model`, `git_branch`, `cwd`, `text` (flattened searchable text, size-capped), `raw_json` (full original line; see size policy), `raw_truncated` (bool), `source`.
- **`tool_calls`** — one row per `tool_use`/`tool_result` pairing, keyed within file scope: `tool_use_id`, `source_file_id`, `message_id`, `tool_name`, `input_json`, `result_text` (size-capped), `is_error`, `duration_ms`. Pairing is resolved within `(source_file_id, session_id)` scope, not globally.
- **`messages_fts`** — FTS5 virtual table over `messages.text`, kept in sync by **AFTER INSERT/UPDATE/DELETE triggers** (not manual upsert — contentless FTS5 drifts without triggers; this is the prior-art lesson from `storage.ts`).
- **`embeddings`** *(phase 3)* — `message_id`, `vector`, `model`.

Idempotency keys on `message_id` (the composite hash), so re-indexing never duplicates and never overwrites a distinct message. Resume-replay duplicates across different files are *kept* (they are themselves faithful history); de-duplicating identical text is a retrieval-layer nicety, deferred.

### Chunk granularity

- Store at **message level** (nothing coalesced away — full fidelity).
- Make the **retrieval unit a turn** (a user prompt plus the assistant's full response, including its tool calls). The agent can drill to a single message or pull the whole exchange.
- **Turn assembly is scoped, not a naive tree-walk.** `parent_uuid` references can dangle, point across files (resume/fork), be broken by meta/`progress` lines, or have multiple roots; subagent files are their own trees. So assemble turns **within `(source_file_id, session_id)` scope only**, fall back to `seq` ordering when `parent_uuid` is null or dangling, and treat each subagent file as its own turn-stream **linked to its spawning session by reference**, not merged into the parent tree.

### Retrieval surface (MCP tools)

Every result carries full provenance (`session_id`, `timestamp`, `project`, `branch`, `agent`, `skill`, `model`, plus `message_id` and `source_file_id` so any hit is precisely addressable).

- `search_memory(query, { project?, branch?, agent?, skill?, tool?, role?, model?, since?, until?, limit? })` — FTS keyword search with every dimension as an optional filter, ranked by `bm25()`. Primary tool.
- `find_relevant(query, { since?, until?, limit? })` — **blended `bm25() * recency`** ranking (recency = `1 / (1 + age_hours)`). Note: the Daemion prior art ranks `find_relevant` by recency *only*, which surfaces fresh-but-irrelevant turns — `lore` fixes this by keeping the relevance term.
- `get_context(message_id, { before?, after? })` — return the N turns surrounding a hit, **scoped to the same `(source_file_id, session_id)`** (context never silently crosses a file/session boundary). The tool that makes verbatim recall usable.
- `get_session(session_id, { from?, limit? })` — paginated replay of a whole session in order, **always size-budgeted** (see below).
- `get_message(message_id, { full? })` — fetch one message; `full: true` returns the un-elided `raw_json`. This is the on-demand escape hatch so large content is never forced into a default response.
- `list_sessions({ project?, since?, until?, limit? })` — session-level browse.
- `timeline({ project?, since, until })` — session-level rollup for "show me my history."

**Response size budgets are mandatory on every tool** (real lines reach ~2.9 MB / ~738K tokens; single tool_results reach ~50K tokens — unbounded responses OOM the caller or overflow context):

- `text` and tool_result content are stored size-capped; oversized blocks are elided with a marker: `…[N chars elided — fetch full via get_message(message_id, full=true)]`.
- Every tool enforces a per-response char budget and a max result/block count; pagination (cursor) is the way to read more, never a giant single payload.
- `image` blocks are stored as references/metadata, not inlined into responses.

### Freshness

JSONL files are normally append-only, so indexing is incremental — but the watermark must be **resume-safe**, not a bare byte offset. A resumed session can produce a *new* file replaying old uuids, and a file could in principle be rewritten rather than appended; seeking to a stale byte offset would then read mid-JSON garbage.

- **Watermark = `(byte_offset, line_count, prefix_sha256)`** stored per `source_file` (hash of the first N bytes).
- On re-index: if the prefix hash matches, seek to `byte_offset` and parse only the appended tail. **If the prefix hash mismatches, re-index the whole file** (cheap insurance) — never trust the offset after a prefix change.
- New files (new `source_file_id`) are always indexed from the start; their replayed uuids are kept as distinct rows under the composite key.

Triggers:

- **`PreCompact` hook** — index the current session immediately before compaction. Closes the amnesia gap.
- **`SessionEnd` / `Stop` hook** — catch-up index.
- **`reindex` command** — manual full/backfill pass (first run ingests the existing corpus).

### Source adapter interface (Claude Code first)

**File discovery uses the real nested layout.** Transcripts live at `~/.claude/projects/<encoded-project>/<sessionId>.jsonl` (primary, ~14% of files) and `~/.claude/projects/<encoded-project>/<sessionId>/subagents/agent-<hash>.jsonl` (subagent, ~86%). `discover()` walks both, tags each file `primary` vs `subagent`, and records the owning `session_id` (from the path and confirmed in the payload). The `**/*.jsonl` glob is fine; the *model* must understand the hierarchy.

**Streaming parse, not slurp.** Lines reach ~2.9 MB; the parser reads line-by-line (streaming) and JSON-parses one line at a time so a multi-MB line never blows up memory. A max-line guard skips/truncates pathological lines with a logged warning rather than crashing.

**Explicit per-`type` handling — no silent blanket skip.** Grounded in the real corpus, `type` values include `user`, `assistant`, `system`, and meta types `progress` (very common — 2nd most frequent in sampling), `attachment` (common), `file-history-snapshot`, `ai-title`, `agent-name`, `permission-mode`, `last-prompt`, `queue-operation`. The adapter decides **per type** whether to index, partially index, or skip — `progress`/`attachment` are explicitly classified (they can carry streamed tool output), not dropped by accident. Unknown/new types are skipped **and counted via a metric** so format drift is visible, never silent.

Other available per-line fields the adapter maps: `uuid`, `parentUuid`, `timestamp`, `cwd`, `gitBranch`, `version`, `isSidechain`, `agentName`, `attributionSkill`, `message` (with `role`, `model`, content blocks `thinking | text | tool_use | tool_result | image`), `stopReason`, `durationMs`, `requestId`, `slug`. These become `MessageRecord` / `ToolCallRecord`.

### Type safety

- **Zod validates each raw line at the boundary** (external/untrusted input with 40+ possible keys and many `type` variants). Parse, don't trust. Unknown line types are logged, counted, and skipped — never crash the indexer.
- Typed domain models (`SourceFileRecord`, `SessionRecord`, `MessageRecord`, `ToolCallRecord`), typed tool inputs/outputs.
- House rules: no `any`, named exports, Zod for schemas, structured logging, files focused/small, colocated tests.

### FTS5 & storage engineering

- **Tokenizer is chosen deliberately for code-heavy text.** Default `unicode61` mangles `getUserById`, `foo.bar.ts`, `snake_case`, and file paths. Use `unicode61` with `tokenchars '_-.'` (or a `trigram` tokenizer for substring/code search) — decided during the store build, with a fixture test proving code identifiers and paths are retrievable.
- **FTS query sanitization is required.** Raw user/agent queries contain `-`, `+`, `:`, quotes — FTS5 special syntax that throws or mis-parses. Port the `sanitizeFtsQuery` lesson from the prior art (`storage.ts`) so queries like `tool_use` or `file-path` don't error.
- **Ranking:** `search_memory` orders by `bm25()`; `find_relevant` blends `bm25() * recency`.
- **Contentless FTS5 sync via triggers** (AFTER INSERT/UPDATE/DELETE), since manual sync drifts and updates require deleting the *old* content first.
- **Concurrency:** `PRAGMA journal_mode=WAL` + `busy_timeout`, single-writer discipline (the indexer is the only writer; the MCP server reads). The PreCompact hook can write while the server reads without corruption.
- **Backfill over 3.1 GB / ~2,368 files is engineered, not naive:** stream files line-by-line, batch inserts inside transactions (~1k lines/txn), emit progress, and make the backfill resumable via the watermark so an interrupted first run continues instead of restarting.

### Privacy & security

Transcripts contain secrets, `.env` dumps, tokens, and PII (gateway tokens, Tailscale URLs, etc. all appear verbatim). Since the *code* is destined to be public and other clients may read the store:

- **The database is local-only, never committed.** `*.db`/`data/` are git-ignored from day one. Publishing the repo never publishes a corpus.
- **Fixtures are synthetic or scrubbed** — never real transcript excerpts in the repo/tests.
- **Redaction is on by default** (resolved — see `docs/adr/0001-redaction-on-by-default.md`): a conservative credential scrubber runs over `text` and tool payloads *before* anything is written, since those are what an agent — or a compromised MCP client — sees. `--no-redact` on `lore index` / `lore hook` / `lore setup` opts out for users who want everything verbatim.
- **Removing memory is first-class and CLI-only** (see `docs/PRD-memory-control.md` and `docs/adr/0002-destructive-ops-require-explicit-confirm.md`): `lore forget` deletes a session or project point-in-time; `lore exclude` deletes a project and bars all future captures. Both preview the exact scope and act only with `--confirm`, and both write a tombstone so re-indexing or `push` cannot resurrect the data. These verbs are deliberately absent from the MCP tool surface — a compromised client must not be able to wipe memory.

### Distribution

- Standalone repo `~/lore`, no runtime dependency on any external service; destined for its own public GitHub repo.
- Runs as an MCP server (stdio first; HTTP optional later) usable by any MCP-compatible client.
- Indexes `~/.claude/projects/` globally; agents working in any project can search any project's history.

## Testing Decisions

**What makes a good test here:** assert *external behavior*, not internals. For the parser: given a real (fixture) JSONL line, assert the normalized records that come out — not the parsing steps. For the store: insert records and assert what queries return (including idempotency: re-inserting the same line doesn't duplicate; and — the regression test that pins the BLOCKER-1 fix — **two different messages that share a `uuid` across two source files both survive** rather than overwriting each other). For search: build a small fixture corpus and assert that filters, time windows, blended ranking, and provenance fields behave — not how the SQL is shaped.

**Modules to be tested (high priority):**
- **Parser/normalizer** — fixture lines covering each substantive `type` and each content-block type; meta types (`progress`, `attachment`, etc.) classified per the explicit policy (not silently dropped); malformed lines (must not crash); multi-MB line (must stream/truncate, not OOM); sidechain/agent/skill attribution.
- **Store** — schema init; idempotent upsert keyed on synthetic `message_id`; **uuid-collision-across-files preserves both rows**; session rollup derived across multiple files sharing one `session_id`; trigger-driven FTS sync (insert/update/delete); code-identifier/path retrievability under the chosen tokenizer; FTS query sanitization (`tool_use`, `file-path` don't throw).
- **Search** — each dimension filter, combined filters, time windows, blended `bm25*recency` ranking, provenance completeness on every result, and **response size budgets** (oversized content is elided with the `get_message` affordance, never returned raw).

**Medium priority:**
- **Indexer** — watermark resume (only the appended tail is parsed on re-run); **prefix-hash-mismatch forces full re-index**; subagent-file discovery under the nested layout; full backfill over a fixture directory tree.

**Low priority:**
- **MCP server** — contract/smoke test that each tool is registered with the right input schema and dispatches to the correct search function.

**Prior art:** Daemion's `src/core/history-tools.ts` (the five RLM-style history tools and the recency-weighting formula) and its FTS5-backed `storage.ts` are the design template, and their colocated `*.test.ts` files (e.g. `history-tools.test.ts`) are the testing-style reference. `lore` reimplements these cleanly and decoupled, with no gateway dependency.

## Out of Scope

- **Embeddings / semantic search** — phase 3. v1 is FTS5 + provenance + `get_context`.
- **Non–Claude-Code adapters** (Codex, Cursor, …) — the adapter interface is built now, but only the Claude Code adapter ships in v1.
- **Wiki digest integration** — auto-writing notable sessions into a compiled knowledge wiki is phase 3.
- **A UI** — `lore` is an MCP server + CLI; no graphical interface.
- **Editing or mutating transcripts** — `lore` is read-only over source files; it never modifies `~/.claude/projects/`.
- **HTTP/remote transport and multi-machine sync** — stdio MCP only in v1.
- **Auth / multi-user** — single-user, local-first.

## Further Notes

- The emotional core of the project (the user's framing: "a treat from me to you") is three capabilities: **verbatim recall**, **provenance on every hit**, and **fetch-the-surrounding-context**. If a scope cut is ever needed, protect those three first.
- The append-only nature of JSONL is what makes incremental indexing cheap and the `PreCompact` hook reliable — lean on it.
- Keeping `raw_json` on every message row means future schema additions (new columns, new derived fields) can be backfilled from the store itself without re-reading source files.
- The two memory systems are complementary by design: `lore` = raw, verbatim, lossless; a knowledge wiki = compiled, lossy, conclusions. Phase 3's digest is the bridge between them.

## Critique Adjudication Log (2026-06-06)

An adversarial critic was run against the first draft and its blocker claims were independently verified against the real corpus. All 11 findings were **accepted** and folded in above. Summary for auditability:

| # | Severity | Finding | Verification | Resolution |
|---|---|---|---|---|
| 1 | BLOCKER | `uuid` not unique (subagent files reuse uuids) | 4827/4828 repeated uuids had *different* content (150-file sample) | Synthetic `message_id = hash(source_file_id+uuid+seq)` PK; `uuid` is a plain column |
| 2 | BLOCKER | Files ≠ sessions; nested `…/<sessionId>/subagents/agent-*.jsonl` layout | 2030/2368 files (86%) under `*/subagents/*` | Three IDs (`source_file_id`, `session_id`, subagent dim) + `source_files` table |
| 3 | BLOCKER | Multi-MB lines / huge tool_results = context bomb | max line 2.95 MB (~738K tokens) | Size budgets on all tools, elision + `get_message(full)`, streaming parse, `raw_json` never returned by default |
| 4 | MAJOR | `type` enum incomplete (`progress`, `attachment`) | `progress` 2nd most common type in sample | Explicit per-type handling + skipped-type metric |
| 5 | MAJOR | Turn assembly via `parent_uuid` unreliable | dangling/cross-file/multi-root chains observed | Assemble within `(source_file_id, session_id)`, fall back to `seq`, subagents linked by reference |
| 6 | MAJOR | Byte-offset watermark unsafe on resume/rewrite | — (design risk) | Watermark = `(offset, line_count, prefix_sha256)`; mismatch → full re-index |
| 7 | MAJOR | Secrets/PII vs public repo + shared DB | tokens/PII present in real transcripts | Privacy & security section: DB local-only/gitignored, synthetic fixtures, redaction decision |
| 8 | MAJOR | FTS tokenizer for code; `find_relevant` lacked relevance term | prior art ranks recency-only (`history-tools.ts`) | Deliberate tokenizer + `sanitizeFtsQuery` + `bm25`, blended `bm25*recency` |
| 9 | MINOR | Contentless FTS sync needs triggers | prior art uses triggers (`storage.ts`) | Trigger-driven FTS sync |
| 10 | MINOR | Concurrent indexer-write / server-read | — (design gap) | WAL + busy_timeout + single-writer |
| 11 | MINOR | 3.1 GB backfill unestimated | corpus is 3.1 GB / ~2,368 files | Streamed, batched-in-txn, progress, resumable backfill |

No findings were rejected — the critic was grounded and correct on every point.
