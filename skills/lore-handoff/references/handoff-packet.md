# Handoff Packet

Required sections:

- `verified`: evidence-backed facts.
- `open`: unresolved work.
- `stale`: claims that may have drifted.
- `risky`: assumptions, hazards, and privacy concerns.
- `artifacts`: files, branches, commits, issues, or runtime artifacts, each with `evidenceIds` or `uncited:true`.
- `proposals`: shared proposal vocabulary from `skills/lore-brief/references/proposal-vocabulary.md`.
- `memoryCardCandidates`: shared memory-card candidate kinds from the proposal vocabulary: `decision`, `claim`, `commitment`, `artifact`, `contradiction`, and `open_question`.
- `contradictionCandidates`: unresolved two-sided contradiction objects using the shared contradiction shape.
- `nextActions`: recommended next steps, each with `evidenceIds` or `uncited:true`.

Shared proposal objects must use this shape:

```json
{
  "kind": "issue",
  "title": "Run packaging smoke",
  "why": "The package must prove skill inclusion before release.",
  "evidenceIds": ["m-123"],
  "sideEffects": false
}
```

Contradiction candidates preserve both sides:

```json
{
  "kind": "contradiction",
  "sideA": { "claim": "The slice is merged.", "evidenceIds": ["m-a"] },
  "sideB": { "claim": "Review found blockers.", "evidenceIds": ["m-b"] },
  "status": "unresolved"
}
```

Keep each section compact. If a claim lacks evidence, use `uncited:true` and explain why. Do not paste transcript chunks; cite message ids and ask the next agent to drill down with `lore context` or `lore session --around` when needed.

`evidenceIds` may be real Lore message ids or explicit artifact ids from the current run, such as `live-status-2026-06-19` or a checked file path. When an id is not a Lore message id, make that clear in the surrounding text so the next agent knows whether to use `lore get/context` or inspect a local artifact/command output.
