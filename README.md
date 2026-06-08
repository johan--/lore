# 📖 Lore

### Shared, full-fidelity, session history for every AI agent you use.

**Any Agent. Any Session. Any Turn. Anytime.**

The session you ran in Claude Code this morning, Openclaw can pull up this afternoon.
The gnarly debugging thread Cursor worked through last week, Hermes can read
like it was sitting right there. Lore gives all of your coding agents one shared
memory: across every tool, across every session, and it never expires. 

That is the part most "agent memory" misses. Other tools remember things for one
agent, inside one app. Lore makes every session any of your agents has ever had
searchable by any other agent, anytime. What Codex figured out, Claude Code knows.
What you solved on Tuesday is one search away on Friday, in whatever agent you
happen to be in.

And yes, it survives compaction. When a context window fills up and compacts, the
work isn't gone, it's sitting right there on disk. Lore just makes it reachable
again, fully searchable, right where your agents work. Local, private, and yours
forever.



https://github.com/user-attachments/assets/b5c0f077-47da-4502-bf78-2ce08abf034f

*Inspired by [RLM](https://arxiv.org/abs/2512.24601)*

## ✨ Why you'll want it

- 🔀 **One memory, every agent.** Claude Code, Codex, and Cursor all read
  and write the same store. A session in one agent is instantly readable by all
  the others. What Codex figures out, Claude Code knows.
- 🧠 **It outlives the context window.** Compaction stops meaning amnesia.
  Last week's reasoning is one search away.
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


## 🛠️ Install it yourself

```bash
npm install -g @jordanhindo/lore   # puts the `lore` command on your PATH
```

Requires Node 22+. That's the whole install. `lore setup` (below) takes it from
here. If `npm install` chokes on `better-sqlite3`, or `lore` isn't found
afterward, the [Troubleshooting](AGENT-ONBOARD.md#troubleshooting-when-step-1-or-2-fails)
section has you covered (Windows included).

### From source

Cloning is for contributors, or for writing a new adapter (which needs the
source tree):

```bash
git clone https://github.com/jordanhindo/lore && cd lore
npm install
npm run build
npm link        # optional: puts `lore` on your PATH
```

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

### What a search returns

Your agent calls `search_memory` with a query (plus any filters) and gets back a
count and a ranked list of hits. Each hit carries the matched text and full
provenance, so the agent knows _where_ the memory came from and can pull the rest
with `get_message`:

```jsonc
// search_memory({ query: "fts tokenizer", source: "claude-code", limit: 2 })
{
  "count": 2,
  "hits": [
    {
      "messageId": "9f3c…a71b",          // synthetic, stable across re-index
      "sessionId": "0c1d2e3f-…",
      "sourceFileId": "claude-code:…",
      "role": "assistant",
      "timestamp": "2026-06-05T18:22:41.103Z",
      "project": "/Users/you/lore",
      "branch": "main",
      "model": "claude-opus-4",
      "agent": null,
      "score": 11.27,                       // higher is a better match (bm25)
      "text": "Switched the FTS5 tokenizer to unicode61 with tokenchars '_-.' so getUserById and foo.bar.ts stay whole…",
      "textTruncated": false
    }
    // …one more hit
  ]
}
```

Long messages come back elided with a marker telling the agent how to fetch the
full text via `get_message(message_id, full=true)` — so one giant transcript can
never blow the context window.

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
