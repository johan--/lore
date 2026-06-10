#!/usr/bin/env bash
set -u

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
computer_use_notifier="${CODEX_PREVIOUS_NOTIFY_COMMAND:-$HOME/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient}"
sync_once="${LORE_CODEX_SYNC_ONCE:-$script_dir/lore-codex-sync-once.sh}"
user_id="${UID:-$(id -u)}"
state_dir="${LORE_CODEX_STATE_DIR:-${TMPDIR:-/tmp}/lore-codex-sync-$user_id}"
max_log_bytes="${LORE_CODEX_MAX_LOG_BYTES:-1048576}"
payload_mode="${CODEX_PREVIOUS_NOTIFY_PAYLOAD_MODE:-stdin}"

mkdir -p "$state_dir" 2>/dev/null || true
chmod 700 "$state_dir" 2>/dev/null || true

rotate_log() {
  log_path="$1"
  if [ -f "$log_path" ]; then
    size="$(wc -c < "$log_path" 2>/dev/null || printf '0')"
    if [ "${size:-0}" -gt "$max_log_bytes" ] 2>/dev/null; then
      mv "$log_path" "$log_path.1" 2>/dev/null || : > "$log_path"
    fi
  fi
}

if [ -x "$computer_use_notifier" ]; then
  if [ ! -t 0 ] && [ "$payload_mode" = "argv" ] && [ "$#" -le 1 ]; then
    stdin_payload="$(cat)"
    "$computer_use_notifier" "$@" "$stdin_payload"
  elif [ ! -t 0 ]; then
    "$computer_use_notifier" "$@" < /dev/stdin
  else
    "$computer_use_notifier" "$@"
  fi
fi

if [ -x "$sync_once" ]; then
  out_log="$state_dir/sync.out.log"
  err_log="$state_dir/sync.err.log"
  rotate_log "$out_log"
  rotate_log "$err_log"
  "$sync_once" >> "$out_log" 2>> "$err_log" &
fi

exit 0
