# PRD — `recall`: full-fidelity, searchable agent memory

> Status: ready-for-agent · Created 2026-06-06 · Repo: `~/recall` (standalone, destined for its own GitHub repo)

## Problem Statement

When an AI coding agent works across many sessions, the verbatim history of those sessions is the most valuable memory it has — the exact decisions, the reasoning, the exchanges that led somewhere. But that history is effectively unsearchable in practice:

- **Compaction destroys context.** Mid-task, the agent's in-context history gets compressed to a short summary. The reasoning behind a decision becomes a one-liner, and the verbatim is gone from the working window — even though it still exists on disk.
- **A compiled wiki is the wrong tool.** A knowledge wiki stores *conclusions*, lossily and by design. It answers "what did we decide," not "show me the exact exchange from three weeks ago, with the tool calls and the reasoning intact."
- **The raw data is already on disk but inaccessible.** Claude Code writes every session to append-only JSONL transcripts (`~/.claude/projects/**/*.jsonl`) — gigabytes of perfect-fidelity history. There is no way for an agent to query it: no full-text search, no temporal filter, no "find the session where we discussed X," no way to pull the turns surrounding a hit.
- **Memory is siloed per tool.** Each agent/tool stores history in its own format. There is no shared, cross-agent, cross-project memory.

The user (Jordan) framed this as building the agent's *literal memory* — "not just a wiki but real full-fidelity memory" — a gift to the agent so it can recall its own past with full temporal, project, agent, and session context.

## Solution

`recall` is a standalone, well-typed memory system that indexes raw agent session transcripts into a searchable store and exposes retrieval over the Model Context Protocol (MCP), so any MCP-compatible agent can query its own past with full fidelity and provenance.

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
24. As the user, I want `recall` to run as a standalone MCP server with no dependency on any other service, so that my memory works even when other tooling is down.
25. As the user, I want `recall` usable by any MCP-compatible client, so that other agents (Cursor, Cline, Claude Desktop) can search the same memory.
26. As the user, I want ingestion behind a source-adapter interface, so that I can later add adapters for other agents and unify all my history in one store.
27. As the user, I want the whole system to be its own repo, so that I can publish it on GitHub and others can use it.
28. As the user, I want everything extremely well-typed (Zod at boundaries, no `any`), so that the memory store stays trustworthy and maintainable.
29. As a coding agent, I want to query semantically (phase 3), so that I can recall things I can't express as exact keywords.
30. As the user, I want `recall` to optionally feed notable sessions into a compiled knowledge wiki (phase 3), so that raw memory and compiled knowledge reinforce each other.

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

Four logical tables plus an FTS5 virtual table; the full original line is preserved on every message row for zero-loss fidelity.

- **`sessions`** — one row per session: `session_id` (PK), `source` (adapter id), `project_path`, `project_slug`, `git_branch`, `started_at`, `ended_at`, `message_count`, `model`, `cc_version`, `first_user_prompt`, `title`/`slug`.
- **`messages`** — one row per substantive transcript line: `uuid` (PK), `session_id` (FK), `parent_uuid`, `seq`, `timestamp`, `role`, `type`, `is_sidechain`, `agent_name`, `skill`, `model`, `git_branch`, `cwd`, `text` (flattened searchable text), `raw_json` (full original line), `source`.
- **`tool_calls`** — one row per `tool_use`/`tool_result` pairing: `tool_use_id`, `message_uuid`, `tool_name`, `input_json`, `result_text`, `is_error`, `duration_ms`.
- **`messages_fts`** — FTS5 virtual table mirroring `messages.text` (contentless, kept in sync on upsert).
- **`embeddings`** *(phase 3)* — `uuid`, `vector`, `model`.

### Chunk granularity

