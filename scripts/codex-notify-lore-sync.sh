#!/usr/bin/env bash
set -u

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
computer_use_notifier="${CODEX_PREVIOUS_NOTIFY_COMMAND:-$HOME/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient}"
sync_once="${LORE_CODEX_SYNC_ONCE:-$script_dir/lore-codex-sync-once.sh}"

stdin_payload=""
if [ ! -t 0 ]; then
  stdin_payload="$(cat)"
fi

if [ -x "$computer_use_notifier" ]; then
  if [ "$#" -le 1 ] && [ -n "$stdin_payload" ]; then
    "$computer_use_notifier" "$@" "$stdin_payload"
  else
    "$computer_use_notifier" "$@"
  fi
fi

if [ -x "$sync_once" ]; then
  "$sync_once" >> /tmp/lore-codex-sync.out.log 2>> /tmp/lore-codex-sync.err.log &
fi

exit 0
