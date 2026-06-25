# Codex hooks

Use this when Codex history is already backfilled and you want active Codex
Desktop sessions to become searchable shortly after each turn.

Codex is not Claude Code: its `notify` hook does not provide a `transcript_path`
payload that `lore hook` can consume. Codex writes JSONL transcripts under
`~/.codex/sessions`, so the live path is an incremental tree sync:

```bash
lore sync codex
```

## Notify hook

Point Codex's `notify` command at the wrapper script bundled with this repo or
the npm package:

```toml
notify = ["/absolute/path/to/lore/scripts/codex-notify-lore-sync.sh", "turn-ended"]
```

The wrapper does two things:

1. Preserves Codex Desktop's bundled notification client when present at its
   standard location under `~/.codex/computer-use`.
2. Starts `scripts/lore-codex-sync-once.sh` in the background. That compatibility
   wrapper delegates to `scripts/lore-sync-once.sh codex`.

`lore-sync-once.sh <source>` uses a user/source-specific state directory at
`${TMPDIR:-/tmp}/lore-sync-<source>-$UID` by default. Its PID-backed global lock
at `${TMPDIR:-/tmp}/lore-sync-global-$UID` keeps sync jobs for different sources
from writing the same SQLite store concurrently. Set `LORE_SYNC_STATE_DIR` to
choose a different source state directory and `LORE_SYNC_LOCK_DIR` to choose a
different global lock directory. The Codex notify wrapper still writes its own
small stdout/stderr logs under
`${TMPDIR:-/tmp}/lore-codex-sync-$UID`.

## Node and build requirements

For a source checkout, build the repo before wiring the hook:

```bash
npm install
npm run build
```

For a global npm install, the package already includes `dist/` and `scripts/`;
use the absolute path to the installed `scripts/codex-notify-lore-sync.sh`.

The sync script finds `node` from `PATH`, `LORE_NODE_BIN`, or an installed nvm
node under `~/.nvm/versions/node/*/bin/node`. If Codex runs with a sparse app
environment, set `LORE_NODE_BIN` to an absolute Node executable path.

By default the script runs the checked-out CLI at `dist/cli/lore.js`, which is
the source-install path after `npm run build`. Global npm installs do not have
that local checkout path; set `LORE_CLI_JS` if your hook should call a different
built CLI file.

## Optional launchd fallback

For extra freshness, run the same lock-protected sync from launchd every minute.
The hook still gives near-turn freshness; launchd catches missed notifications.
Use an absolute repo path in the plist:

```xml
<array>
  <string>/absolute/path/to/lore/scripts/lore-sync-once.sh</string>
  <string>codex</string>
</array>
```

## Verify

After one Codex turn, run:

```bash
lore search "<word from the current Codex session>" --source codex
```

If the search is empty, check
`${TMPDIR:-/tmp}/lore-codex-sync-$UID/sync.err.log` for notify-wrapper errors.
Then confirm the repo has been built and run `./scripts/lore-sync-once.sh codex`
manually.
