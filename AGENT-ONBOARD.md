# Onboarding lore (for the agent doing the setup)

You were handed a one-liner and told to set up **lore** — a local, full-fidelity
memory of past agent sessions, served over MCP. Follow this spine top to bottom.
It is deterministic; you supply only the one thing this doc cannot know: **which
harness you are** (Claude Code, Codex, Cursor, Cline, …) and therefore how your
client registers an MCP server and how it reloads.

Do not skip the verify step. "I ran the commands" is not proof; a green
`search_memory` is.

## Step 1 — Install and build

```bash
cd <path-to-lore>      # the repo you were pointed at
npm install
npm run build
npm link                 # puts `lore` on PATH; if you can't link, call dist/cli/lore.js
```

Requires Node 22+. Confirm: `lore help` prints usage. If it doesn't, stop and
fix this before continuing — nothing downstream works without it.

## Step 2 — Index your history and self-verify

```bash
lore setup
```

This probes the machine for known harnesses (Claude Code at `~/.claude/projects`,
Codex at `~/.codex/sessions`, with `~/.codex/archived_sessions` as a legacy
fallback), indexes everything it finds into the
shared store at `~/.lore/lore.db`, runs a search to prove retrieval works, and
prints the registration guidance from Step 3.

- If it reports **no sources found**, your harness writes transcripts somewhere
  else (or writes none). For Codex Desktop, first check `~/.codex/sessions`; older
  builds may also have `~/.codex/archived_sessions`. Run
  `lore sample <your-transcript-dir>` to inspect the format, then
  `lore index <dir> --source <name>`. If no adapter fits, follow
  the `lore-setup` skill (`skills/lore-setup/`) to write and prove one, or use
  the live `push` MCP tool if your harness has no files at all.
- If the search self-check says **OK**, indexing and retrieval both work. For each
  source you care about, sanity-check the per-source line: a first run should show
  non-zero messages, while a repeat run may show `0 messages` because all files
  were already indexed and skipped by the watermark.
- Codex Desktop histories can be multi-GB. A first full-fidelity pass over
  `~/.codex/sessions` can take several minutes; progress logs are normal, and
  repeat runs should be much faster because unchanged files are skipped.

## Step 3 — Register lore in YOUR client

lore deliberately does **not** edit your client's config — every client's format
differs and silently rewriting them is unsafe. You apply the block for your own
harness:

| Harness          | How to register                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| Claude Code      | `claude mcp add lore -- lore serve`                                      |
| Codex            | add to `~/.codex/config.toml`: `[mcp_servers.lore]` / `command = "lore"` / `args = ["serve"]` |
| Cursor / Cline   | add an stdio entry: `{ "mcpServers": { "lore": { "command": "lore", "args": ["serve"] } } }` |
| Any MCP client   | register a stdio server whose command is `lore` with args `["serve"]`      |

If you are a harness not listed here: you still know your own config format. Add a
stdio MCP server named `lore` invoking `lore serve`. That is the whole
contract.

## Step 4 — Reload so the new tools load

MCP tools are almost always loaded at **session start**. A running session — the
one you are in right now — usually cannot pick up a server it just registered.
Pick the reload path for your client and tell the user the manual step:

- **Most clients:** the user must start a **new session** for `lore`'s tools to
  appear. Say this explicitly.
- **Plugin/hot-reload clients:** a command like `/reload-plugins` reseeds tools in
  place — use it if your client has one.
- **Auto-reseed clients:** some clients re-read MCP config on a timer or on focus;
  if so, nothing manual is needed.

State which case applies to your client. Do not claim lore is "ready" in the
current session unless you have actually confirmed the tools are live here.

## Step 5 — Prove it (the only acceptance test)

Once reloaded, call the `search_memory` tool with a word you know appears in a past
session of yours. A non-empty result whose `source` matches your harness is the
proof. Report the hit to the user. If it's empty, re-check Step 2 (did indexing
find your transcripts?) and Step 4 (did the tools actually reload?).

## Step 6 — Teach your future self (update your own global config)

Steps 1–5 run **once**. Using lore has to be remembered **every** future
session, so write a short block into the global instruction file your harness
auto-loads at session start — the same file you read at the top of every session:

- Claude Code → `~/.claude/CLAUDE.md`
- Codex → `~/.codex/AGENTS.md`
- Gemini → `~/.gemini/GEMINI.md`
- any other harness → whatever file it loads at session start

Append this block (trim to taste — it costs tokens every session, so keep it
tight):

