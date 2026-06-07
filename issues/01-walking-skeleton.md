# Issue 1 — Walking skeleton: index a transcript → search via MCP

Type: AFK · Blocked by: None — can start immediately · Plan: docs/PRD-lore.md

## What to build

The thinnest end-to-end path through every layer of `lore`, plus project scaffolding. After this slice, you can point `lore` at a directory of Claude Code transcripts, index a **primary** session file, and get a keyword hit back through the MCP server with full provenance — proving the whole pipeline works.

Scope:
- **Scaffold**: Node 22+ / TypeScript (strict, NodeNext), Vitest, ESLint, Prettier. `npm run check` = typecheck + lint + test. Named exports only, no `any`, kebab-case files, colocated tests, structured logger.
- **Adapter (claude-code, minimal)**: streaming line-by-line parse of one `<sessionId>.jsonl` primary file; Zod-validate each line at the boundary; handle `user`/`assistant`/`system` + extract `tool_use`/`tool_result` blocks; per-type classification skeleton (skip meta types for now, count skips); a multi-MB-line guard (truncate + flag, never OOM/crash). Emits typed `MessageRecord` / `ToolCallRecord` / `SessionRecord` / `SourceFileRecord`.
- **Store**: SQLite (WAL + busy_timeout). Tables per PRD: `source_files`, `sessions`, `messages` (synthetic `message_id = hash(source_file_id+uuid+seq)` PK; `uuid`/`parent_uuid` plain columns), `tool_calls`, `messages_fts` (FTS5, **trigger-driven** sync, code-aware tokenizer with `tokenchars '_-.'`). Idempotent upsert on `message_id`. `text` and tool_result stored size-capped with elision marker.
- **Search**: `searchMemory(query, {limit?})` — `bm25()` ranked, with FTS query sanitization (`-`,`+`,`:`,quotes don't throw).
- **MCP server**: stdio; exposes `search_memory` and `get_message(message_id, {full?})`. Every response respects a char/result-count budget; oversized content elided with `…[fetch full via get_message(message_id, full=true)]`.
- **CLI**: `lore index <dir>` backfill over a directory (primary files only in this slice).

## Acceptance criteria

- [ ] `npm run check` passes (typecheck + lint + tests).
- [ ] Indexing a fixture primary transcript populates `sessions`/`messages`/`tool_calls`/FTS.
- [ ] `search_memory` returns a hit for a known keyword with full provenance (`message_id`, `session_id`, `timestamp`, `project`, `branch`, `model`).
- [ ] Re-indexing the same file does not duplicate rows (idempotent on `message_id`).
- [ ] A multi-MB fixture line is truncated+flagged, not crashed, and not returned raw by default.
- [ ] MCP server starts and `search_memory` + `get_message` are callable over stdio (contract/smoke test).
- [ ] Tests are behavior-level (assert query results, not SQL); fixtures are synthetic.

## Verification

`npm run check`
