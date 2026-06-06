---
name: recall-setup
description: Use when onboarding a new harness (Codex, Cursor, Cline, any MCP client or any tool that writes session transcripts) into recall, the full-fidelity session-memory store. Walks an agent deterministically from "recall is installed" to "my own past sessions are searchable", including the case where recall has no adapter for the harness yet.
---

# recall-setup

This skill makes onboarding a harness into `recall` **deterministic** — an agent
should be able to follow it cold, with no judgement calls, and end with its own
transcripts searchable over MCP. Self-setup is the proof that recall works for a
new harness.

`recall` is a local-only SQLite + FTS5 store of agent session transcripts,
served over MCP. Each harness writes into its own `source` namespace
(`claude-code`, `codex`, …). There is one store; any MCP client reads all of it.

## Decision: which ingestion path?

There are exactly two ways content enters recall. Pick by answering one question:

> **Does this harness already write transcript files to disk?**

- **Yes — on-disk transcripts (PULL path).** Most CLI harnesses do. Claude Code
  writes `~/.claude/projects/**/*.jsonl`; Codex writes
  `~/.codex/archived_sessions/*.jsonl`. Use `recall index`. If recall already has
  an adapter for the format, you are done in one command. If not, you write a
  small adapter (Step 3b) and prove it with the conformance harness before using
  it.
- **No — live process only (PUSH path).** If the harness has no on-disk
  transcript but can run code at message time, it calls the `push` MCP tool (or
  `pushRecords` in-process) with normalized records. No adapter needed — the push
  path is universal. See Step 3c.

When both exist, prefer PULL: it backfills all history, not just sessions from
now on.

## Step 1 — Install and build

```bash
cd /path/to/recall
npm install
npm run build
npm link          # optional: puts `recall` on PATH
```

Requires Node 22+. Verify: `recall help` prints usage.

## Step 2 — Look at the format

If the harness writes files to disk, point the sampler at the directory before
doing anything else. This is non-destructive and tells you the on-disk shape:

```bash
recall sample <transcript-dir>
```

It prints the file count, a sample file path, the distinct line `type` values,
and the distinct top-level JSON keys. Use this to decide whether an existing
adapter fits or you need a new one.

- If `source` is already a known adapter (run `recall index <dir> --source ?` —
  an unknown source lists the known ones), skip to Step 4 and just index.
- Otherwise continue to Step 3.

## Step 3 — Make content ingestible

### 3a. Known harness, on-disk transcripts

```bash
recall index <transcript-dir>                      # default: claude-code adapter
recall index <transcript-dir> --source <name>      # pick a registered adapter
recall index <transcript-dir> --subagents          # include subagent files
recall index <transcript-dir> --redact             # opt-in credential redaction
```

Re-running is cheap — unchanged files are skipped by the per-file watermark.

### 3b. New harness, on-disk transcripts — write an adapter

An adapter is one small object satisfying `SourceAdapter`
(`src/adapters/contract.ts`):

```ts
interface SourceAdapter {
  readonly source: Source; // must be added to SOURCES in src/core/records.ts first
  discover(root: string): Promise<DiscoveredFile[]>;
  parseLine(rawLine: string, ctx: ParseContext): ParseOutcome;
}
```

Deterministic procedure:

1. Add the new source name to the `SOURCES` enum in `src/core/records.ts`. The
   conformance harness rejects any adapter whose `source` is not in this enum.
2. Create `src/adapters/<name>/adapter.ts` exporting a `SourceAdapter`. Model it
   on `src/adapters/claude-code/adapter.ts`. `discover` walks for the harness's
   transcript files; `parseLine` turns one raw line into either
   `{ kind: "parsed", parsed: { message, toolCalls } }` or
   `{ kind: "skipped", reason }` for meta/unknown lines. Reuse `computeMessageId`
   from the claude-code parser so message ids stay stable
   (`hash(sourceFileId + uuid + seq)`).
   - `parseLine` is **stateless per line**. If a harness uses a flat timeline
     where tool calls and their outputs are separate lines (Codex does), map each
     line to its own message and attach the tool call to that line, pairing the
     output back by the harness's call id. If session-level fields like project
     or model only appear on a header line (not on each message), they will be
     null on the messages; that is an accepted limitation, not a bug. See
     `src/adapters/codex/parse-line.ts` for a worked example of a flat-timeline
     adapter.
3. **Prove it before registering.** Call `checkAdapterConformance` from
   `src/adapters/conformance.ts` with fixtures from the real format (use a line
   you saw via `recall sample`). It returns a structured `ConformanceReport`;
   `report.passed` must be `true`. The checks: declares a known source, parses a
   representative line into a schema-valid message, skips a meta line, produces a
   stable-yet-seq-sensitive message id, and (if you pass `sampleRoot`) discovers
   at least one file. Do not register an adapter whose report is not green.
4. Register it: add the adapter to the `makeRegistry([...])` builtin list in
   `src/adapters/registry.ts`.
5. `npm run check` must pass (typecheck + lint + format + test). Add a colocated
   `*.test.ts` for the adapter and one conformance test (model on
   `src/adapters/conformance.test.ts`).
6. Index: `recall index <dir> --source <name>`.

### 3c. Live harness, no transcript files — push

Call the `push` MCP tool (or import `pushRecords` from
`src/core/ingest/push.js`) with a normalized batch:

```ts
push({
  sourceFile: { sourceFileId, sessionId, source, /* … */ },
  messages: [ /* MessageRecord[] */ ],
  toolCalls: [ /* ToolCallRecord[] */ ],
});
```

The batch is validated with Zod at the boundary; a malformed batch is rejected
without writing. Pushes are idempotent (keyed upserts), so re-pushing a session
does not duplicate it. The session rollup is recomputed automatically.

## Step 4 — Serve over MCP

```bash
recall serve            # MCP server over stdio
```

Point the client at it. For Claude Code, `~/.claude/settings.json`:

```json
{ "mcpServers": { "recall": { "command": "recall", "args": ["serve"] } } }
```

For any other MCP client, add an stdio server entry with the same command/args.

## Step 5 — Survive compaction (optional but recommended)

Wire `recall hook` into the harness's pre-compaction / session-end lifecycle. It
reads the hook payload on stdin, extracts the transcript path, indexes just that
file, and always exits 0 so it can never crash the harness.

## Step 6 — Verify (this is the proof)

Confirm the new source is actually searchable:

```bash
# via CLI after indexing, or via the search_memory MCP tool with a source filter
```

Call `search_memory` with `{ "source": "<name>", "query": "<a word you know is in a session>" }`
and confirm you get hits whose `source` is `<name>`. A green search against the
new namespace — produced by following this skill cold — is the proof that the
harness is onboarded.

## Checklist

- [ ] `recall help` works (installed + built)
- [ ] `recall sample <dir>` ran; format understood
- [ ] Ingestion path chosen (PULL/index or PUSH)
- [ ] If new adapter: source added to `SOURCES`, `checkAdapterConformance` green, registered, `npm run check` passes
- [ ] Content indexed/pushed
- [ ] `recall serve` wired into the MCP client
- [ ] `search_memory` returns hits for the new `source`
