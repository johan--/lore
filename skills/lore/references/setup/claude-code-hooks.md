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

`lore hook` reads the payload from stdin, indexes only that transcript, and exits
0 even when the payload is missing or malformed. It should never crash the host
harness.

Verify with:

```bash
lore search "<word from the current Claude Code session>" --source claude-code
```

If the search is empty, confirm `lore help` works in Claude Code's environment
and that the hook command is reachable on `PATH`. If needed, use an absolute
command such as `/path/to/lore hook`.
