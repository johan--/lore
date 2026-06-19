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

- 🔀 **One memory, every agent.** Claude Code, Codex, openclaw, Cursor, and
  Hermes histories all land in one store, and any MCP client reads it. A session
  in one agent is instantly readable by all the others. What Codex figures out,
  Claude Code knows.
- 🧠 **It outlives the context window.** Compaction stops meaning amnesia.
  Last week's reasoning is one search away.
- 🔍 **Search that speaks code.** `getUserById`, `foo.bar.ts`, and `trust-metadata`
  stay findable as whole words, not shredded into noise.
- 🔒 **Local by default.** Everything lives at `~/.lore/lore.db` on your
  machine. Nothing phones home. Ever.

## 🚀 Quick start (paste this into your agent)

Lore sets itself up. Drop the blurb below into any coding agent. It installs
Lore, indexes your own history, and proves search works before it calls itself
done — all server-free, no MCP registration required.

```
Set up Lore (full-fidelity session memory) for yourself. Install it with
`npm install -g @jordanhindo/lore`, then run `lore setup` to index my
history and self-verify. Prove it by running `lore search` for a word from
a past session and showing me a hit. The MCP server is optional — only
register it (`lore serve`) if you specifically want MCP tool calls instead
of the CLI; if you do, tell me the reload step I have to do.
```

The deterministic recipe the agent follows lives in
[`AGENT-ONBOARD.md`](AGENT-ONBOARD.md), which keeps MCP registration as an
optional step. Prefer the skill instead? `npx skills add jordanhindo/lore`
(below) drops in the self-bootstrapping `lore` skill, which does all of this the
next time you ask it to recall something.


## 🛠️ Install it yourself

**Recommended — install the skill (it sets up the rest):**

```bash
npx skills add jordanhindo/lore
```

This drops the bundled **`lore` skill** into your agent (`~/.claude/skills/`). The
skill is self-bootstrapping: the next time you ask your agent to "remember" /
"recall" something or to "set up lore", it reads its own `references/setup/index.md`,
installs the `lore` CLI, indexes your history, and proves search works — no MCP
server required. One command installs the whole thing.

