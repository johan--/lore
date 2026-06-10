# PRD — `lore`: unified adapter substrate + three new harnesses + self-onboarding

> Status: ready-for-agent · Created 2026-06-07 · Repo: `~/lore`

## Problem Statement

Lore's promise is one shared memory for every AI agent you use. Today it only reads two of them: Claude Code and Codex. Every other tool a person codes with (Cursor, Cline, openclaw, Hermes, and whatever ships next month) writes its sessions to disk in its own format, and Lore cannot see any of it. The cross-agent superpower is only as wide as the list of harnesses Lore understands, and that list is short.

The reason it stays short is baked into the substrate. Every adapter Lore has is **line-oriented**: the engine opens a transcript file, reads it one line at a time, and hands each line to the adapter's `parseLine`. That works for JSONL transcripts and nothing else. But the harnesses people actually use store their history in shapes that have no "lines" to feed:

- **Cursor** keeps sessions in SQLite databases, not text files.
- **Hermes** keeps its canonical history in a SQLite `state.db` (its legacy JSONL is incomplete).
- **Cline** writes whole-file JSON arrays, and the timestamps live in a *different* file joined by position.

So three of the four most-requested harnesses are structurally impossible to support without changing the core. Bolting on a special case per format would leave Lore carrying two or three parallel ingestion paths forever, and it would still not answer the deeper question: what happens when an agent shows up from a harness Lore has *never seen*? Right now the answer is "nothing," unless a human sits down, clones the repo, and writes TypeScript.

The user (Jordan) framed the goal two ways. First, widen the memory to the harnesses people use now, honestly, with no fake or partial coverage dressed up as complete. Second, make the substrate good enough that a brand-new harness can onboard itself: an agent in an unknown tool should be able to look at its own transcripts, figure out the shape, get its history into Lore, and prove it actually worked, without a human writing core code by hand.

## Solution

Two layers of work, one outcome: Lore can ingest non-line-oriented sources as first-class citizens, ships three new harnesses on that foundation, and gives an unfamiliar harness a safe, self-service path in.

**Layer 1: one unified ingestion contract (the substrate fix).**

Replace the line-only assumption with a single contract where an adapter, given a discovered file and a context, yields a stream of normalized records. Reading a file by lines becomes a built-in default helper, so the existing JSONL adapters (Claude Code, Codex) stay nearly unchanged and any future JSONL adapter is still a one-liner. An adapter for a SQLite database or a whole-file JSON blob simply reads its own source and yields the same records. The engine has one path, not two, and it never needs a third when the next weird format appears. Record writing already flows through a clean, idempotent boundary, so the records land and become searchable exactly as before, no matter where they came from.

The incremental "only re-index what changed" logic is generalized at the same time. Today it resumes by byte offset and line count, which is meaningless for a database or a JSON blob. It becomes an opaque per-adapter resume token (a row id or timestamp for databases, a content hash for whole-file sources), so every source can skip unchanged work cheaply.

**Layer 2: three harnesses, plus a self-onboarding path for the rest.**

On the new substrate, ship three code adapters, each handled the way its format actually wants to be handled, with no fake completeness:

- **openclaw** as a code adapter. Its JSONL embeds tool calls inside content arrays and uses separate tool-result lines, the same shape as Claude Code (itself a code adapter), so a flat field-map cannot model it.
- **Cursor** and **Hermes** as code adapters, because they are SQLite databases.

Cline is deferred (see Out of Scope): there is no Cline data on the build machine to make honest fixtures from, and hand-authoring synthetic fixtures would violate the no-fake-coverage rule. It is served by the self-onboarding path until a real source exists to build and test an adapter against.

For harnesses Lore has never seen, give the agent a real path in:

