---
name: lore
description: Use to recall anything from past agent sessions with the server-free `lore` CLI — the "what did we decide", "how did we build X", "why did we drop Y", "find that earlier conversation", "pull context from my last session" task. Trigger whenever you need memory of prior work (yours or another harness's) — searching transcripts by keyword or recency, reading a remembered message back in full, seeing what surrounded it, skimming or jumping around a past session, listing recent sessions, or charting when a project was active. Also covers writing new memory in live (`lore push`) and pointing at the indexing/adapter setup. lore is a local SQLite store; this skill drives it entirely through the CLI, so NOTHING here needs the MCP server running. Reach for this skill even when the user just says "remember", "recall", "last time", "previously", or "search my history" without naming lore.
---

# lore

`lore` is your long-term memory: a local SQLite + FTS5 store of agent session
transcripts at `~/.lore/lore.db`, shared by every harness on this machine
(`claude-code`, `codex`, `cursor`, …). This skill drives the **whole app from the
CLI**. The `lore` command opens the SQLite file directly, so every task here —
find, read back, navigate, write — works with **no server and no client**. The
MCP server (`lore serve`) is just one more reader of the same store; you never
need it to use lore.

If `lore help` errors, the CLI isn't installed yet — that's the onboarding job,
not this one. Use the **`lore-setup`** skill to install, index a harness, or
teach lore a new format, then come back here to use what you indexed.

## The one rule that governs everything: drill down, never dump

A session can be thousands of messages — millions of tokens. **Never pull a whole
session into context.** Every command here returns a bounded amount on purpose;
your job is to narrow from a broad question to the few messages that actually
answer it. The loop is always the same, and it is self-threading:

```
broad words  ──▶  lore search        ──▶  output hands you real ids
                                            (message <id>, session <id>)
                          │
        pick the id you want  ─────────────┘
                          ▼
   lore get <id> --full        (read that one message in full)
   lore context <id>           (see what surrounded it)
   lore session <id> --around <id>   (jump into that spot in the session)
```

**You never invent an id.** Every id you pass to `get` / `context` / `session`
came verbatim out of a previous command's output. Searching is how you discover
ids; the drill-down commands are how you spend them. If you catch yourself about
to page through an entire session to "find" something, stop — that's what
`lore search --session <id>` is for.

Lead with the narrowest query that could work. Broaden (drop filters, switch to
`--relevant`) only if it comes back empty. Reading one message in full beats
skimming fifty snippets.

## Find — `lore search`

Keyword search (bm25) across every indexed session. This is the front door:

```bash
lore search "fts tokenizer"                  # keyword search, newest-ranked by relevance
lore search "fts tokenizer" --relevant       # blend keyword strength with recency
lore search "alamo" --json                   # { count, hits } — same envelope as MCP search_memory
```

Each hit leads with its `message <id>` and `session <id>` — those are the keys
you drill with next. Snippets are elided; pull the full text with `lore get
<id> --full`.

**Filters** (all optional, combine freely):

| flag | scopes to |
|------|-----------|
| `--project <path>` | one repo/project |
| `--source <name>` | one harness namespace (`claude-code`, `codex`, …) |
| `--session <id>` | one conversation (everything matching, inside it) |
| `--branch <name>` | one git branch |
| `--agent <name>` / `--skill <name>` / `--tool <name>` | messages that used a named agent/skill/tool |
| `--role user\|assistant\|system` | one speaker |
| `--model <name>` | one model |
| `--since <iso>` / `--until <iso>` | a time window |
| `--limit <n>` | cap the hit count |

`--relevant` reranks by keyword strength × recency (`1/(1+ageHours)`), so a fresh
memory beats an old one with the same words. It honors **every** filter above —
including `--session`, which makes it a strict superset of the MCP
`find_relevant` tool. Use it for "what did I do *recently* about X"; use plain
`search` for "find the best keyword match, whenever it happened."

## Read back — `lore get`, `lore context`

Once search hands you an id, read it:

```bash
lore get <message-id>                 # elided snippet (cheap)
lore get <message-id> --full          # the complete stored text
lore get <message-id> --json          # the message detail object (MCP get_message shape)
```

To see what was happening *around* a message — the question that prompted an
answer, the reply that followed a decision:

```bash
lore context <message-id>                       # 5 before / 5 after, anchor flagged with >
lore context <message-id> --before 2 --after 8  # asymmetric window
lore context <message-id> --json                # { messages } (MCP get_context shape)
```

An unknown id returns `{ "error": "not_found", "message_id": "…" }` and a
non-zero exit — the same envelope MCP gives, so a script can branch on it.

## Navigate — `lore session`, `lore sessions`, `lore timeline`

**Skim or jump within one session.** `lore session` walks a session's folded
timeline (primary + subagent messages interleaved in real time) a *bounded page*
at a time. It never dumps — a cursor carries you forward:

```bash
lore session <session-id>                          # first page (default 30, capped at 40)
lore session <session-id> --limit 40 --cursor <c>  # next page; <c> came from the prior page's output
lore session <session-id> --around <message-id>    # jump straight to a known message's neighborhood
lore session <session-id> --around <message-id> --before 10 --after 10
```

The human output trails each page with the exact `--cursor` command to continue.
`--json` gives `{ messages, nextCursor }` (paged) or `{ messages }` (`--around`),
matching MCP `get_session`. Prefer `--around` over page-walking: if search already
gave you the id you care about, jump to it instead of reading from the top.

**List recent conversations** to find a session id when you don't have one:

```bash
lore sessions                                  # rollups, newest first
lore sessions --project <path> --source codex --limit 20
lore sessions --json                           # { count, sessions } (MCP list_sessions shape)
```

Each rollup shows message count, project, and time span. Copy a `sessionId`
straight into `lore search --session <id>` or `lore session <id>`.

**Chart activity over time** — useful for picking a `--since/--until` window or
spotting when a project was hot:

```bash
lore timeline                                  # message counts bucketed by day
lore timeline --bucket hour --project <path>   # finer grain, one project
lore timeline --json                           # { buckets } (MCP timeline shape)
```

## Write memory in live — `lore push`

To add a session that has no on-disk transcript (a live process, a homegrown
tool), pipe one normalized JSON batch to `lore push`:

```bash
echo "$BATCH_JSON" | lore push
cat batch.json | lore push
```

The batch is `{ sourceFile, messages, toolCalls }` (the exact shape of the MCP
`push` tool). It's validated whole at the boundary and written idempotently —
re-pushing the same batch never duplicates. On success it prints the write result
(`{ sourceFileId, sessionId, messages, toolCalls }`) and exits 0. On a malformed
batch it prints `{ "error": "invalid_batch", "detail": "…" }` and exits non-zero,
so a caller can tell a rejected write from an accepted one. `push` is **data
only** — it never receives or runs code.

For the record shapes, see `src/core/records.ts`; for when to push vs. write an
adapter, see the `lore-setup` skill (PUSH vs PULL decision).

## Index & teach new formats — defer to `lore-setup`

This skill is about *using* what's indexed. Getting transcripts *into* lore —
`lore setup` (auto-detect Claude Code / Codex), `lore index <dir>`, `lore sample
<dir>`, `lore hook` (compaction capture), and **writing a reviewed code adapter
for a brand-new harness** (the `checkAdapterConformance` round-trip) — is the
`lore-setup` skill's job. Don't duplicate that procedure; invoke that skill when
the answer is "the thing I want isn't indexed yet."

Quick reference only:

```bash
lore setup            # detect known harnesses here, index, self-verify, print MCP registration
lore index <dir> [--source <name>] [--subagents] [--redact]
lore sample <dir>     # summarize an unknown transcript dir's on-disk format
```

## Understand the store (so you can extend it)

One SQLite file, queryable read-only while another process writes (WAL). Three
ids, deliberately distinct:

- **`source_file_id`** — one physical transcript file (the ingest/watermark unit).
- **`session_id`** — one logical conversation, shared by a primary file and its
  subagent files. This is what folds primary + subagent messages into a single
  timeline.
- **`message_id`** — a synthetic hash of `(source_file_id + uuid + seq)`; `uuid`
  alone collides across and within files, so it is never the key.

Tables: `source_files`, `sessions` (rollups: project, branch, first/last
timestamp, message_count), `messages` (role, timestamp, project, branch, model,
agent, skill, text, text_truncated), `tool_calls` (input/result/is_error, linked
to their `message_id`), and a `messages_fts` FTS5 external-content table kept in
sync by triggers. The tokenizer keeps `_-.` as token chars, so identifiers and
paths (`getUserById`, `foo.bar.ts`, `trust-metadata`) are searchable as whole
tokens — search for the symbol, not a fragment. Full schema:
`src/core/store/schema.ts`.

`LORE_DB` overrides the store path (default `~/.lore/lore.db`) — handy for
pointing at a fixture store in tests.

## CLI ⇄ MCP parity (why the server is unnecessary)

Every `--json` output is byte-shaped like the matching MCP tool's response, so
"the CLI does what the server does" is verifiable, not asserted:

| task | CLI | MCP tool | `--json` envelope |
|------|-----|----------|-------------------|
| keyword find | `lore search` | `search_memory` | `{ count, hits }` |
| recency find | `lore search --relevant` | `find_relevant` | `{ count, hits }` |
| one message | `lore get` | `get_message` | detail obj / `{ error: "not_found", message_id }` |
| neighbors | `lore context` | `get_context` | `{ messages }` / not_found |
| session page | `lore session` | `get_session` | `{ messages, nextCursor }` |
| session list | `lore sessions` | `list_sessions` | `{ count, sessions }` |
| activity | `lore timeline` | `timeline` | `{ buckets }` |
| write | `lore push` | `push` | result / `{ error: "invalid_batch", detail }` |

## Worked recipes

**"What did we decide about the FTS tokenizer?"**
```bash
lore search "fts tokenizer" --relevant          # → hit with message <id>, session <id>
lore get <message-id> --full                    # read the decision in full
lore context <message-id> --before 3 --after 3  # see the reasoning around it
```

**"Pull up my last session in this repo and find where we touched auth."**
```bash
lore sessions --project "$PWD" --source claude-code --limit 5   # newest first → grab a session id
lore search "auth" --session <session-id>                       # only auth hits, inside it
lore session <session-id> --around <message-id>                 # jump to that spot, read forward
```

**"When was this project active, and what happened in May?"**
```bash
lore timeline --project "$PWD"                                  # spot the busy buckets
lore search "<topic>" --project "$PWD" --since 2026-05-01 --until 2026-06-01
```

## Checklist

- [ ] `lore help` works (else use `lore-setup` to install)
- [ ] Started from a search; used the ids it handed back (never invented one)
- [ ] Narrowed with filters / `--around` instead of paging a whole session
- [ ] Read the few right messages in full rather than skimming many snippets
- [ ] Did it all with no MCP server running
