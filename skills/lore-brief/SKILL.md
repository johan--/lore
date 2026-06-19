---
name: lore-brief
description: Produces proposal-only Lore continuity briefs for the last 24 hours by default, with cited evidence, open work, learned signals, memory-card candidates, contradiction candidates, and sideEffects:false. Use for daily briefs, recap/continuity summaries, scheduled read-only synthesis, or proposing next actions from Lore without creating anything automatically.
---
# Lore Brief

Use this when the user wants a continuity brief, daily recap, or proposal-only synthesis from Lore. Default window is the rolling last 24 hours ending at run time unless the user supplies a window.

## Workflow

1. Compute retrieval bounds: local date label for humans, explicit ISO `since`/`until` for Lore commands.
2. Run `lore status --json --since <iso> --until <iso>` and stop on unhealthy status. If status is `possibly_unsynced` and `schemaVersion` is greater than `supportedSchemaVersion`, do not recommend bare `lore sync` as sufficient; say Lore must be updated before write/sync recovery can refresh the window.
3. Use `lore-recall` evidence packet rules for searches and citations.
4. Produce a brief with `sideEffects: false`.
5. Propose follow-up objects only. Do not create jobs, issues, wiki pages, skills, tasks, memory cards, code, or automations unless the user asks as a follow-up.

## Output Sections

- `window`: `since`, `until`, `timezone`, `localLabel`.
- `whatHappened`: evidence-backed bullets.
- `openWork`: unresolved work with cited ids or marked uncited.
- `learnedSignals`: things discovered while briefing.
- `proposals`: read-only suggestions using `references/proposal-vocabulary.md`.
- `memoryCardCandidates`: decision, claim, commitment, artifact, contradiction, open_question.
- `contradictionCandidates`: both sides with evidence, no averaging.
- `gaps`: what Lore could not prove.

## Rules

- Always state `sideEffects: false`.
- Scheduled use is read-only synthesis, never mutation authority.
- Date labels shown to the user use local timezone; retrieval filters use explicit ISO instants.
- Contradictions preserve both sides and evidence. Do not resolve unless current artifacts prove a side.
- If evidence is stale, label it and propose verification instead of acting.

## References

- `references/brief-schema.md` for structure.
- `references/proposal-vocabulary.md` for shared proposal/candidate shapes reused by handoff.
- `examples/` for good and bad outputs.
