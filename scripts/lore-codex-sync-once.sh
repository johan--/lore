#!/usr/bin/env bash
set -u

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${LORE_SYNC_STATE_DIR:-}" ] && [ -n "${LORE_CODEX_STATE_DIR:-}" ]; then
  export LORE_SYNC_STATE_DIR="$LORE_CODEX_STATE_DIR"
fi

exec "$script_dir/lore-sync-once.sh" codex
