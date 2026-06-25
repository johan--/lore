# lore — setup & onboarding (reference)

Read this when the `lore` CLI isn't installed yet, or when the thing you want to
recall **isn't indexed yet** — onboarding a harness, backfilling old sessions,
teaching lore a format it has no adapter for, or feeding a live process that
writes no transcript files. The parent `lore` skill is about *using* what's
indexed; this reference is about *getting content in* and making the CLI
available. It is written to be followed cold, with no judgement calls, ending
with your transcripts searchable.

`lore` is a local-only SQLite + FTS5 store of agent session transcripts. Each
harness writes into its own `source` namespace (`claude-code`, `codex`,
`openclaw`, `cursor`, `hermes`, …). There is one store, and there are two ways to
read it: the `lore search` / `lore sessions` **CLI**, which queries the SQLite
file directly and needs nothing running, and the **MCP server**, which any MCP
client connects to. The CLI is the always-available path; the server is one way
in for clients that speak MCP. Both read the same store, so anything you index is
immediately retrievable from the CLI even before you register the server.

## Fast path: a harness lore already auto-detects

If you are onboarding **Claude Code or Codex on this machine**, one command does
the whole job — it finds their transcripts in the standard locations, indexes the
history, self-verifies that search returns a hit, and prints how to register the
MCP server in your client. Install first (Step 1), then:

```bash
lore setup            # detect known harnesses, index, verify, print registration
```