1. **Sample** its own format. `lore sample` learns to recognize SQLite and whole-file JSON, not just JSONL, and reports the shape clearly enough for an agent to act on.
2. Pick a tier. If the format is tractable as a small adapter, the agent follows the **code-adapter** guide (clone the source, write the adapter, prove it). If the format is too strange, or the agent cannot or should not edit core source, it uses **push** to send finished records straight into the local store. Push is the zero-setup front door: it needs no adapter, no clone, no rebuild, and it carries data only, never code. (A future declarative-descriptor tier for genuinely flat JSONL is on the roadmap but deliberately not built here, see Out of Scope.)
3. **Prove it.** The conformance harness becomes a real gate: it runs the adapter end to end into a throwaway store, runs a search, and confirms the records come back. "I think it works" is replaced by "the proof passed."

From the user's perspective: more of their tools light up in one shared memory, the coverage is honest about what each source can and cannot carry, and an agent in a tool nobody planned for can get its history in immediately via push, with a guided path to contributing a durable adapter when it is worth making permanent.

## User Stories

1. As a Cursor user, I want my Cursor chat history indexed into Lore, so that my other agents can recall what Cursor and I worked through.
2. As a Cline user, I want a path to get my Cline task history into Lore (via push today, a durable adapter once a real source exists to build against), so that a session from Cline becomes searchable from Claude Code without shipping unverified coverage.
3. As an openclaw user, I want my openclaw sessions indexed into Lore, so that openclaw history joins the same shared memory as everything else.
4. As a Hermes user, I want my canonical Hermes history indexed into Lore, so that the full record (not a partial slice) is searchable.
5. As a coding agent, I want history from a SQLite-backed harness to carry the same provenance fields as JSONL history, so that a Cursor hit and a Claude Code hit are equally citable.
6. As a coding agent, I want results from every harness ranked and filtered identically, so that I never have to care which tool a memory came from.
7. As the user, I want each adapter to be honest about which fields it cannot provide (for example git branch when the source does not store it), so that a missing field reads as a known limitation, not a silent bug.
8. As the user, I want re-indexing a SQLite source to skip work it has already done, so that re-running a backfill over a large database stays cheap.
9. As the user, I want re-indexing a whole-file JSON source to detect when the file changed and re-read only then, so that unchanged Cline tasks are not reprocessed every run.
10. As a coding agent in any harness, I want a zero-setup way to get my history into Lore (push) that needs no clone, no rebuild, and carries data only, so that an unsupported tool is searchable immediately and safely.
11. As a coding agent in an unknown harness, I want to sample my own transcripts and get back a clear description of their shape, so that I can decide how to onboard myself.
12. As a coding agent in an unknown harness, I want the sampler to recognize when my history is a SQLite database, so that I am not told "no transcripts found" when they are simply not JSONL.
13. As a coding agent in an unknown harness, I want the sampler to recognize when my history is a whole-file JSON array, so that I can map it correctly.
14. As a coding agent whose source's identifiers are not UUIDs (only row ids or none), I want a defined rule for deriving a stable, collision-free message id, so that re-indexing does not duplicate or orphan my records.
15. As a coding agent with a database or join-based format, I want a guide for writing a small code adapter, so that I can handle the hard cases correctly.
16. As a coding agent whose format is too strange for either tier, I want to push finished records directly, so that my history is searchable today even without an adapter.
17. As a coding agent, I want a conformance check that actually ingests my adapter's output and confirms a search finds it, so that I can trust the adapter works before relying on it.
18. As the user, I want the conformance gate to fail loudly when records do not round-trip into the store, so that a broken adapter is never silently trusted.
19. As the user, I want the push path to accept data only and never code, so that an unfamiliar harness sending its history can never run anything on my machine.
20. As the user, I want no path that auto-loads or auto-runs adapter code from a folder, so that my machine never executes untrusted code from a harness.
21. As the user, I want the push path to validate every record at the boundary, so that malformed data cannot corrupt my store.
22. As the user, I want the existing Claude Code and Codex adapters to keep working unchanged after the substrate refactor, so that the upgrade costs me nothing.
23. As a contributor, I want the onboarding skill to cover non-JSONL formats, so that the guidance matches what real harnesses actually look like.
24. As a contributor, I want the onboarding skill to tell me whether to write a code adapter or just push, so that I do not waste effort on the wrong path for my format.
25. As a contributor, I want adding a new code adapter to be a contained, well-documented change (register the adapter, add the source to the known-source list, prove it through conformance), so that durable harness support is a clear recipe rather than guesswork.
26. As the user, I want code adapters to remain reviewed, committed source, so that durable harness support is held to the same quality bar as the rest of Lore.
27. As a coding agent, I want tool calls from every harness stored as first-class records where the source provides them, so that tool usage stays searchable across tools.
28. As the user, I want each new adapter covered by tests that prove its output round-trips and becomes searchable, so that coverage is verified behavior, not a claim.
29. As the user, I want the new sources added to the known-source list, so that filtering by source works for them like it does for Claude Code and Codex.
30. As the user, I want the README and onboarding docs to reflect the wider harness list and the self-onboarding path, so that new users see what is supported and how to add their own.

