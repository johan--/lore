# PRD — `lore`: unified adapter substrate + four new harnesses + self-onboarding

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

Two layers of work, one outcome: Lore can ingest non-line-oriented sources as first-class citizens, ships four new harnesses on that foundation, and gives an unfamiliar harness a safe, self-service path in.

**Layer 1: one unified ingestion contract (the substrate fix).**

Replace the line-only assumption with a single contract where an adapter, given a discovered file and a context, yields a stream of normalized records. Reading a file by lines becomes a built-in default helper, so the existing JSONL adapters (Claude Code, Codex) stay nearly unchanged and any future JSONL adapter is still a one-liner. An adapter for a SQLite database or a whole-file JSON blob simply reads its own source and yields the same records. The engine has one path, not two, and it never needs a third when the next weird format appears. Record writing already flows through a clean, idempotent boundary, so the records land and become searchable exactly as before, no matter where they came from.

The incremental "only re-index what changed" logic is generalized at the same time. Today it resumes by byte offset and line count, which is meaningless for a database or a JSON blob. It becomes an opaque per-adapter resume token (a row id or timestamp for databases, a content hash for whole-file sources), so every source can skip unchanged work cheaply.

**Layer 2: four harnesses, plus a self-onboarding path for the rest.**

On the new substrate, ship four adapters, each handled the way its format actually wants to be handled, with no fake completeness:

- **openclaw** as a *declarative descriptor* (plain JSONL, so it becomes data, not code, and dogfoods the descriptor path below).
- **Cursor**, **Hermes**, and **Cline** as *code adapters*, because databases and cross-file joins genuinely need code.

For harnesses Lore has never seen, give the agent a real path in:

1. **Sample** its own format. `lore sample` learns to recognize SQLite and whole-file JSON, not just JSONL, and reports the shape clearly enough for an agent to act on.
2. Pick a tier. If the format is regular JSONL, the agent writes a **declarative descriptor** (a JSON mapping that says where the role, text, and timestamp live) and drops it in. That is data, read by fixed trusted code, never executed, safe to load at runtime. If the format is a database or needs joins, the agent follows the **code-adapter** guide. If the format is too strange for either, the agent uses **push** to send finished records straight into the local store.
3. **Prove it.** The conformance harness becomes a real gate: it runs the adapter end to end into a throwaway store, runs a search, and confirms the records come back. "I think it works" is replaced by "the proof passed."

From the user's perspective: more of their tools light up in one shared memory, the coverage is honest about what each source can and cannot carry, and an agent in a tool nobody planned for can get itself in without a human writing core code.

## User Stories

1. As a Cursor user, I want my Cursor chat history indexed into Lore, so that my other agents can recall what Cursor and I worked through.
2. As a Cline user, I want my Cline task history indexed into Lore, so that a session from Cline is searchable from Claude Code.
3. As an openclaw user, I want my openclaw sessions indexed into Lore, so that openclaw history joins the same shared memory as everything else.
4. As a Hermes user, I want my canonical Hermes history indexed into Lore, so that the full record (not a partial slice) is searchable.
5. As a coding agent, I want history from a SQLite-backed harness to carry the same provenance fields as JSONL history, so that a Cursor hit and a Claude Code hit are equally citable.
6. As a coding agent, I want results from every harness ranked and filtered identically, so that I never have to care which tool a memory came from.
7. As the user, I want each adapter to be honest about which fields it cannot provide (for example git branch when the source does not store it), so that a missing field reads as a known limitation, not a silent bug.
8. As the user, I want re-indexing a SQLite source to skip work it has already done, so that re-running a backfill over a large database stays cheap.
9. As the user, I want re-indexing a whole-file JSON source to detect when the file changed and re-read only then, so that unchanged Cline tasks are not reprocessed every run.
10. As a contributor, I want adding a plain-JSONL harness to be a data file, not code, so that I can support a new tool without touching the Lore source or rebuilding.
11. As a coding agent in an unknown harness, I want to sample my own transcripts and get back a clear description of their shape, so that I can decide how to onboard myself.
12. As a coding agent in an unknown harness, I want the sampler to recognize when my history is a SQLite database, so that I am not told "no transcripts found" when they are simply not JSONL.
13. As a coding agent in an unknown harness, I want the sampler to recognize when my history is a whole-file JSON array, so that I can map it correctly.
14. As a coding agent with a regular JSONL format, I want to write a declarative descriptor that maps my fields, so that I onboard with data instead of code.
15. As a coding agent with a database or join-based format, I want a guide for writing a small code adapter, so that I can handle the hard cases correctly.
16. As a coding agent whose format is too strange for either tier, I want to push finished records directly, so that my history is searchable today even without an adapter.
17. As a coding agent, I want a conformance check that actually ingests my adapter's output and confirms a search finds it, so that I can trust the adapter works before relying on it.
18. As the user, I want the conformance gate to fail loudly when records do not round-trip into the store, so that a broken adapter is never silently trusted.
19. As the user, I want declarative descriptors to be read by fixed, trusted code and never executed, so that loading one carries no risk of running arbitrary code.
20. As the user, I want no path that auto-loads or auto-runs adapter code from a folder, so that my machine never executes untrusted code from a harness.
21. As the user, I want the push path to validate every record at the boundary, so that malformed data cannot corrupt my store.
22. As the user, I want the existing Claude Code and Codex adapters to keep working unchanged after the substrate refactor, so that the upgrade costs me nothing.
23. As a contributor, I want the onboarding skill to cover non-JSONL formats, so that the guidance matches what real harnesses actually look like.
24. As a contributor, I want the onboarding skill to tell me which tier my format falls into, so that I do not waste effort forcing a database into a JSONL descriptor.
25. As the user, I want a new source to register without me editing core source for declarative descriptors, so that data-defined harnesses are genuinely drop-in.
26. As the user, I want code adapters to remain reviewed, committed source, so that durable harness support is held to the same quality bar as the rest of Lore.
27. As a coding agent, I want tool calls from every harness stored as first-class records where the source provides them, so that tool usage stays searchable across tools.
28. As the user, I want each new adapter covered by tests that prove its output round-trips and becomes searchable, so that coverage is verified behavior, not a claim.
29. As the user, I want the four new sources added to the known-source list, so that filtering by source works for them like it does for Claude Code and Codex.
30. As the user, I want the README and onboarding docs to reflect the wider harness list and the self-onboarding path, so that new users see what is supported and how to add their own.

