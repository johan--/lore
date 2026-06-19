---
name: lore-handoff
description: Builds compact Lore continuation handoff packets with verified/open/stale/risky sections, cited evidence, artifacts, shared proposal vocabulary, unresolved questions, and no transcript dumps. Use when handing work to another agent, resuming later, compacting active work, or preparing next-agent context from Lore.
---

# Lore Handoff

Use this skill when the next agent needs to pick up work safely without reading raw transcript soup.

## Workflow

1. Use `lore-recall` to gather bounded evidence and status.
2. Reuse `lore-brief/references/proposal-vocabulary.md` for proposals, memory-card candidates, and contradictions.
3. Emit compact sections: `verified`, `open`, `stale`, `risky`, `artifacts`, `proposals`, `memoryCardCandidates`, `contradictionCandidates`, and `nextActions`.
4. Mark uncited/open claims explicitly; do not smooth uncertainty into certainty.
5. If evidence is stale, tell the next agent to inspect current files, tests, or runtime state before acting.

## Rules

- Do not dump transcript blocks or page whole sessions.
- Every claim, artifact, and next action cites `evidenceIds` or is marked `uncited:true`.
- Preserve risky assumptions, unresolved questions, and contradictions with both sides cited.
- Use shared proposal, memory-card, and contradiction shapes; do not invent private `todoList` or mutation objects.
- Handoff may recommend next actions but does not perform them.

## Validation

```bash
node skills/lore-handoff/scripts/validate-handoff.mjs skills/lore-handoff/examples/good-handoff.json
node skills/lore-dev-verification/scripts/validate-workflow-skill.mjs skills/lore-handoff
```