## Implementation Decisions

**Shared write path extraction (prerequisite, deep module).**
There are two write paths today, not one: the indexer wraps record persistence in a transaction that also does full-mode row deletion, per-record redaction, and session recompute, while the push ingestion wrapper does its own separate transaction with Zod validation and none of the indexer's extras. The "record boundary is already reusable" assumption was wrong. Before the contract refactor, extract a single shared writer that owns buffering, the transaction, full-mode deletes, redaction, and session recompute, and migrate both the indexer and push onto it. Only then is "one path, not two" real rather than aspirational. This is a prerequisite workstream, sequenced first.

**Unified ingestion contract (substrate, deep module).**
The adapter contract collapses to a single ingestion method: given a discovered file and a context (including any prior resume token), the adapter returns a stream of parsed records (the existing `MessageRecord` / `ToolCallRecord` shapes, unchanged), which the shared writer above persists. Line-by-line reading becomes a built-in default helper that line-oriented adapters opt into, so a JSONL adapter still only writes a per-line mapping. Non-line adapters (SQLite, whole-file JSON) implement the streaming method directly and own their own file reading. This was the user-confirmed decision: one path, not a `parseLine` plus `parseSource` bolt-on, chosen explicitly for long-term substrate health over the faster two-path option.

**Message id derivation rule (correctness, must be specified per adapter).**
The message id is `hash(sourceFileId + uuid + seq)` and is the primary key; the upsert is keyed on it, so an id that shifts on re-index duplicates rows rather than updating them. Line sources get away with an empty uuid because they re-read the same file in the same order every time, making `seq` stable. Database sources do not have that guarantee: if `seq` comes from query order, a deleted row shifts every later id. Therefore database and whole-file adapters MUST derive the id from the source's own stable primary key (row id, task id) rather than positional `seq`. The contract documents this rule, and each adapter states exactly which source field it keys on. This is a correctness requirement, not a labeling concession.

**Source-agnostic resume (requires a schema migration).**
The watermark generalizes from byte-offset-plus-line-count to a tagged resume token: `{ kind: "byte", byteOffset, lineCount, prefixSha256 } | { kind: "rowid", value } | { kind: "hash", value }`. Line sources keep their existing byte path verbatim, including the shrink/truncate guard, because that logic is byte-specific and must not be lost. Database sources resume by row id or timestamp; whole-file sources re-read on content-hash change. This requires a real schema migration to the source-file table (the current columns are required non-null integers), which is a budgeted workstream, not a free change. The re-index planner dispatches on token kind; each branch stays a pure function of prior watermark and current source state so it can be tested in isolation.

