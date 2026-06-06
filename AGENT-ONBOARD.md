# Onboarding recall (for the agent doing the setup)

You were handed a one-liner and told to set up **recall** — a local, full-fidelity
memory of past agent sessions, served over MCP. Follow this spine top to bottom.
It is deterministic; you supply only the one thing this doc cannot know: **which
harness you are** (Claude Code, Codex, Cursor, Cline, …) and therefore how your
client registers an MCP server and how it reloads.

Do not skip the verify step. "I ran the commands" is not proof; a green
`search_memory` is.

## Step 1 — Install and build

```bash
cd <path-to-recall>      # the repo you were pointed at
npm install
npm run build
npm link                 # puts `recall` on PATH; if you can't link, call dist/cli/recall.js
```

Requires Node 22+. Confirm: `recall help` prints usage. If it doesn't, stop and
fix this before continuing — nothing downstream works without it.

## Step 2 — Index your history and self-verify

```bash
recall setup
```

This probes the machine for known harnesses (Claude Code at `~/.claude/projects`,
Codex at `~/.codex/archived_sessions`), indexes everything it finds into the
shared store at `~/.recall/recall.db`, runs a search to prove retrieval works, and
prints the registration guidance from Step 3.

- If it reports **no sources found**, your harness writes transcripts somewhere
  else (or writes none). Run `recall sample <your-transcript-dir>` to inspect the
  format, then `recall index <dir> --source <name>`. If no adapter fits, follow
  the `recall-setup` skill (`skills/recall-setup/`) to write and prove one, or use
  the live `push` MCP tool if your harness has no files at all.
- If the search self-check says **OK**, indexing and retrieval both work. Proceed.

## Step 3 — Register recall in YOUR client

recall deliberately does **not** edit your client's config — every client's format
differs and silently rewriting them is unsafe. You apply the block for your own
harness:

| Harness          | How to register                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| Claude Code      | `claude mcp add recall -- recall serve`                                      |
| Codex            | add to `~/.codex/config.toml`: `[mcp_servers.recall]` / `command = "recall"` / `args = ["serve"]` |
| Cursor / Cline   | add an stdio entry: `{ "mcpServers": { "recall": { "command": "recall", "args": ["serve"] } } }` |
| Any MCP client   | register a stdio server whose command is `recall` with args `["serve"]`      |

If you are a harness not listed here: you still know your own config format. Add a
stdio MCP server named `recall` invoking `recall serve`. That is the whole
contract.

## Step 4 — Reload so the new tools load

MCP tools are almost always loaded at **session start**. A running session — the
one you are in right now — usually cannot pick up a server it just registered.
Pick the reload path for your client and tell the user the manual step:

- **Most clients:** the user must start a **new session** for `recall`'s tools to
  appear. Say this explicitly.
- **Plugin/hot-reload clients:** a command like `/reload-plugins` reseeds tools in
  place — use it if your client has one.
- **Auto-reseed clients:** some clients re-read MCP config on a timer or on focus;
  if so, nothing manual is needed.

State which case applies to your client. Do not claim recall is "ready" in the
current session unless you have actually confirmed the tools are live here.

## Step 5 — Prove it (the only acceptance test)

Once reloaded, call the `search_memory` tool with a word you know appears in a past
session of yours. A non-empty result whose `source` matches your harness is the
proof. Report the hit to the user. If it's empty, re-check Step 2 (did indexing
find your transcripts?) and Step 4 (did the tools actually reload?).

## Optional — Survive compaction

Wire `recall hook` into your harness's pre-compaction / session-end lifecycle so
the live session is indexed right before its context is wiped. For Claude Code,
add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "recall hook" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "recall hook" }] }]
  }
}
```

`recall hook` reads the payload on stdin, indexes just that transcript, and always
exits 0 so it can never crash your harness.
