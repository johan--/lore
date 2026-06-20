# Onboarding lore (for the agent doing the setup)

You were handed a one-liner and told to set up **lore**: a local, full-fidelity
memory of past agent sessions. Follow this spine top to bottom.

There are two ways to use lore, and **only the first is required**:

1. **The server-free `lore` CLI** (Steps 1-2): the always-available path. Once
   your history is indexed, `lore search` / `lore get` recall it directly from the
   store, with **no server, no registration, and no reload.** Any harness that can
   run a shell gets memory this way. The bundled **`lore` skill** drives this loop
   and is auto-discovered from its description, so on skill-capable harnesses you
   wire up nothing. Recall just becomes available the moment lore is installed.
   This is what makes lore portable: a new user runs one command and is done; they
   never have to hand-edit a per-harness instruction file for lore to work.
2. **The MCP server** (Steps 3-5, **optional**): register `lore serve` only if
   your harness prefers tool calls (`search_memory`, …) over shelling out. It reads
   the same store and is never required; every CLI `--json` envelope is byte-for-byte
   the matching MCP tool's response.

Do not skip the verify step. "I ran the commands" is not proof; a non-empty
`lore search` (or a green `search_memory`, if you wired up MCP) is.

## Step 1: Install and build

If you just want it running, the published package is the fast path:

```bash
npm install -g @jordanhindo/lore@latest   # puts the `lore` command on PATH
```

If Lore is already installed, run the same command again to refresh the global
binary. Then run `lore help` and `lore status --json`. If the status output shows
a store `schemaVersion` higher than `supportedSchemaVersion`, the command still
points at an old build. Open a fresh shell or run `hash -r`, reinstall, and retry.

If you were pointed at the source repo instead (you are contributing, or you
need to write a new adapter, which requires the source tree):

```bash
cd <path-to-lore>      # the repo you were pointed at
npm install
npm run build
npm link                 # puts `lore` on PATH; if you can't link, call dist/cli/lore.js
```

Requires Node 22+. Confirm: `lore help` prints usage. If it doesn't, stop and
fix this before continuing. Nothing downstream works without it.


### Workflow skills included in the package

The package includes the low-level `lore` skill plus higher-level workflow skills:

- `lore:recall` -> `skills/lore-recall/` for bounded retrieval plans, status checks, freshness labels, context drill-down, and cited evidence packets.
- `lore:brief` -> `skills/lore-brief/` for rolling-last-24-hours synthesis and proposal-only follow-up signals.
- `lore:handoff` -> `skills/lore-handoff/` for compact continuation packets with verified/open/stale/risky sections, artifacts, candidates, contradictions, and next actions.
- `lore:dev-verification` -> `skills/lore-dev-verification/` for verifying Lore repo changes and workflow-skill bundles.

These are real skill bundles with references, examples, evals, validators, and committed test reports. Do not treat them as optional one-file prompts. No workflow skill is complete until its `evals/test-report.md` proves the eval/review pass ran.

This release does not ship a universal plugin wrapper. Future plugins may expose names like `lore:recall`, `lore:brief`, and `lore:handoff`; today those names refer to the installable sibling skill folders in the package.

## Step 2: Index your history and self-verify

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
  the `lore` skill's `references/setup/index.md` (`skills/lore/references/setup/index.md`) to
  write and prove one, or use CLI `lore push` / MCP `push` if your harness has
  no files at all.
- If the search self-check says **OK**, indexing and retrieval both work. For each
  source you care about, sanity-check the per-source line: a first run should show
  non-zero messages, while a repeat run may show `0 messages` because all files
  were already indexed and skipped by the watermark.
- Codex Desktop histories can be multi-GB. A first full-fidelity pass over
  `~/.codex/sessions` can take several minutes; progress logs are normal, and
  repeat runs should be much faster because unchanged files are skipped.

**After this step you already have memory.** `lore search "<a word from a past
session>"` returns hits and `lore get <id> --full` reads one back. No server, no
registration, no reload. If your harness supports skills, the `lore` skill is now
discoverable too. Steps 3-5 are **only** if you additionally want the MCP tools;
otherwise jump to Step 6.

## Step 3 (optional): Register lore in YOUR client for MCP tool access

