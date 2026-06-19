# Test Report - lore-handoff

## Eval IDs And Prompts

- completed-work: Create a handoff after a completed slice.
- unresolved-work: Create a handoff with open work and risky assumptions.
- shared-vocabulary: Include proposal and memory-card candidates for the next agent.
- contradictions: Create a handoff when one source says work is complete and another says blockers remain.
- no-dump: Create a handoff from a long session with tempting transcript excerpts.

## Fixture Source

Synthetic eval prompts and examples under `skills/lore-handoff/`. No real transcripts, private messages, credentials, or personal memory are committed.

## Run Mode

Manual with-skill review plus deterministic handoff validator, targeted Vitest coverage for validator bypasses, and the UPD-000 workflow-skill bundle/test-report validator.

## With-Skill Results

- completed-work: PASS. Verified and artifact sections cite evidence ids or explicit `uncited:true` markers.
- unresolved-work: PASS. Open, stale, risky, and next-action sections preserve uncertainty and cite evidence.
- shared-vocabulary: PASS. The good packet uses the shared proposal shape `kind`, `title`, `why`, `evidenceIds`, and `sideEffects:false`; memory-card candidates use the shared kind vocabulary.
- contradictions: PASS. The good packet preserves both sides as unresolved `contradictionCandidates` with evidence ids.
- no-dump: PASS. The validator rejects large transcript blocks and many-small-chunk transcript stitching.

## Baseline Or Old-Skill Results

No previous handoff workflow skill existed. Baseline was ad hoc conversation summary without structured candidate sections, contradiction preservation, shared proposal vocabulary, or a deterministic no-dump/evidence checker.

## Assertion Grades

- verified-cited: PASS.
- uncertainty: PASS.
- next-action-cited: PASS.
- shared-proposals: PASS.
- both-sides: PASS.
- bounded: PASS.

## Validator Output

- handoff packet checker: PASS for `skills/lore-handoff/examples/good-handoff.json` after review fixes.
- targeted validator tests: PASS for compact good packet, missing claim evidence, private shapes, large transcript dumps, uncited artifact/next-action bypass, and many-small-chunk transcript stitching.
- workflow skill bundle checker: PASS after implementation.
- test-report structure checker: PASS after implementation.

## Trigger Checks

- should trigger: "handoff this work to next agent" -> PASS.
- should trigger: "compact continuation packet" -> PASS.
- should trigger: "make a fresh-context continuation packet from Lore" -> PASS.
- should not trigger: "summarize public article" -> PASS.

## Privacy Notes

Examples are synthetic. Real handoffs should cite ids, summarize evidence, and direct agents to bounded `lore context` or `lore session --around` drill-down rather than copying raw transcript text.

## Changes Made After Testing

Created handoff skill bundle, packet reference, good/bad examples, evals, deterministic validator, and test report. Review fixes aligned handoff proposals with the shared vocabulary, added required memory-card and contradiction candidate sections, required evidence for artifacts and next actions, and hardened no-dump checks against many small transcript-like fragments.

## Remaining Risks

Manual evals cover synthesis behavior at the instruction level; future synthetic multi-turn transcript fixtures could test richer end-to-end handoff generation. The deterministic checker intentionally validates packet structure and privacy/evidence guardrails, not semantic truth of cited message ids.

## Live Workflow Exercise - 2026-06-19

Created `/private/tmp/lore-live-skill-tests/handoff-live.json` from real Lore evidence and live status/sync results. The packet preserves verified, open, stale, risky, artifact, proposal, memory-card, contradiction, and next-action sections without transcript dumps. It passed `node skills/lore-handoff/scripts/validate-handoff.mjs`. The handoff explicitly carries the unresolved contradiction that read-only Lore can retrieve older evidence while write/sync recovery cannot refresh the current store.