**Or install the CLI directly:**

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
lore index ~/.claude/projects --no-redact  # keep credentials verbatim (see Privacy)
```

Other harnesses come in with `--source`. Codex, openclaw, Cursor, and Hermes are
all built in:

```bash
lore index ~/.codex/sessions --source codex
lore index ~/.openclaw/sessions --source openclaw
lore index ~/.cursor --source cursor     # reads Cursor's SQLite state store
lore index ~/.hermes --source hermes     # reads Hermes's SQLite state store
```

Cursor and Hermes keep their history in a SQLite database rather than JSONL
files; point `lore index` at the directory and the adapter reads the store
directly. Current sampled Cursor rows expose `toolResults` fields but only empty
arrays, so the Cursor adapter indexes text only and fabricates no tool calls.

Re-run any of these whenever. Unchanged files get skipped, so repeat runs are
cheap.

Codex does not currently provide a Lore-compatible lifecycle hook. For active
Codex Desktop sessions, use the dedicated incremental sync command from its
`notify` hook, cron, launchd, or a manual terminal:

```bash
lore sync codex
```

It indexes `~/.codex/sessions` incrementally, with `~/.codex/archived_sessions`
only as a compatibility fallback.

## 💻 Recall from the CLI — no server required

You don't need the MCP server to use Lore. The `lore` command opens the SQLite
store directly, so **search, read-back, navigation, and writing all work
server-free** — anywhere you have a shell. The MCP server (below) is just one more
reader of the same store; nothing here depends on it.

The loop is always the same: **drill down, never dump.** A session can be millions
of tokens, so you never page a whole one into context. Search broadly, take the
real ids it hands back (you never invent one), then spend them:

```bash
lore search "fts tokenizer" --relevant     # → hits, each leading with a message + session id
lore get <message-id> --full               # read that one message in full
lore context <message-id>                  # 5 before / 5 after, anchor flagged
lore session <session-id> --around <message-id>   # jump to that spot, read forward
```

Other commands round out the loop — `lore sessions` (recent conversations),
`lore timeline` (activity by day/hour), and `lore push` (add a live session from a
JSON batch on stdin). Add `--json` to any of them for a machine-readable envelope.
Every search filter the MCP tools accept works here too (`--project`, `--source`,
`--session`, `--branch`, `--agent`, `--skill`, `--tool`, `--role`, `--model`,
`--since`, `--until`, `--limit`).

**CLI ⇄ MCP parity is proven, not asserted.** Each `lore … --json` envelope is
byte-for-byte identical to the matching MCP tool's response, verified by a parity
test suite that runs both paths against one shared fixture store. So the CLI is a
faithful stand-in for the server:

| task | CLI | MCP tool | `--json` envelope |
|------|-----|----------|-------------------|
| keyword search | `lore search` | `search_memory` | `{ count, hits }` |
| recency-blended search | `lore search --relevant` | `find_relevant` | `{ count, hits }` |
| one message | `lore get` | `get_message` | detail obj / `{ error, message_id }` |
| neighbors | `lore context` | `get_context` | `{ messages }` |
| session page | `lore session` | `get_session` | `{ messages, nextCursor }` |
| session list | `lore sessions` | `list_sessions` | `{ count, sessions }` |
| activity | `lore timeline` | `timeline` | `{ buckets }` |
| write | `lore push` | `push` | result / `{ error, detail }` |

The bundled **`lore` skill** (`skills/lore/`) teaches an agent to drive this whole
loop — when to search, which id to spend, and how to drill down instead of
dumping. It's self-bootstrapping: its `references/setup/index.md` covers getting history
indexed in the first place (install, index/backfill a harness, write an adapter,
or push), so one `npx skills add jordanhindo/lore` installs the whole thing.


## Agent Workflow Skills

The low-level `skills/lore/` skill teaches agents how to install Lore, index transcripts, search memory, drill into message ids, and use the MCP server when a harness supports it. The workflow pack sits above that substrate:

- `lore:recall` maps to `skills/lore-recall/`. It plans bounded retrieval, checks `lore status --json`, labels freshness, drills into context windows, and emits cited evidence packets instead of transcript dumps.
- `lore:brief` maps to `skills/lore-brief/`. It defaults to the rolling last 24 hours, summarizes completed/open work, and proposes follow-up skills, jobs, issues, fixes, tasks, memory cards, or wiki updates without performing them.
- `lore:handoff` maps to `skills/lore-handoff/`. It creates compact continuation packets with verified/open/stale/risky sections, artifacts, shared proposal objects, memory-card candidates, contradiction candidates, and next actions.
- `lore:dev-verification` maps to `skills/lore-dev-verification/`. It is the project-specific verification gate for Lore repo changes: CLI/MCP parity, store compatibility, adapter fidelity, privacy/destructive-memory behavior, package smoke, and workflow-skill eval proof.

These are installable skill bundles, not one-file prompt snippets. Each workflow skill includes `SKILL.md`, references, examples, eval specs, validator scripts where structure is deterministic, and `evals/test-report.md`. A workflow skill is not complete until its test report proves the eval/review pass ran and the bundle validator passes.

There is no universal plugin wrapper in this release. A future plugin could bundle names such as `lore:recall`, `lore:brief`, and `lore:handoff`, but today the shipped surface is the package `skills/` tree plus the `lore` CLI/MCP substrate. Workflow skills may propose actions; they must not create jobs, edit prompts, update wiki pages, create tasks, modify code, or run destructive memory operations unless the user explicitly asks for that next step.

Packaging proof lives in:

```bash
npm run package:smoke
```

That smoke builds the CLI, preserves executable mode for `dist/cli/lore.js`, validates package dry-run metadata, packs a real tarball, reads the workflow skill folders from the packaged tree, checks non-hollow test-report headings, and verifies the packaged CLI help can run with dependencies present.

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
      "source": "claude-code",            // harness namespace the hit came from
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

Compaction is the moment memory matters most, so catch fresh session content
before it disappears from the active context. The exact hook differs by harness:
Claude Code can call `lore hook` from `PreCompact` / `SessionEnd`; Codex should
call `lore sync codex` from its `notify` hook or a timer because it writes a
session tree rather than a `transcript_path` hook payload.

The skill setup references carry the exact recipes:
[`skills/lore/references/setup/claude-code-hooks.md`](skills/lore/references/setup/claude-code-hooks.md),
[`skills/lore/references/setup/codex-hooks.md`](skills/lore/references/setup/codex-hooks.md),
and
[`skills/lore/references/setup/other-harness-hooks.md`](skills/lore/references/setup/other-harness-hooks.md).

## 🧩 Bring your own harness

Don't see your agent on the list? `lore sample <transcript-dir>` summarizes its
on-disk format — it recognizes JSONL, SQLite databases (read via the file header,
never by loading the DB), and whole-file JSON — so you can see an unknown
harness's shape before writing anything. The bundled **`lore` skill**'s
`references/setup/index.md` (`skills/lore/references/setup/index.md`) walks an agent from
"installed" to "my sessions are searchable," including writing and proving a new
adapter, or using the live `push` path when a harness keeps no files at all.
`push` is **data only**: it validates every record at the boundary and never
receives or executes code.

## 🔒 Privacy

- The store is local (`~/.lore/lore.db`), lives outside any repo, and `*.db`
  is gitignored. Move it with `LORE_DB`.
- **Credentials are redacted by default.** A conservative scrubber runs over
  message text and tool payloads before anything is written (OpenAI / GitHub /
  AWS / Slack keys, Bearer tokens, PEM private-key blocks). Everything else is
  kept verbatim — it's your own memory. Treat the scrubber as a safety net, not
  a guarantee.
- **Opt out with `--no-redact`** on `lore index` / `lore hook` / `lore setup`
  if you really want credentials stored verbatim too.
- **Remove memory you didn't want kept.** `lore forget` deletes a session or a
  project (point-in-time); `lore exclude` deletes a project and bars all future
  captures from it. Both print an exact-scope preview and only act when you add
  `--confirm`, and both write a tombstone so re-indexing can't resurrect the
  data. See the `lore` skill for the full preview-then-confirm protocol.

## 🧬 How it works under the hood

- **One shared store, many harnesses.** Each harness writes into its own `source`
  namespace (`claude-code`, `codex`, `openclaw`, `cursor`, `hermes`). Any MCP
  client can read everyone's history.
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
