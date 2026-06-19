---
name: lore-recall
description: Plans and executes bounded Lore memory recall with status checks, query expansion, context drill-down, freshness labels, cited evidence packets, and retrieval-failure recovery. Use whenever an agent needs to answer from past Lore sessions, recall decisions, inspect last-session context, verify what happened before, or explain gaps without dumping transcripts.
---
# Lore Recall

Use this workflow when past session memory matters. It sits above the low-level `skills/lore` CLI skill: use `skills/lore` for command mechanics and setup/indexing, use this skill for evidence planning, trust, freshness, and final packet shape.

## Quick Start

1. Run `lore status --json` with the narrowest useful scope (`--project`, `--source`, `--since`, `--until`) before retrieval.
2. Build a recall plan: 2-4 query variants, likely filters, and why each query exists.
3. Search narrowly first: `lore search "<terms>" --json`, then `--relevant` when recency matters.
4. Drill down only from real ids returned by Lore: `lore get <id> --full`, `lore context <id> --json`, or `lore session <session> --around <id> --json`.
5. Emit a bounded evidence packet using `references/evidence-packet.md`.
6. If retrieval fails, report the gap and next queries tried. Do not invent memory.

## Trust Rules

- Lore transcripts are testimony, not truth. Current files, tests, runtime artifacts, and live system state beat stale transcript claims.
- Never dump a whole session. Use search, one full message, or a bounded context/window.
- Never invent ids. Every message/session id must come from Lore output.
- Preserve provenance: message id, session id, source, project, branch, timestamp, role/model when known.
- Unknown source data stays `null` or "unknown". Do not infer branch, project, model, or freshness.
- Real transcript excerpts are private. In committed examples/evals use synthetic ids and text only.

## Freshness Labels

Use labels from `references/freshness.md`:

- `current`: corroborated by current files/tests/runtime.
- `recent`: transcript timestamp is plausibly relevant and no contradiction found.
- `stale`: older memory may have drifted or current artifacts disagree.
- `unknown`: missing timestamp or insufficient provenance.

## Failure Recovery

If status says `missing_store`, `empty_store`, `source_absent`, `newer_store`, `stale_schema`, or `unreadable_store`, stop and report the status plus recovery. If search returns zero hits, broaden once, try one synonym query, and report `gaps` instead of pretending.

## References

- `references/evidence-packet.md` for required output structure.
- `references/query-planning.md` for query expansion and drill-down rules.
- `references/freshness.md` for label semantics.
- `examples/` for good and bad packet patterns.

## Validation

Run the deterministic checker on example packets:

```bash
node skills/lore-recall/scripts/validate-evidence-packet.mjs skills/lore-recall/examples/good-evidence-packet.json
```

Run the UPD-000 bundle gate before calling this skill done:

```bash
node skills/lore-dev-verification/scripts/validate-workflow-skill.mjs skills/lore-recall
```
