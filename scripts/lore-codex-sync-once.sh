#!/bin/bash
set -u

PATH="${PATH:-/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin}"
case ":$PATH:" in
  *:/usr/bin:*) ;;
  *) PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" ;;
esac
export PATH

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${LORE_SYNC_STATE_DIR:-}" ] && [ -n "${LORE_CODEX_STATE_DIR:-}" ]; then
  export LORE_SYNC_STATE_DIR="$LORE_CODEX_STATE_DIR"
fi

exec "$script_dir/lore-sync-once.sh" codex
