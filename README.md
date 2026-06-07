# 📖 Lore

### Lightweight MCP for infinite agent memory.

**Any agent. Any session. Anytime.**

Your agents forget everything the moment a session compacts or ends. You spend an
hour getting one deep into a gnarly problem, the window fills up, and suddenly
it's a stranger again. So you re-explain the thing you already explained. The work
isn't gone, it's sitting right there on disk. It's just unreachable.

Lore fixes that. It quietly indexes every session your agents have ever had and
hands it back, fully searchable, right where they work. An agent can pull up a
decision from last Tuesday as easily as the line it just wrote. Local, private,
and yours forever.

## ✨ Why you'll want it

- 🧠 **Memory that outlives the context window.** Compaction stops meaning amnesia.
  Last week's reasoning is one search away.
- 🔀 **One brain, every agent.** Claude Code, Codex, Cursor, and Cline all read and
  write the same store. What one figured out, the others can find.
- 🔍 **Search that speaks code.** `getUserById`, `foo.bar.ts`, and `trust-metadata`
  stay findable as whole words, not shredded into noise.
- 🔒 **Local by default.** Everything lives at `~/.lore/lore.db` on your
  machine. Nothing phones home. Ever.

## 🚀 Quick start (paste this into your agent)

Lore sets itself up. Drop the blurb below into any coding agent. It clones the
repo, installs Lore, indexes your own history, registers itself into _its own_
MCP config, figures out the reload step for your client, and proves search works
before it calls itself done.

```
Clone https://github.com/jordanhindo/lore into a directory of your choosing
and cd into it, then set up Lore (full-fidelity session memory over MCP)
for yourself. Read AGENT-ONBOARD.md in the repo you just cloned and follow
it top to bottom: install + build, run `lore setup` to index my history
and self-verify, register the Lore MCP server in your own client config,
reload so the tools load, then prove it by calling search_memory for a word
from a past session. Tell me any manual step (like restarting) that I have
to do.
```

The deterministic recipe the agent follows lives in
[`AGENT-ONBOARD.md`](AGENT-ONBOARD.md). Prefer to drive it yourself? The one
command that does the indexing half is `lore setup` (below).

> The fact that Lore can onboard _itself_, on a machine it's never seen, is the
> demo. If an agent can stand it up from a paste, it works.

## 🛠️ Install it yourself

```bash
npm install
npm run build
npm link        # optional: puts `lore` on your PATH
```

Requires Node 22+. If `npm install` chokes on `better-sqlite3`, or `lore`
isn't found after linking, the [Troubleshooting](AGENT-ONBOARD.md#troubleshooting-when-step-1-or-2-fails)
section has you covered (Windows included).

## 📥 Backfill your history

`lore setup` is the fast path. It sniffs out the harnesses on your machine,
indexes each one, checks that search works, and prints how to wire Lore into
your MCP client.

```bash
lore setup
```

Want finer control? Point `lore index` at a transcript directory. For Claude
Code that's `~/.claude/projects`:

```bash
lore index ~/.claude/projects              # primary transcripts
lore index ~/.claude/projects --subagents  # include subagent transcripts
lore index ~/.claude/projects --redact     # opt-in secret redaction (see Privacy)
```

Other harnesses come in with `--source`. Codex is built in:

```bash
lore index ~/.codex/sessions --source codex
```

Re-run any of these whenever. Unchanged files get skipped, so repeat runs are
cheap.

## 🔌 Serve it to your client

`lore serve` starts the MCP server over stdio. Point any MCP client at it.

**Claude Code** (add to `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "lore": { "command": "lore", "args": ["serve"] }
  }
}
```

**Cursor / Cline** and friends: add an stdio server entry with the same
`command` / `args` shape in the client's MCP config.

### What your agent can do

| Tool            | What it does                                                          |
| --------------- | -------------------------------------------------------------------- |
| `search_memory` | Keyword search across every transcript, ranked by bm25, with filters. |
| `find_relevant` | Like `search_memory`, but blends relevance with recency.             |
| `get_message`   | Fetch one message by id (`full=true` returns the un-elided text).    |
| `get_context`   | The neighbor window around an anchor message.                        |
| `get_session`   | One logical session as a folded, paginated timeline.                 |
| `list_sessions` | Session rollups (counts, first / last activity), filterable.         |
| `timeline`      | Bucketed activity over time, by day or hour.                         |

Every search tool takes the same dimension filters: `project`, `branch`,
`source`, `agent`, `skill`, `tool`, `role`, `model`, `since`, `until`, `limit`.

## 🪄 Survive compaction

Compaction is the moment memory matters most, so catch the session right before
the window gets wiped. Wire `lore hook` into your harness's lifecycle hooks. It
reads the hook payload on stdin, indexes just that one file, and always exits 0
(it will never crash your harness).

For Claude Code, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "lore hook" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "lore hook" }] }]
  }
}
```

## 🧩 Bring your own harness

Don't see your agent on the list? `lore sample <transcript-dir>` summarizes its
on-disk format, and the bundled **lore-setup** skill (`skills/lore-setup/`)
walks an agent from "installed" to "my sessions are searchable," including writing
and proving a new adapter, or using the live `push` path when a harness keeps no
files at all.

## 🔒 Privacy

- The store is local (`~/.lore/lore.db`), lives outside any repo, and `*.db`
  is gitignored. Move it with `LORE_DB`.
- Transcripts are indexed **verbatim by default.** It's your own memory, so
  nothing gets dropped unless you ask.
- **Opt-in redaction.** Pass `--redact` to `lore index` / `lore hook` and a
  conservative credential scrubber runs over message text and tool payloads first
  (OpenAI / GitHub / AWS / Slack keys, Bearer tokens, PEM private-key blocks).
  Think of it as a safety net, not a guarantee.

## 🧬 How it works under the hood

- **One shared store, many harnesses.** Each harness writes into its own `source`
  namespace (`claude-code`, `codex`, ...). Any MCP client can read everyone's
  history.
- **Three IDs.** A `source_file_id` is a physical transcript file (the unit of
  ingestion and the resume watermark). A `session_id` is a logical session shared
  across a primary file and its subagent files. Each message gets a synthetic
  `message_id = hash(source_file_id + uuid + seq)` because raw uuids collide.
- **Incremental by construction.** A per-file watermark skips unchanged files,
  appends only new tails, and fully re-indexes rewritten ones. Re-running a
  backfill over thousands of transcripts only touches what changed.
- **Code-aware search.** The FTS5 tokenizer keeps identifiers and paths whole, so
  the things you actually search for stay searchable.

## ⚙️ Environment

| Var                | Default               | Meaning                              |
| ------------------ | --------------------- | ------------------------------------ |
| `LORE_DB`        | `~/.lore/lore.db` | Store location.                      |
| `LORE_LOG_LEVEL` | `info`                | `debug` / `info` / `warn` / `error`. |

## 👷 Development

```bash
npm run check   # typecheck + lint + format + test
npm run test:watch
```

License: MIT.
