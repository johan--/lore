# recall

Full-fidelity, searchable memory of agent session transcripts, exposed over MCP.

Agents lose their context when a session compacts or ends. The work is still on
disk — every harness writes a verbatim transcript — but it's unreachable once the
window is gone. `recall` indexes those transcripts into a local SQLite + FTS5
store and serves them back over the Model Context Protocol, so an agent can
search and re-read its own past sessions long after the conversation scrolled
away.

It is **local-only**. The store lives at `~/.recall/recall.db`, outside any repo
and gitignored by default. Transcript content never leaves your machine.

## How it works

- **One shared store, many harnesses.** Each harness writes into its own `source`
  namespace (`claude-code`, `codex`, …). Any MCP client can read everyone's
  history.
- **Three IDs.** A `source_file_id` is a physical transcript file (the unit of
  ingestion and the resume watermark). A `session_id` is a logical session shared
  across a primary file and its subagent files. Each message gets a synthetic
  `message_id = hash(source_file_id + uuid + seq)` because raw uuids collide.
- **Incremental by construction.** A per-file watermark skips unchanged files,
  appends only new tails, and fully re-indexes rewritten files. Re-running a
  backfill over thousands of transcripts only touches what changed.
- **Code-aware search.** The FTS5 tokenizer keeps identifiers and paths like
  `getUserById`, `foo.bar.ts`, and `trust-metadata` retrievable as whole tokens.

## Install

```bash
npm install
npm run build
npm link        # optional: puts `recall` on your PATH
```

Requires Node 22+.

## Backfill your history

Point `recall index` at a transcript directory. For Claude Code that's
`~/.claude/projects`:

```bash
recall index ~/.claude/projects              # primary transcripts
recall index ~/.claude/projects --subagents  # include subagent transcripts
recall index ~/.claude/projects --redact     # opt-in secret redaction (see below)
```

Other harnesses are selected with `--source`. Codex ships built-in:

```bash
recall index ~/.codex/archived_sessions --source codex
```

Re-run it any time — unchanged files are skipped, so repeat runs are cheap.

## Onboard another harness

Don't see your harness? `recall sample <transcript-dir>` summarizes its on-disk
format, and the bundled **recall-setup** skill (`skills/recall-setup/`) walks an
agent deterministically from "installed" to "my sessions are searchable" —
including writing and proving a new adapter, or using the live `push` path when a
harness has no transcript files. Self-setup is the proof it works.

## Serve it to an MCP client

`recall serve` starts the MCP server over stdio. Point any MCP client at it.

**Claude Code** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "recall": { "command": "recall", "args": ["serve"] }
  }
}
```

**Cursor / Cline** (and other clients) — add an stdio server entry with the same
`command` / `args` shape in the client's MCP config.

### Tools exposed

| Tool            | What it does                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `search_memory` | Keyword search across all transcripts, ranked by bm25, with filters.   |
| `find_relevant` | Like `search_memory` but blends relevance with recency.                |
| `get_message`   | Fetch one message by id (`full=true` returns the un-elided text).      |
| `get_context`   | Neighbor window around an anchor message.                              |
| `get_session`   | One logical session as a folded, paginated timeline.                  |
| `list_sessions` | Session rollups (counts, first/last activity), filterable.            |
| `timeline`      | Bucketed activity over time (day or hour).                            |

All search tools accept dimension filters: `project`, `branch`, `source`,
`agent`, `skill`, `tool`, `role`, `model`, `since`, `until`, `limit`.

## Survive compaction

Index the live session right before context is wiped by wiring `recall hook` into
your harness's lifecycle hooks. The command reads the hook payload on stdin,
extracts `transcript_path`, indexes just that file, and always exits 0 (it never
crashes the harness).

For Claude Code, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "recall hook" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "recall hook" }] }]
  }
}
```

## Privacy

- The store is local (`~/.recall/recall.db`), outside any repo, and `*.db` is
  gitignored. Override the location with `RECALL_DB`.
- Transcripts are indexed **verbatim by default** — recall is your own memory, so
  nothing is dropped unless you ask.
- **Opt-in redaction.** Pass `--redact` to `recall index` / `recall hook` to run a
  conservative credential redactor over message text and tool payloads before
  they're stored (OpenAI/GitHub/AWS/Slack keys, Bearer tokens, PEM private key
  blocks). It's a safety net, not a guarantee.

## Environment

| Var               | Default                | Meaning                          |
| ----------------- | ---------------------- | -------------------------------- |
| `RECALL_DB`       | `~/.recall/recall.db`  | Store location.                  |
| `RECALL_LOG_LEVEL`| `info`                 | `debug` / `info` / `warn` / `error`. |

## Development

```bash
npm run check   # typecheck + lint + format + test
npm run test:watch
```

License: MIT.