## Implementation Decisions

**Unified ingestion contract (substrate, deep module).**
The adapter contract collapses to a single ingestion method: given a discovered file and a context (including any prior resume token), the adapter returns a stream of parsed records (the existing `MessageRecord` / `ToolCallRecord` shapes, unchanged). Line-by-line reading becomes a built-in default helper that line-oriented adapters opt into, so a JSONL adapter still only writes a per-line mapping. Non-line adapters (SQLite, whole-file JSON) implement the streaming method directly and own their own file reading. This was the user-confirmed decision: one path, not a `parseLine` plus `parseSource` bolt-on, chosen explicitly for long-term substrate health over the faster two-path option.

**Record-writing boundary is reused as-is.**
The idempotent upsert path (source file, message, tool call) and the existing push ingestion wrapper already accept normalized records independent of origin. The unified contract feeds this same boundary. No changes to how records are persisted, deduplicated, or rolled up into sessions.

**Source-agnostic resume.**
The incremental watermark generalizes from byte-offset-plus-line-count to an opaque, per-adapter resume token, plus a content-hash fallback for whole-file sources that cannot be tailed. The re-index planner becomes adapter-aware: line sources keep byte/line resume, database sources resume by row id or timestamp, whole-file sources re-read on hash change. The planner stays a pure function of prior watermark and current source state so it can be tested in isolation.

**Declarative descriptor adapter (deep module).**
A single built-in interpreter reads a JSON descriptor and yields records. The descriptor declares a discovery glob, field mappings (where role, text, timestamp, session id live), and line-type skip rules. The interpreter is fixed, trusted code; the descriptor is pure data and is never evaluated as code. Descriptors may be loaded at runtime from a known directory, which is safe precisely because they are data. The descriptor shape, kept deliberately small (prototype-level sketch, the real schema is finalized in implementation):

```jsonc
{
  "source": "openclaw",
  "discover": "~/.openclaw/agents/*/sessions/*.jsonl",
  "message": { "role": "<path>", "text": "<path>", "time": "<path>", "sessionId": "<path>" },
  "skipLineTypes": ["model_change", "thinking_level_change"]
}
```

If a format needs anything beyond flat field extraction and line-type filtering (joins, stateful pairing, queries), it is explicitly out of the descriptor's scope and belongs in a code adapter. This boundary is deliberate: the descriptor stays data, and the moment logic is required, the work moves to reviewed code rather than growing a query language inside JSON.

**Four concrete adapters, each matched to its format.**
- **openclaw**: declarative descriptor. Plain JSONL close to Claude Code's shape; proves the descriptor path end to end.
- **Cursor**: code adapter over its SQLite store, targeting the documented global storage system (the content-addressed blob system is out of scope, see below). Honest about brittleness of internal schema versions.
- **Hermes**: code adapter over the canonical SQLite `state.db`, not the incomplete legacy JSONL, because the database is the complete record.
- **Cline**: code adapter over whole-file JSON arrays, joining timestamps from the UI-messages file by index and reading working directory and model from the shared task-history file.
Each adapter is honest about fields the source does not provide (notably git branch, and per-message UUIDs where only integer ids exist); missing fields are null by accepted limitation, not faked.