> **lore — long-term session memory.** A local, searchable store of past agent
> sessions at `~/.lore/lore.db`, served over MCP. When you need context you
> don't have — a past decision, how something was built, why an approach was
> dropped — query it with the `search_memory` / `find_relevant` tools (filters:
> `project`, `branch`, `source`, `agent`, `tool`, `since`, `until`) **before**
> guessing or asking. Ingestion differs per harness (each writes its own
> transcript format, read via its own adapter into its own `source` namespace:
> `claude-code`, `codex`, …) but querying is identical. Resolving loose
> references: an unqualified "the last session" / "pop back in" means **your own**
> harness's most recent session (`source` = the harness you are, scoped to the
> current repo if you're in one) — only cross to another harness when the user
> names one ("the last codex session"). A topic reference ("the session where we
> fixed X") searches **all** sources by relevance. Caveat: "last" means last
> *indexed* — the session you're in now isn't in lore until a hook or
> `lore setup` indexes it.

Optionally also drop that same block at `~/.agents/lore.md` as a shared,
harness-neutral reference every agent on the machine can point at. Do not edit
another harness's config — only your own.

## Optional — Survive compaction

Wire `lore hook` into your harness's pre-compaction / session-end lifecycle so
the live session is indexed right before its context is wiped. For Claude Code,
add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "lore hook" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "lore hook" }] }]
  }
}
```

`lore hook` reads the payload on stdin, indexes just that transcript, and always
exits 0 so it can never crash your harness.

## Troubleshooting (when Step 1 or 2 fails)

Steps 1–2 are the deterministic spine, but a **fresh machine** — especially a
buddy's Windows box — will not always sail through. The four failures below are
the ones that actually happen. Work them top to bottom.

### `npm install` fails building `better-sqlite3`

lore stores everything in SQLite via `better-sqlite3`, a **native module**. npm
tries to download a prebuilt binary for your OS/arch/Node combo; if none matches,
it compiles from source, which needs a C/C++ toolchain. A wall of `node-gyp` /
`gyp ERR!` output is this case.

- **Node version first.** `node -v` must be **22+**. A mismatched/old Node is the
  most common reason no prebuilt binary is found. Fix Node before anything else.
- **macOS:** `xcode-select --install` (installs the Command Line Tools).
- **Windows:** install **Visual Studio Build Tools** with the "Desktop
  development with C++" workload, plus Python 3. The standalone
  `npm install --global windows-build-tools` package is deprecated — use the
  Visual Studio Installer. Then re-run `npm install`.
- **Linux:** `sudo apt install build-essential python3` (or the distro
  equivalent), then re-run.

### `lore: command not found` after `npm link`

Step 1's `npm link` puts a `lore` shim in npm's global bin dir, and Step 3
registers the bare command `lore`. If the global bin dir isn't on `PATH`, both
break. Two fixes:

- **Add the global bin to PATH.** Find it with `npm prefix -g` (the bin dir is
  that path on Linux/macOS, or `<prefix>\` on Windows where the shim lives), add
  it to your shell profile / Windows `Path`, open a new shell, retry `lore help`.
- **Or skip the PATH entirely.** Register the MCP server with an **absolute path**
  to the built CLI instead of the bare command:
  `node /absolute/path/to/lore/dist/cli/lore.js serve`. This is the robust
  choice on a machine where you can't or don't want to touch PATH — adapt the
  Step 3 table by swapping `command = "lore"`, `args = ["serve"]` for
  `command = "node"`, `args = ["/abs/path/dist/cli/lore.js", "serve"]`.

### Windows paths

lore resolves all locations from `homedir()` + `path.join`, so it is
Windows-safe by construction: `~/.claude/projects` becomes
`C:\Users\<you>\.claude\projects`, and the store lands at
`C:\Users\<you>\.lore\lore.db`. You do **not** hand-edit any `~` literals.
The real Windows question is whether your harness actually writes transcripts to
the same place its non-Windows build does — confirm with
`lore sample <dir>` before assuming `lore setup` will find them.

### `lore setup` reports "no known harness transcripts found"

The probe only knows the built-in locations. If your harness (or a buddy's
differently-configured one) writes elsewhere:

1. `lore sample <your-transcript-dir>` to confirm there are transcripts and see
   the on-disk shape.
2. `lore index <dir> --source <name>` to index them with an existing adapter.
3. If no adapter fits the format, follow the `lore-setup` skill
   (`skills/lore-setup/`) to write and prove a new one, or — for a harness with
   no transcript files at all — use the live `push` MCP tool.