`lore setup` probes the built-in locations (`~/.claude/projects`,
`~/.codex/sessions`, `~/.codex/archived_sessions`). It does not touch any MCP
client config — the registration block it prints is for you to apply. If it
reports indexed sources and `Search self-check: OK`, your history is already
queryable — run `lore search "<word>"` right now (Step 4a), and jump to Step 4b
when you want to register the server in a client. If it finds nothing (your
harness isn't auto-detected, or its transcripts live elsewhere), fall through to
the decision below.

## Decision: which ingestion path?

There are exactly two ways content enters lore. They map to two tiers of effort.
Pick by answering one question:

> **Does this harness already write transcripts to disk that an adapter can read
> later?**

- **Yes — on-disk transcripts (PULL path, `lore index`).** Most CLI harnesses do.
  The format can be JSONL (Claude Code, Codex, openclaw), a SQLite database
  (Cursor's `state.vscdb`, Hermes's `state.db`), or whole-file JSON. If lore
  already has an adapter for the format, you are done in one command. If not, you
  write a small **reviewed, committed code adapter** (Step 3b) and prove it with
  the conformance harness before using it.
- **No, or not yet — live process only (PUSH path, CLI `lore push` or MCP
  `push`).** If the harness has no readable on-disk transcript, or you want
  memory working *right now* with zero code, the live process sends normalized
  records through the CLI or the equivalent MCP tool. No adapter, no clone, no
  rebuild. See Step 3c.

When both are possible, prefer PULL: it backfills all history, not just sessions
from now on. PUSH is the immediate zero-setup front door; a code adapter is the
durable, backfilling solution.

## Step 1 — Install the CLI

The fastest path — and the one to use if you reached this skill via
`npx skills add jordanhindo/lore` (so you don't have the repo cloned) — is the
global install:

```bash
npm install -g @jordanhindo/lore   # puts the `lore` command on PATH
```

From source instead (only needed to contribute or write a new adapter, which
requires the source tree):

```bash
git clone https://github.com/jordanhindo/lore && cd lore
npm install
npm run build
npm link          # optional: puts `lore` on PATH
```

Requires Node 22+. Verify either way: `lore help` prints usage.

## Step 2 — Look at the format

If the harness writes files to disk, point the sampler at the directory before
doing anything else. It is non-destructive and recognizes all three container
shapes lore supports — it never loads a whole database into memory, so it is safe
on a multi-GB SQLite file:

```bash
lore sample <transcript-dir>
```

It reports a `kind` and the shape that matters for that kind:

- **`jsonl`** — distinct line `type` values, top-level keys, and a few raw lines.
- **`sqlite`** — every table's name, columns, and row count (detected by the
  `SQLite format 3` header, not the extension).
- **`json-array`** — the element count and the union of element keys.
- **`json-object`** — the top-level keys (a single config/whole-session object).

Use this to decide whether an existing adapter fits or you need a new one. If
`lore sample` reports a real shape, the source is readable and the PULL path is
viable. To see which sources already have adapters, run `lore index <dir>
--source ?` (any unknown name works) — lore rejects it and lists the registered
sources.

## Step 3 — Make content ingestible

### 3a. Known harness, on-disk transcripts

`lore setup` (the fast path above) auto-detects Claude Code and Codex only. For
any other registered adapter (`openclaw`, `cursor`, `hermes`), or for transcripts
in a non-standard directory, point `lore index` at the directory and name the
source:

```bash
lore index <transcript-dir>                      # default: claude-code adapter
lore index <transcript-dir> --source <name>      # pick a registered adapter
lore index <transcript-dir> --subagents          # include subagent files
lore index <transcript-dir> --no-redact          # keep credentials verbatim (redaction is on by default)
```

Re-running is cheap — unchanged files are skipped by the per-file resume token
(byte offset for JSONL, last row id for databases, content hash for whole-file
sources).

Some harnesses have on-disk transcripts that need periodic catch-up even when a
hook exists or when a hook is suspected stale. Use the incremental live catch-up
command from a harness hook, cron, launchd, task scheduler, or a manual terminal:

```bash
lore sync codex
lore sync claude-code
```

`codex` probes `~/.codex/sessions` first and uses `~/.codex/archived_sessions`
only as a compatibility fallback. `claude-code` probes `~/.claude/projects`.

### 3b. New harness, on-disk transcripts — write a reviewed code adapter

An adapter is one small object satisfying `SourceAdapter`
(`src/adapters/contract.ts`). There is a **single ingestion path**: `ingest`
turns one discovered file into normalized records plus a new resume token.

```ts
interface SourceAdapter {
  readonly source: Source; // must be added to SOURCES in src/core/records.ts first
  discover(root: string): Promise<DiscoveredFile[]>;
  ingest(file: DiscoveredFile, ctx: IngestContext): Promise<IngestResult>;
}
```

You do not implement `ingest` from scratch unless you need to. Pick the shape
that matches the source:

- **Line-oriented (JSONL).** Express only a per-line mapping and wrap it with the
  built-in `lineIngest` helper — it handles streaming, byte offsets, and resume
  for you. Your `LineMapper.parseLine` turns one raw line into either
  `{ kind: "parsed", parsed: { message, toolCalls } }` or
  `{ kind: "skipped", reason }`. Worked examples:
  `src/adapters/codex/parse-line.ts` (flat timeline: tool calls and outputs are
  separate lines, paired by call id) and `src/adapters/openclaw/parse-line.ts`.
- **Database / whole-file.** Implement `ingest` directly: open the source
  read-only, filter to the one session named by the discovered file, and resume
  from `ctx.priorToken` using `planReindex` from
  `src/core/indexer/watermark.ts`. Worked examples: `src/adapters/cursor/`
  (SQLite, honestly text-only for current sampled data — Cursor exposes
  `toolResults` fields but sampled rows were empty, so none is fabricated) and
  `src/adapters/hermes/` (SQLite, real tool calls paired across a flat timeline).

Deterministic procedure:

1. Add the new source name to the built-in `SOURCES` list in `src/core/records.ts`.
   The conformance harness rejects any committed adapter whose `source` is not in
   this list. Push-only harnesses do not need this; they can use any non-empty
   source namespace in their records.
2. Create `src/adapters/<name>/` and model it on the closest worked example
   above. Reuse `computeMessageId` from `src/core/records.ts` so message ids stay
   stable (`hash(sourceFileId + uuid + seq)`).
   - **Stable ids for database sources.** A message id must not shift between
     re-indexes or it will duplicate rows. Line adapters can use the positional
     `seq`. Database / whole-file adapters MUST pass the source's own stable
     primary key (row id, task id) in the `seq` slot — never a positional
     counter — because rows can be inserted, deleted, or reordered.
   - **Be honest about missing fields.** If project, model, branch, or agent are
     not present in the source, set them `null`. Never fabricate a tool call,
     a role, or a field a source does not actually store.
3. **Prove it before registering.** Call `checkAdapterConformance` from
   `src/adapters/conformance.ts` with fixtures from the real format (use a row or
   line you saw via `lore sample`). It returns a structured `ConformanceReport`;
   `report.passed` must be `true`. The checks: declares a known source, discovers
   the sample tree, parses a representative record into a schema-valid message,
   skips a meta record (so `skipped >= 1`), produces a source-keyed and
   stable-yet-distinct message id, and **round-trips a search** — it persists to
   an in-memory store and confirms `expectedText` is findable. Do not register an
   adapter whose report is not green.
4. Register it: add the adapter to the `makeRegistry([...])` builtin list in
   `src/adapters/registry.ts`.
5. `npm run check` must pass (typecheck + lint + format + test). Add a colocated
   `*.test.ts` for the adapter plus a `conformance.test.ts` (model on an existing
   adapter's, e.g. `src/adapters/hermes/conformance.test.ts`).
6. Index: `lore index <dir> --source <name>`.

This is a **reviewed, committed** path: adapter code lives in the repo and goes
through normal review. There is no runtime loader that auto-loads or executes
adapter code from a folder.

### 3c. Live harness, no transcript files — push (zero-setup front door)

Call the `push` MCP tool (or import `pushRecords` from
`src/core/ingest/push.js`) with a normalized batch:

```ts
push({
  sourceFile: { sourceFileId, sessionId, source, /* … */ },
  messages: [ /* MessageRecord[] */ ],
  toolCalls: [ /* ToolCallRecord[] */ ],
});
```

`push` is **data only**. It accepts records, validates every one with Zod at the
boundary, and rejects a malformed batch without writing. It never receives or
executes code — there is no code path by which pushing can run adapter logic.
Pushes are idempotent (keyed upserts), so re-pushing a session does not duplicate
it, and the session rollup is recomputed automatically. This is the fastest way
to get memory working: no clone, no adapter, no rebuild. The same batch shape is
available straight from the CLI as `lore push` (see the parent skill).

## Step 4 — Read your memory back

Indexed content is queryable two ways. Start with the CLI: it needs nothing
running, so it's the fastest confirmation that ingestion worked and the everyday
way to pull a memory back from a shell or a script.

### 4a. Server-free: the `lore search` / `lore sessions` CLI

`lore search` opens the store read-only and runs the same bm25 keyword search the
MCP `search_memory` tool does — no server, no client, no registration. This is
the always-available path.

```bash
lore search "<query>"                        # keyword search across every source
lore search "<query>" --source <name>        # scope to one harness namespace
lore search "<query>" --json                 # same { count, hits } envelope as MCP
```

Every search filter the MCP tool takes is a flag here: `--project`, `--branch`,
`--source`, `--agent`, `--skill`, `--tool`, `--role`, `--model`, `--since`,
`--until`, `--limit`. Each hit leads with its `message id` and `session` so you
can drill in. The full drill-down loop (`lore get`, `lore context`,
`lore session`) lives in the parent skill.

To narrow to a single conversation, find the session first, then scope to it:

```bash
lore sessions --source <name> --limit 20     # session rollups, newest first
lore search "<query>" --session <session-id> # everything matching, in that one session
```

`lore sessions` lists rollups (message count, project, time span) so you can spot
the conversation you mean; copy its id straight into `lore search --session`.
Both commands fail clean with a "run `lore setup` or `lore index` first" message
if there's no store yet, and both read a store another process may be writing to
(WAL makes concurrent readers safe), so they work whether or not a server or
another harness is live.

### 4b. Serve over MCP

For clients that speak MCP, run the server over stdio:

```bash
lore serve            # MCP server over stdio
```

Register that command in your client (this is exactly what `lore setup` prints at
the end). lore never edits another tool's config — every client's format differs,
so you apply the block for your own harness:

- **Claude Code:** `claude mcp add lore -- lore serve`
- **Codex** (`~/.codex/config.toml`):
  ```toml
  [mcp_servers.lore]
  command = "lore"
  args = ["serve"]
  ```
- **Cursor / Cline / any other MCP client** (stdio server entry):
  ```json
  { "mcpServers": { "lore": { "command": "lore", "args": ["serve"] } } }
  ```

Then reload: most clients only load MCP tools at session start, so start a new
session (some expose a reload command that reseeds in place). A running session
cannot register its own tools mid-flight.

## Step 5 — Wire freshness hooks (optional but recommended)

Backfill gets history into Lore; hooks keep the current session fresh. Choose the
reference that matches the harness:

- **Claude Code:** [`claude-code-hooks.md`](claude-code-hooks.md) uses
  `lore hook` because Claude Code emits a `transcript_path` payload.
- **Codex:** [`codex-hooks.md`](codex-hooks.md) uses Codex `notify` plus
  `lore sync codex` because Codex does not emit a `transcript_path` payload.
- **Any unlisted harness:** [`other-harness-hooks.md`](other-harness-hooks.md)
  explains how to decide between `lore hook`, `lore index`, a dedicated sync, or
  live `lore push`.

## Step 6 — Verify (this is the proof)

Confirm the new source is actually searchable. The CLI is the cleanest proof
because it needs nothing running — with no MCP server up, run:

```bash
lore search "<a word you know is in a session>" --source <name>
```

and confirm you get hits whose `source` is `<name>`. (If you registered the
server in Step 4b, `search_memory` with
`{ "source": "<name>", "query": "<…>" }` should return the same hits — they read
the same store.) A green search against the new namespace — produced by following
this reference cold, with no server in the loop — is the proof that the harness is
onboarded.

## Checklist

- [ ] `lore help` works (installed + built)
- [ ] If Claude Code / Codex on this machine: `lore setup` ran, indexed, and
      reported `Search self-check: OK`
- [ ] `lore sample <dir>` ran; `kind` and shape understood (JSONL / SQLite / JSON)
- [ ] Ingestion path chosen (PULL/index for on-disk, or PUSH for live/zero-setup)
- [ ] If new adapter: source added to `SOURCES`, modeled on the matching worked
      example, honest about missing fields, `checkAdapterConformance` green,
      registered, colocated tests added, `npm run check` passes
- [ ] If push: batch validated and accepted (data only, no code executed)
- [ ] Content indexed/pushed
- [ ] Server-free read works: `lore search "<word>" --source <name>` returns hits
      with no MCP server running (use `lore sessions` + `--session` to scope to one
      conversation)
- [ ] If a client needs MCP: `lore serve` wired in, and `search_memory` returns
      the same hits for the new `source`
