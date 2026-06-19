# Brief Schema

Required top-level fields:

- `sideEffects`: must be `false`.
- `window.since`, `window.until`: ISO instants used for retrieval.
- `window.timezone`, `window.localLabel`: human-local display.
- `whatHappened`, `openWork`, `learnedSignals`, `proposals`, `memoryCardCandidates`, `contradictionCandidates`, `gaps`: arrays.

A valid brief proposes; it does not perform. Words like "created issue", "updated wiki", or "scheduled job" should fail review unless describing past evidence, not brief side effects.