**Three concrete adapters, each matched to its format.**
- **openclaw**: code adapter. Its JSONL embeds tool calls inside content arrays and emits separate tool-result lines, the same shape as Claude Code, so it needs code, not a flat field-map.
- **Cursor**: code adapter over its SQLite store. Pinned against real data (sampled 2026-06-07): the source of truth is the global `state.vscdb` (`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`), table `cursorDiskKV`, key pattern `bubbleId:<conversationId>:<messageId>`, value is JSON. Per-workspace stores were empty and the `~/.cursor/chats` blob store is not the content, so both are out of scope. Mapping: sessionId from the conversationId in the key, messageId from the per-message `bubbleId` UUID (Cursor has stable UUIDs, so the id rule is satisfied directly), role from `type` (1=user, 2=assistant), text from `text`, timestamp from `createdAt` (ISO). Honestly null: model, branch, cwd. One implementation detail to confirm while building: the exact shape of `toolResults` on an assistant message that used tools (sampled user rows had it empty).
- **Hermes**: code adapter over the canonical SQLite `state.db` (`~/.hermes/state.db`), not the incomplete legacy JSONL. Pinned against real data (sampled 2026-06-07): read `messages` joined to `sessions` ordered by session then timestamp. Mapping: sessionId from `messages.session_id`, messageId keyed on `messages.id` (integer autoincrement, since there are no UUIDs), role from `messages.role`, text from `messages.content`, timestamp from `messages.timestamp` (unix epoch seconds), model from `sessions.model`. Tool calls are JSON in `messages.tool_calls` on assistant rows with results in subsequent `role='tool'` rows (flat-timeline pairing, same pattern as the Codex adapter). Skip `role='session_meta'` rows as meta. Honestly null: cwd (99.99% empty), branch, project.
Each adapter is honest about fields the source does not provide (notably git branch, and per-message UUIDs where only integer ids exist); missing fields are null by accepted limitation, not faked.

**Conformance is rewritten, not extended.**
The current harness is line-shaped: its fixtures are a representative line string and it calls the line parser. A streaming, possibly database-backed adapter has no "representative line," so the fixture type and every check must be re-expressed around the yield-records contract. On top of the re-shaped structural checks (declares a known source, parses a representative record, skips meta records, stable and source-keyed message ids, discovers a sample tree), add the real proof: run the adapter end to end into an in-memory store (already supported), run a search, confirm the expected record comes back. This round-trip is the trust gate an agent or human must pass before an adapter is registered or relied on.

**Format sampler recognizes non-JSONL.**
`lore sample` learns to detect a SQLite file (by header) and a whole-file JSON array, and reports the relevant shape (tables and columns, or array element keys) instead of failing or reporting "no transcripts." The sampler's job is to give an agent enough to choose between writing a code adapter and using push.

**Source registry and known-source list.**
The three new sources are added to the compile-time known-source list (the `Source` enum that every record schema validates against), so filtering works and pushed/ingested records for them validate. Adapters remain reviewed, committed builtins. There is no runtime loading or execution of adapter *code*; this was an explicit user-safety decision.

**Self-onboarding skill rewrite.**
The self-onboarding flow (now `skills/lore/references/setup/index.md`, merged into the single `lore` skill) is rewritten to cover non-JSONL formats, the two real tiers (write a code adapter, or push), the rewritten proof gate, and push as the immediate zero-setup path. The whole bundle is treated as one unit, consistent with the project rule that a skill is its entire folder.

## Testing Decisions

A good test here asserts external behavior: given a real (fixture) transcript in a harness's format, the adapter's output round-trips into the store and a search returns the expected record with correct provenance. Tests should not assert internal parsing structure; they should assert that a message that exists in the source becomes a searchable, correctly-attributed memory. This keeps tests stable across refactors of the parsing internals.

Modules to be tested:
- **Shared write path** (the extracted writer): the indexer and push produce identical persisted state for the same records, including full-mode delete and redaction behavior.
- **Re-index planner** (pure: prior watermark plus current source state yields a re-index plan). Unit-tested per token kind: byte (including shrink/truncate), row id, and content-hash change.
- **Message id derivation**: re-indexing a database source after a row is deleted does not duplicate or shift the ids of surviving records.
- **Each of the three adapters' parse paths** via the conformance round-trip: ingest fixture data, search, confirm hits and provenance.
- **Rewritten conformance harness** itself: confirm it fails when records do not round-trip, and passes when they do.

