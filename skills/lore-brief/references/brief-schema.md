# Brief Schema

Required top-level fields:

- `sideEffects`: must be `false`.
- `window.fromIso`, `window.toIso`: ISO instants used for retrieval.
- `window.timeZone`, `window.localDateLabel`: human-local display.
- `completedActivity`, `openWork`, `changes`, `learnedSignals`, `proposals`, `memoryCardCandidates`, `contradictionCandidates`: arrays.
- `gaps`: optional array of retrieval gaps or unproven claims.

A valid brief proposes; it does not perform. Words like "created issue", "updated wiki", or "scheduled job" should fail review unless describing past evidence, not brief side effects.
