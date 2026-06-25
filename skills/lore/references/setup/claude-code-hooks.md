# Claude Code hooks

Use this when Claude Code history is already backfilled and you want the current
session indexed before compaction or session exit.

Claude Code hook payloads include a `transcript_path`, so the direct `lore hook`
path is correct. Add this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "lore hook" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "lore hook" }] }]
  }
}
```

`lore hook` reads the payload from stdin and indexes only that transcript.
Payload and transcript indexing failures are converted by `indexFromHookPayload`
into `{ indexed: false }` so the CLI path exits 0 for those cases. Failures
before that point, such as opening or initializing the Lore store, can still
abort the process and should be fixed as setup problems.

Verify with:

```bash
lore search "<word from the current Claude Code session>" --source claude-code
```

If the search is empty, confirm `lore help` works in Claude Code's environment
and that the hook command is reachable on `PATH`. If needed, use an absolute
command such as `/path/to/lore hook`.

## Catch-up sync fallback

If hook capture is unavailable, misconfigured, or suspected stale, run the
detected-source sync path instead:

```bash
lore sync claude-code
```

This incrementally indexes `~/.claude/projects`, including subagent
transcripts, with the same resume/watermark path as `lore index`. Repeat runs
are cheap and suitable for manual recovery.

For cron, launchd, Task Scheduler, or any unattended timer, use the bundled
generic sync wrapper instead of raw `lore sync` so concurrent source jobs share
one lock. For a source checkout on macOS, a launchd fallback can run it every
minute:

```xml
<array>
  <string>/absolute/path/to/lore/scripts/lore-sync-once.sh</string>
  <string>claude-code</string>
</array>
```

Run the script manually first after `npm run build`:

```bash
./scripts/lore-sync-once.sh claude-code
```

The wrapper uses a shared per-user lock across sources so Codex and Claude Code
syncs cannot write the SQLite store at the same time. If a scheduled run loses
the lock, it exits quietly and the next interval catches up.
