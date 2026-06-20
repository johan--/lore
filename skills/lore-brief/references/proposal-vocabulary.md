# Shared Proposal Vocabulary

Proposal objects are suggestions only. Every proposal includes:

- `kind`: `skill`, `job`, `issue`, `wiki_update`, `fix`, `task`, `memory_card`, `question`.
- `title`: short proposed action.
- `why`: evidence-backed reason.
- `evidenceIds`: message ids or artifact ids.
- `sideEffects`: always `false` in a brief.

Memory-card candidate kinds:

- `decision`
- `claim`
- `commitment`
- `artifact`
- `contradiction`
- `open_question`

Contradiction candidates preserve both sides:

```json
{
  "kind": "contradiction",
  "sideA": { "claim": "...", "evidenceIds": ["m-a"] },
  "sideB": { "claim": "...", "evidenceIds": ["m-b"] },
  "status": "unresolved"
}
```