Do this **only if** you want MCP tool calls (`search_memory`, …) alongside the
CLI. Recall already works without it. lore deliberately does **not** edit your
client's config. Every client's format differs and silently rewriting them is
unsafe. You apply the block for your own harness:

| Harness          | How to register                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| Claude Code      | `claude mcp add lore -- lore serve`                                      |
| Codex            | add to `~/.codex/config.toml`: `[mcp_servers.lore]` / `command = "lore"` / `args = ["serve"]` |
| Cursor / Cline   | add an stdio entry: `{ "mcpServers": { "lore": { "command": "lore", "args": ["serve"] } } }` |
| Any MCP client   | register a stdio server whose command is `lore` with args `["serve"]`      |

If you are a harness not listed here: you still know your own config format. Add a
stdio MCP server named `lore` invoking `lore serve`. That is the whole
contract.

## Step 4 (optional): Reload so the new tools load

Skip this entirely if you're using the CLI only. MCP tools are almost always
loaded at **session start**. A running session, the one you are in right now,
usually cannot pick up a server it just registered.
Pick the reload path for your client and tell the user the manual step:

- **Most clients:** the user must start a **new session** for `lore`'s tools to
  appear. Say this explicitly.
- **Plugin/hot-reload clients:** a command like `/reload-plugins` reseeds tools in
  place. Use it if your client has one.
- **Auto-reseed clients:** some clients re-read MCP config on a timer or on focus;
  if so, nothing manual is needed.

State which case applies to your client. Do not claim lore is "ready" in the
current session unless you have actually confirmed the tools are live here.

## Step 5: Prove it (the only acceptance test)

Recall with a word you know appears in a past session of yours and confirm a
non-empty result whose `source` matches your harness. Use whichever path you set up:

- **CLI (always available):** `lore search "<word>"` returning a non-empty hit
  list is the proof.
- **MCP (if you did Steps 3–4):** call the `search_memory` tool with the same word.

Report the hit to the user. If it's empty, re-check Step 2 (did indexing find your
transcripts?), and, if you went the MCP route, Step 4 (did the tools actually
reload?).

## Step 6: Teach your future self (optional reinforcement)

Steps 1–5 run **once**, but using lore has to be remembered **every** future
session. There are two mechanisms, and the first carries the load:

