#!/usr/bin/env bash
set -u

lock_dir="/tmp/lore-codex-sync.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  exit 0
fi

cleanup() {
  rmdir "$lock_dir" 2>/dev/null || true
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
  printf 'lore-codex-sync: node not found; set LORE_NODE_BIN\n' >&2
  exit 0
}

if [ ! -f "$lore_cli" ]; then
  printf 'lore-codex-sync: lore CLI not found at %s; run npm run build or set LORE_CLI_JS\n' "$lore_cli" >&2
  exit 0
fi

"$node_bin" "$lore_cli" sync codex
