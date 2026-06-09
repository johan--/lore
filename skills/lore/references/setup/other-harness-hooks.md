# Hooking an unlisted harness

Use this when a harness is not listed by name. The job is to read between the
lines of the harness and choose the least fragile freshness path.

Start by finding which of these three shapes the harness exposes:

1. **Hook payload includes one transcript file path.** Use `lore hook` if the
   file is in a format Lore already understands, or after you add and prove an
   adapter for that format. The hook command must receive the harness payload on
   stdin.
2. **Hook payload does not include a transcript path, but the harness writes
   session files to a known directory.** Use `lore index <dir> --source <name>` or
   a dedicated sync command from the hook, cron, or launchd. Codex uses this
   shape: `notify` triggers `lore sync codex`.
3. **No readable transcript files exist.** Use the live PUSH path: have the
   harness call the `push` MCP tool or pipe normalized `{ sourceFile, messages,
   toolCalls }` JSON into `lore push`.

## Procedure

1. Run `lore sample <candidate-dir>` if there is any on-disk history.
2. If the sample matches a registered adapter, backfill it with
   `lore index <dir> --source <name>`.
3. If no adapter fits, follow `index.md` Step 3b and add a reviewed adapter with
   conformance tests before using hooks for that format.
4. Locate the harness's safest lifecycle point: pre-compaction, session end,
   turn-ended notify, or periodic background sync.
5. Wire the smallest command that gets fresh content into Lore:
   - `lore hook` for stdin payloads with `transcript_path`.
   - `lore index <dir> --source <name>` for readable transcript directories.
   - `lore push` or the `push` MCP tool for live-only systems.
6. Make the hook non-disruptive. It should exit 0 on missing payloads, log errors
   somewhere inspectable, and never block the host harness on a long backfill.
7. Prove it with `lore search "<word>" --source <name>` after a fresh turn.

## Rules of thumb

- Prefer PULL from disk when available. It backfills history and survives missed
  hooks.
- Prefer a hook only for freshness, not as the only copy of important history.
- Use a lock when a hook and a timer can run the same sync command.
- Do not fabricate fields the harness does not store. Missing project, branch,
  model, agent, or tool metadata should be `null`.
- Keep harness-specific paths in setup docs or local config, not in shared
  adapter code.
