# CSH-003 - Scheduler-safe sync wrapper contract

Type: AFK · Label: ready-for-agent · Blocked by: CSH-001, CSH-002 · Plan: docs/PRD-claude-code-sync-hardening.md

## Parent

docs/PRD-claude-code-sync-hardening.md

## User stories covered

9-24, 27, 34-36

## What to build

Make the unattended sync contract explicit and durable. Raw `lore sync <source>`
is the manual/debug catch-up command. Cron, launchd, Task Scheduler, hooks that
lack a direct transcript payload, and other unattended timers must use the
lock-protected wrapper so multiple source jobs do not write the shared SQLite
store concurrently.

Harden the wrapper for sparse scheduler environments and prove the behavior with
deterministic tests rather than manual smoke notes.

## Acceptance criteria

- [ ] CLI help describes raw `lore sync <source>` as manual catch-up and routes scheduled jobs to `scripts/lore-sync-once.sh <source>`.
- [ ] README, AGENT-ONBOARD, base skill setup references, Claude Code hook docs, Codex hook docs, and unlisted-harness hook docs all teach the same scheduler-safe contract.
- [ ] The generic wrapper handles missing `HOME` without an unbound-variable shell error.
- [ ] The generic wrapper does not depend on external path utilities before Node discovery.
- [ ] The generic wrapper exits non-zero for missing source, missing Node, missing state/lock dirs, and missing CLI artifacts.
- [ ] Stale lock recovery and live lock contention behavior are covered by deterministic tests.
- [ ] Legacy Codex wrapper behavior remains compatible.

## Blocked by

- CSH-001
- CSH-002

## Verification

Run script behavior tests, shell syntax checks, package smoke, targeted CLI tests,
and final `npm run check`.