Prior art in the codebase: the existing colocated `*.test.ts` files in the indexer, the codex parse tests, and the current conformance fixtures are the pattern to follow. New adapters add small, representative fixtures (a short SQLite database, a trimmed JSON-array file) rather than copying large real transcripts.

The three adapters, the extracted write path, the message-id rule, and the re-index planner all get tests. The substrate refactor is covered by the existing Claude Code and Codex tests continuing to pass (regression proof, this is how "existing adapters keep working unchanged" is verified) plus the round-trip tests for the new sources. Fixtures stay small and representative (a short SQLite database, a trimmed JSONL file); no large real transcripts are copied, and no synthetic fixtures are authored for a format with no real data to validate against.

## Out of Scope

- **The declarative descriptor system** (a JSON-mapping interpreter plus runtime descriptor loading). Deferred, not deleted. It is premature here: it would serve zero valid consumers in this PRD, since openclaw turned out to need code, and it conflicts with the no-premature-abstraction rule. Revisit once 2+ genuinely flat JSONL harnesses exist to prove it against. Until then, an unknown flat-JSONL harness uses push or a code adapter.
- **Cline.** Deferred to the self-onboarding path. No Cline data exists on the build machine, so an adapter could not be built or tested without authoring synthetic fixtures, which would be fake coverage. When real Cline data exists: the adapter must join its two files on a shared field (timestamp or content), never positional index (the UI-messages file contains UI-only entries with no counterpart, so indices drift and would silently misattribute timestamps), with a documented null-timestamp fallback.
- **Cline's index-based timestamp join.** Explicitly rejected as unsafe, per the above, even when Cline is eventually built.
- **Hermes legacy JSONL** as a primary path. The canonical SQLite `state.db` is the source of truth; the legacy JSONL is incomplete and not targeted.
- **A runtime loader that executes adapter code** from a folder. Explicitly rejected on security grounds. Code adapters are reviewed, committed source.
- **Semantic / embedding search** for the new sources beyond what the existing core already provides. Out of scope here.
- **Backfilling git branch (or other fields) the source does not store.** Missing fields stay null rather than being inferred or faked.
- **Adapters for harnesses beyond the three named** (they are served by the self-onboarding path, not pre-built here).

## Further Notes

Sequencing (the dependency DAG, corrected after the critic pass): (1) extract the shared write path; (2) the unified contract plus the tagged-union resume token and its schema migration; (3) rewrite the conformance harness into the record-stream round-trip gate. Only then, in parallel and each behind a real-data gate: openclaw, Cursor, and Hermes (Cursor and Hermes stores are now pinned against real on-machine data, sampled 2026-06-07). openclaw is not the early proof; it is just another code adapter. The conformance round-trip lands before the adapters, since it is how their correctness is proven.

Honesty rules carried from the user: no adapter should present partial coverage as complete; fields a source cannot provide must read as known limitations; nothing fake or inferred is shipped as if it were real data. The cross-agent differentiator (any agent reading any other agent's sessions) is the reason this work exists, so widening the honest harness list is the point, not breadth for its own sake.

This PRD follows the project workflow: it is the shaping artifact. It has survived one adversarial critic pass (2026-06-07); the findings folded in were the shared-write-path extraction, the message-id-without-uuid rule, the tagged-union resume token plus schema migration, the conformance rewrite (not extension), deferring the descriptor system and Cline, and re-sampling Cursor before scoping. The empirical pre-issue action is now done: real Cursor and Hermes data was sampled on 2026-06-07, pinning their exact stores and field coverage (see the three-concrete-adapters decisions). Next steps are breaking this into implementation issues (tracer-bullet slices), then execution. Trust order once issues exist: merged code over PR over issues over this document.