- **The `lore` skill does this for you, with no editing.** Because the skill is
  auto-discovered from its description (which fires on "remember", "recall", "last
  time", "search my history", …), a skill-capable harness surfaces lore whenever
  memory is relevant. You don't have to wire anything into a config file. This is
  the portable mechanism: it ships with lore and works for any user who installs
  it. **lore does not depend on the block below.**
- **A short pointer in your own global instruction file is optional reinforcement**,
  useful if your harness doesn't support skills, or to bias your
  own setup toward recall. Write it only into the file *your* harness auto-loads at
  session start (Claude Code → `~/.claude/CLAUDE.md`, Codex → `~/.codex/AGENTS.md`,
  Gemini → `~/.gemini/GEMINI.md`, …). Never edit another harness's config.

If you do write the pointer, append this block (trim to taste, it costs tokens
every session):

> **lore: long-term session memory.** A local, searchable store of past agent
> sessions at `~/.lore/lore.db`, shared by every harness on this machine. When you
> need context you don't have, such as a past decision, how something was built, or
> why an approach was dropped, recall from lore **before** guessing or asking. **You
> don't need the MCP server:** the server-free `lore` CLI reads the store directly
> (`lore search <q>` → real ids → `lore get <id> --full` / `lore context <id>` /
> `lore session <id> --around <id>`; always drill down, never dump a whole
> session). The `lore` skill drives this loop. If the MCP tools are loaded,
> `search_memory` / `find_relevant` are the equivalent calls. Both honor the same
> filters: `project`, `branch`, `source`, `agent`, `tool`, `since`, `until`.
> Resolving loose references: an unqualified "the last session" / "pop back in"
> means **your own** harness's most recent session (`source` = the harness you are,
> scoped to the current repo if you're in one). Only cross to another harness when
> the user names one ("the last codex session"). A topic reference ("the session
> where we fixed X") searches **all** sources by relevance. Caveat: "last" means
> last *indexed*. The session you're in now isn't in lore until a hook or
> `lore setup` indexes it.

You may also drop that block at `~/.agents/lore.md` as a shared, harness-neutral
reference every agent on the machine can point at.

## Optional: Survive compaction

Wire freshness after backfill so the active session is indexed before it falls
out of context. The exact hook depends on the harness:

- Claude Code emits a `transcript_path` hook payload; use
  `skills/lore/references/setup/claude-code-hooks.md`.
- Codex writes a session tree and should run `lore sync codex`; use
  `skills/lore/references/setup/codex-hooks.md`.
- For anything else, use
  `skills/lore/references/setup/other-harness-hooks.md` to choose between
  `lore hook`, `lore index`, a dedicated sync command, or live `lore push`.

## Optional: Control what's remembered

- **Credentials are redacted by default.** A conservative scrubber runs over
  message text and tool payloads at index time (OpenAI / GitHub / AWS / Slack
  keys, Bearer tokens, PEM private-key blocks); everything else is stored
  verbatim. Pass `--no-redact` to `lore index` / `lore hook` / `lore setup` only
  if you deliberately want credentials kept verbatim too.
- **Removing memory** is a CLI-only, two-step, irreversible operation:
  - `lore forget --session <id>` deletes one session; `lore forget --project
    <path>` deletes a project's sessions. Future sessions are
    still indexed).
  - `lore exclude --project <path>` deletes a project AND bars all future
    captures; `lore exclude --list` / `--remove <path>` manage standing rules.
  - The bare command only previews the exact scope. Nothing is deleted until you
    re-run it with `--confirm`, and a tombstone then prevents re-indexing from
    resurrecting the data. As the setup agent, never add `--confirm` on your own
    initiative. Surface the preview to the user and wait for their approval. The
    `lore` skill carries the full protocol.

## Troubleshooting (when Step 1 or 2 fails)

Steps 1-2 are the deterministic spine, but a **fresh machine**, especially a
buddy's Windows box, will not always sail through. The four failures below are
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
  `npm install --global windows-build-tools` package is deprecated. Use the
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
  choice on a machine where you can't or don't want to touch PATH. Adapt the
  Step 3 table by swapping `command = "lore"`, `args = ["serve"]` for
  `command = "node"`, `args = ["/abs/path/dist/cli/lore.js", "serve"]`.


### `lore status` is ready, but schemaVersion is newer

Read-only retrieval is allowed to use a newer-but-compatible store when the
required tables are present. A healthy read-compatible store can report
`status: "ready"` with the true `schemaVersion`, even if `supportedSchemaVersion`
is lower. Run `npm run build` in the source checkout or reinstall the current
package with `npm install -g @jordanhindo/lore@latest` before write recovery;
write paths still refuse unknown newer stores with a `newer_store` error.

### Package or skill smoke for contributors

Before calling workflow-skill packaging done, run:

```bash
npm run package:smoke
```

This proves the CLI bin is rebuilt and executable, the workflow skill folders
are included in the package, the skill bundles and test reports are readable from
the packed tree, and the packaged CLI help can run with dependencies present.

### Windows paths

lore resolves all locations from `homedir()` + `path.join`, so it is
Windows-safe by construction: `~/.claude/projects` becomes
`C:\Users\<you>\.claude\projects`, and the store lands at
`C:\Users\<you>\.lore\lore.db`. Do **not** hand-edit any `~` literals.
The real Windows question is whether your harness actually writes transcripts to
the same place its non-Windows build does. Confirm with
`lore sample <dir>` before assuming `lore setup` will find them.

### `lore setup` reports "no known harness transcripts found"

The probe only knows the built-in locations. If your harness (or a buddy's
differently-configured one) writes elsewhere:

1. `lore sample <your-transcript-dir>` to confirm there are transcripts and see
   the on-disk shape.
2. `lore index <dir> --source <name>` to index them with an existing adapter.
3. If no adapter fits the format, follow the `lore` skill's
   `references/setup/index.md` (`skills/lore/references/setup/index.md`) to write
   and prove a new one, or use the live `push` MCP tool for a harness with no
   transcript files at all.
