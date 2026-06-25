#!/usr/bin/env bash
set -u

source_name="${1:-${LORE_SYNC_SOURCE:-}}"
if [ -z "$source_name" ]; then
  printf 'lore-sync: source required; pass one such as codex or claude-code\n' >&2
  exit 0
fi

safe_source="$(printf '%s' "$source_name" | tr -c 'A-Za-z0-9_.-' '_')"
user_id="${UID:-$(id -u)}"
state_dir="${LORE_SYNC_STATE_DIR:-${TMPDIR:-/tmp}/lore-sync-$safe_source-$user_id}"
lock_root="${LORE_SYNC_LOCK_DIR:-${TMPDIR:-/tmp}/lore-sync-global-$user_id}"
lock_dir="$lock_root/lock"

mkdir -p "$state_dir" 2>/dev/null || exit 0
chmod 700 "$state_dir" 2>/dev/null || true
mkdir -p "$lock_root" 2>/dev/null || exit 0
chmod 700 "$lock_root" 2>/dev/null || true

acquire_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$$" > "$lock_dir/pid" 2>/dev/null || true
    return 0
  fi

  if [ -f "$lock_dir/pid" ]; then
    old_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      return 1
    fi
  fi

  rm -rf "$lock_dir" 2>/dev/null || return 1
  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$$" > "$lock_dir/pid" 2>/dev/null || true
    return 0
  fi

  return 1
}

if ! acquire_lock; then
  exit 0
fi

cleanup() {
  rm -rf "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
lore_cli="${LORE_CLI_JS:-$repo_root/dist/cli/lore.js}"

find_node() {
  if [ -n "${LORE_NODE_BIN:-}" ] && [ -x "$LORE_NODE_BIN" ]; then
    printf '%s\n' "$LORE_NODE_BIN"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

node_bin="$(find_node)" || {
  printf 'lore-sync: node not found; set LORE_NODE_BIN\n' >&2
  exit 0
}

if [ ! -f "$lore_cli" ]; then
  printf 'lore-sync: lore CLI not found at %s; run npm run build or set LORE_CLI_JS\n' "$lore_cli" >&2
  exit 0
fi

"$node_bin" "$lore_cli" sync "$source_name"
