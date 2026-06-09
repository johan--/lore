# Issue 8 — CLI forget/exclude commands, skill, and docs

Type: AFK · Blocked by: Issue 7 (operations + guard), Issue 6 (redaction defaults) · Plan: docs/PRD-memory-control.md · Decision: docs/adr/0002-destructive-ops-require-explicit-confirm.md

## What to build

The user-facing surface: thin CLI commands over the Issue 7 operations module, the two-step confirmation UX, the `lore` skill update teaching the protocol, and the doc copy fixes for the new defaults. CLI-only — these verbs are never added to the MCP tool surface.

Scope:
- **`lore forget` / `lore exclude` CLI commands** in `src/cli/lore.ts`, thin over the operations module:
  - `forget --session <id>`, `forget --project <path>`, `exclude --project <path>`, `exclude --remove <path>`, `exclude --list`.
  - **Two-step, flag-gated, no TTY prompt:** the bare command prints the preview (exact scope + counts) and does nothing else; adding `--confirm` executes. Identical behavior for humans and headless agents (ADR 0002).
  - Render: preview echoes the resolved session(s)/project and counts so a mistyped id surfaces as a zero-count preview before any `--confirm`. ASCII-only output.
  - Session-id discovery rides the existing `lore sessions` listing — do not add a new lookup command.
- **MCP surface unchanged.** Confirm forget/exclude are NOT registered as MCP tools; the server keeps its read tools + additive `push`.
- **`lore` skill update** — teach the forget/exclude commands and enforce the human-in-the-loop sequence: run the preview, surface exact scope to the human, wait for explicit approval, only then run `--confirm`. The agent never supplies `--confirm` on its own initiative. Treat the skill as its whole folder (SKILL.md + any references/templates it carries).
- **Docs in lockstep with the redaction flip** — rewrite the "indexed verbatim by default, nothing dropped unless you ask" copy in README, AGENT-ONBOARD, and PRD-lore to carve out credentials (per ADR 0001), and document forget/exclude + the `--no-redact` opt-out. The docs must not describe behavior the tool no longer has.

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] Bare `lore forget`/`lore exclude` prints a preview and deletes nothing (verified by behavior: store unchanged after a bare run).
- [ ] Adding `--confirm` performs the deletion + tombstone.
- [ ] No interactive prompt appears on any path (headless-safe).
- [ ] `exclude --list` shows standing project rules; `exclude --remove` lifts one.
- [ ] forget/exclude are absent from the MCP tool listing.
- [ ] The `lore` skill documents the preview → approval → `--confirm` sequence and that the agent never self-confirms.
- [ ] README/AGENT-ONBOARD/PRD-lore no longer promise verbatim-credential storage and document forget/exclude + `--no-redact`.

## Verification

`npm run check`