**Conformance becomes a real proof gate.**
The conformance harness gains an end-to-end round-trip check: run the adapter into a throwaway store, run a search, confirm the expected record is returned. This is the trust gate an agent (or a human) must pass before an adapter is registered or relied on. The existing structural checks (declares a known source, parses a representative record, skips meta records, stable and seq-sensitive message ids, discovers a sample tree) are retained.

**Format sampler recognizes non-JSONL.**
`lore sample` learns to detect a SQLite file (by header) and a whole-file JSON array, and reports the relevant shape (tables and columns, or array element keys) instead of failing or reporting "no transcripts." The sampler's job is to give an agent enough to choose a tier.

**Source registry.**
The four new sources are added to the known-source list so filtering works. Code adapters remain registered in source as reviewed, committed builtins. Declarative descriptors are discovered from their directory at startup. There is no runtime loading or execution of adapter *code*; this was an explicit user-safety decision.

**Self-onboarding skill rewrite.**
The `lore-setup` skill bundle is rewritten to cover the two tiers (declarative descriptor versus code adapter), non-JSONL formats, the strengthened proof gate, and push as the catch-all. The whole bundle is treated as one unit, consistent with the project rule that a skill is its entire folder.

## Testing Decisions

A good test here asserts external behavior: given a real (fixture) transcript in a harness's format, the adapter's output round-trips into the store and a search returns the expected record with correct provenance. Tests should not assert internal parsing structure; they should assert that a message that exists in the source becomes a searchable, correctly-attributed memory. This keeps tests stable across refactors of the parsing internals.

Modules to be tested:
- **Declarative descriptor interpreter** (pure: descriptor plus raw record yields parsed records). Unit-tested across field-mapping and skip-rule cases.
- **Re-index planner** (pure: prior watermark plus current source state yields a re-index plan). Unit-tested for line, database, and whole-file resume cases, including shrink/truncate and hash-change.
- **Each of the four adapters' parse paths** via the conformance round-trip: ingest fixture data, search, confirm hits and provenance.
- **Strengthened conformance harness** itself: confirm it fails when records do not round-trip, and passes when they do.

Prior art in the codebase: the existing colocated `*.test.ts` files in the indexer, the codex parse tests, and the current conformance fixtures are the pattern to follow. New adapters add small, representative fixtures (a short SQLite database, a trimmed JSON-array file) rather than copying large real transcripts.

The four adapters and the two new pure modules (descriptor interpreter, re-index planner) all get tests. The substrate refactor is covered by the existing Claude Code and Codex tests continuing to pass (regression proof) plus the round-trip tests for the new sources.

## Out of Scope

- **Cursor's content-addressed blob system** (the secondary store DAG). The documented global-storage system is the target; the blob system is brittle and deferred.
- **Hermes legacy JSONL** as a primary path. The canonical SQLite `state.db` is the source of truth; the legacy JSONL is incomplete and not targeted.
- **A runtime loader that executes adapter code** from a folder. Explicitly rejected on security grounds. Only data descriptors load at runtime; code adapters are reviewed, committed source.
- **A general query or join language inside descriptors.** Descriptors stay flat field maps plus skip rules. Anything more goes to a code adapter.
- **Semantic / embedding search** for the new sources beyond what the existing core already provides. Out of scope here.
- **Backfilling git branch (or other fields) the source does not store.** Missing fields stay null rather than being inferred or faked.
- **Adapters for harnesses beyond the four named** (they are served by the self-onboarding path, not pre-built here).

## Further Notes

The two halves are sequenced: the unified contract and source-agnostic resume land first, because all three non-JSONL adapters and the descriptor path depend on them. openclaw can come early as the declarative-descriptor proof. Cursor, Hermes, and Cline follow as code adapters. The conformance round-trip gate should land before or alongside the new adapters, since it is how their correctness is proven.

Honesty rules carried from the user: no adapter should present partial coverage as complete; fields a source cannot provide must read as known limitations; nothing fake or inferred is shipped as if it were real data. The cross-agent differentiator (any agent reading any other agent's sessions) is the reason this work exists, so widening the honest harness list is the point, not breadth for its own sake.

This PRD follows the project workflow: it is the shaping artifact. Next steps are a critic pass, then breaking it into implementation issues (tracer-bullet slices), then execution. Trust order once issues exist: merged code over PR over issues over this document.
