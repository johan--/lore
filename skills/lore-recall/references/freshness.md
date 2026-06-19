# Freshness Labels

Freshness is an evidence property, not a truth guarantee.

- `current`: Lore claim was checked against current code/docs/tests/runtime in this turn.
- `recent`: Transcript timestamp is in the relevant recent window and no conflict was found.
- `stale`: Transcript is old for the decision, superseded, or current artifacts disagree.
- `unknown`: Missing timestamp, missing provenance, or no reliable basis.

When unsure, choose the more conservative label and explain the gap.
