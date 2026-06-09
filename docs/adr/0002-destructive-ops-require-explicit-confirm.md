# Destructive ops require an explicit `--confirm`, not an interactive prompt

`lore forget` and `lore exclude` permanently remove indexed memory. We decided the destructive path is never the default and is never gated by an interactive `y/N` prompt. Running the bare command prints a non-destructive **preview** — the exact scope and counts of what would be removed — and does nothing else. Execution requires re-running with an explicit `--confirm` flag.

The reason we rejected a TTY prompt: lore is driven by agents as often as by humans, and agents run the CLI headless (stdin is frequently a payload, with no terminal attached). A `y/N` prompt in that setting either hangs the harness or gets silently auto-answered — the worst possible failure for an irreversible action. A flag-gated two-step is identical for humans and agents, has no TTY dependency, and forces a deliberate second action after the blast radius has been shown.

This pairs with two related decisions: `forget`/`exclude` are deliberately **not** exposed as MCP tools (a compromised client must never be able to wipe memory), and the `lore` skill enforces a human-in-the-loop sequence for agent flows — run the preview, surface the exact scope to the human, wait for explicit approval, and only then run with `--confirm`. The agent never supplies `--confirm` on its own initiative.