- Store at **message level** (nothing coalesced away — full fidelity).
- Make the **retrieval unit a turn** (a user prompt plus the assistant's full response, including its tool calls), assembled from messages via `parent_uuid`. The agent can drill to a single message or pull the whole exchange.

### Retrieval surface (MCP tools)

Every result carries full provenance (`session_id`, `timestamp`, `project`, `branch`, `agent`, `skill`, `model`).

- `search_memory(query, { project?, branch?, agent?, skill?, tool?, role?, model?, since?, until?, limit? })` — FTS keyword search with every dimension as an optional filter. Primary tool.
- `find_relevant(query, { since?, until?, limit? })` — FTS + time window + recency weighting (`score = 1 / (1 + age_hours)`).
- `get_context(message_uuid, { before?, after? })` — return the N turns surrounding a hit. The tool that makes verbatim recall usable.
- `get_session(session_id, { from?, limit? })` — paginated replay of a whole session in order.
- `list_sessions({ project?, since?, until?, limit? })` — session-level browse.
- `timeline({ project?, since, until })` — session-level rollup for "show me my history."

### Freshness

JSONL is append-only, so indexing is incremental via a per-file watermark (byte offset; mtime + hash as dirty check). Triggers:

- **`PreCompact` hook** — index the current session immediately before compaction. Closes the amnesia gap.
- **`SessionEnd` / `Stop` hook** — catch-up index.
- **`reindex` command** — manual full/backfill pass (first run ingests the existing corpus).

### Source adapter interface (Claude Code first)

Grounded in the real JSONL schema (verified against live transcripts), available fields per line include: `sessionId`, `uuid`, `parentUuid`, `timestamp`, `type` (`user`/`assistant`/`system` plus meta types like `attachment`, `file-history-snapshot`, `ai-title`, `agent-name`, `permission-mode`, `last-prompt`, `queue-operation`), `cwd`, `gitBranch`, `version`, `isSidechain`, `agentName`, `attributionSkill`, `model` (inside `message`), `stopReason`, `durationMs`, `requestId`, `slug`, and content blocks typed as `thinking | text | tool_use | tool_result | image`. The adapter maps these into `MessageRecord` / `ToolCallRecord` and skips non-substantive meta line types.

### Type safety

- **Zod validates each raw line at the boundary** (external/untrusted input with 40+ possible keys and many `type` variants). Parse, don't trust. Unknown line types are logged and skipped — never crash the indexer.
- Typed domain models (`SessionRecord`, `MessageRecord`, `ToolCallRecord`), typed tool inputs/outputs.
- House rules: no `any`, named exports, Zod for schemas, structured logging, files focused/small, colocated tests.

### Distribution

- Standalone repo `~/recall`, no runtime dependency on any external service; destined for its own public GitHub repo.
- Runs as an MCP server (stdio first; HTTP optional later) usable by any MCP-compatible client.
- Indexes `~/.claude/projects/` globally; agents working in any project can search any project's history.

## Testing Decisions

**What makes a good test here:** assert *external behavior*, not internals. For the parser: given a real (fixture) JSONL line, assert the normalized records that come out — not the parsing steps. For the store: insert records and assert what queries return (including idempotency: re-inserting the same `uuid` doesn't duplicate; FTS returns freshly inserted text). For search: build a small fixture corpus and assert that filters, time windows, recency ranking, and provenance fields behave — not how the SQL is shaped.

**Modules to be tested (high priority):**
- **Parser/normalizer** — fixture lines covering each substantive `type` and each content-block type, plus unknown/meta lines (must skip cleanly), malformed lines (must not crash), and sidechain/agent/skill attribution.
- **Store** — schema init, idempotent upsert by `uuid`, session rollup derivation, FTS sync.
- **Search** — each dimension filter, combined filters, time windows, recency ranking, provenance completeness on every result.

**Medium priority:**
- **Indexer** — watermark resume (only the appended tail is parsed on re-run), full backfill over a fixture directory.

**Low priority:**
- **MCP server** — contract/smoke test that each tool is registered with the right input schema and dispatches to the correct search function.

**Prior art:** Daemion's `src/core/history-tools.ts` (the five RLM-style history tools and the recency-weighting formula) and its FTS5-backed `storage.ts` are the design template, and their colocated `*.test.ts` files (e.g. `history-tools.test.ts`) are the testing-style reference. `recall` reimplements these cleanly and decoupled, with no gateway dependency.

## Out of Scope

- **Embeddings / semantic search** — phase 3. v1 is FTS5 + provenance + `get_context`.
- **Non–Claude-Code adapters** (Codex, Cursor, …) — the adapter interface is built now, but only the Claude Code adapter ships in v1.
- **Wiki digest integration** — auto-writing notable sessions into a compiled knowledge wiki is phase 3.
- **A UI** — `recall` is an MCP server + CLI; no graphical interface.
- **Editing or mutating transcripts** — `recall` is read-only over source files; it never modifies `~/.claude/projects/`.
- **HTTP/remote transport and multi-machine sync** — stdio MCP only in v1.
- **Auth / multi-user** — single-user, local-first.

## Further Notes

- The emotional core of the project (the user's framing: "a treat from me to you") is three capabilities: **verbatim recall**, **provenance on every hit**, and **fetch-the-surrounding-context**. If a scope cut is ever needed, protect those three first.
- The append-only nature of JSONL is what makes incremental indexing cheap and the `PreCompact` hook reliable — lean on it.
- Keeping `raw_json` on every message row means future schema additions (new columns, new derived fields) can be backfilled from the store itself without re-reading source files.
- The two memory systems are complementary by design: `recall` = raw, verbatim, lossless; a knowledge wiki = compiled, lossy, conclusions. Phase 3's digest is the bridge between them.
