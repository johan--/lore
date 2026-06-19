# Test Report - lore-handoff

## Eval IDs And Prompts

- completed-work: Create handoff after completed slice.
- unresolved-work: Create handoff with open work and risky assumptions.
- shared-vocabulary: Include proposal candidates for next agent.
- no-dump: Handoff from a long session.

## Fixture Source

Synthetic eval prompts and examples under `skills/lore-handoff/`. No real transcripts or private memory committed.

## Run Mode

Manual with-skill review plus deterministic handoff validator and UPD-000 workflow-skill validator.

## With-Skill Results

- completed-work: PASS. Verified/artifact sections cite evidence.
- unresolved-work: PASS. Open/risky sections preserve uncertainty.
- shared-vocabulary: PASS. Skill points to `lore-brief` shared proposal vocabulary.
- no-dump: PASS. Skill forbids transcript dumps and paging entire sessions.

## Baseline Or Old-Skill Results

No previous handoff workflow skill existed; baseline was ad hoc conversation summary without validation.

## Assertion Grades

- verified-cited: PASS.
- uncertainty: PASS.
- shared-proposals: PASS.
- bounded: PASS.

## Validator Output

- handoff packet checker: PASS for good example.
- workflow skill bundle checker: PASS after implementation.
- test-report structure checker: PASS after implementation.

## Trigger Checks

- should trigger: "handoff this work to next agent" -> PASS.
- should trigger: "compact continuation packet" -> PASS.
- should not trigger: "summarize public article" -> PASS.

## Privacy Notes

Examples are synthetic. Real handoffs should cite ids and paraphrase sensitive transcript text.

## Changes Made After Testing

Created handoff skill bundle, packet reference, examples, evals, deterministic validator, and test report.

## Remaining Risks

Manual evals cover structure; future synthetic transcript fixtures could test richer synthesis.
