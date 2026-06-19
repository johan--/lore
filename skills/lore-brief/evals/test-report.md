# Test Report - lore-brief

## Eval IDs And Prompts

- default-last-24-hours: Make brief with pinned now and no explicit dates.
- proposal-only: Create daily brief and propose jobs/skills/issues if useful.
- contradiction-candidate: Brief a day containing conflicting evidence.
- memory-card-candidates: Brief a day with memory-card candidate material.

## Fixture Source

Synthetic eval prompts in `skills/lore-brief/evals/evals.json` and synthetic example brief in `skills/lore-brief/examples/good-brief.json`. No real transcripts or private memory were committed.

## Run Mode

Manual with-skill review plus deterministic checker in `src/skills/brief-proposal-validation.ts` and UPD-000 workflow-skill bundle validator.

## With-Skill Results

- default-last-24-hours: PASS. Skill defaults to rolling last 24 hours and requires explicit ISO retrieval bounds plus local labels.
- proposal-only: PASS. Skill requires `sideEffects:false` and forbids creating jobs, issues, wiki pages, skills, tasks, memory cards, code, or automations.
- contradiction-candidate: PASS. Skill preserves both sides with evidence.
- memory-card-candidates: PASS. Shared vocabulary lists all required candidate kinds.

## Baseline Or Old-Skill Results

No previous `lore-brief` skill existed. Baseline was ad hoc summary from raw Lore commands with no proposal-only contract or shared vocabulary.

## Assertion Grades

- pinned-window: PASS. Deterministic helper computes exact 24-hour ISO window from pinned now.
- no-write: PASS. Checker rejects `sideEffects:true` and created-action language.
- both-sides: PASS. Checker rejects contradiction candidates missing either side evidence.
- candidate-kinds: PASS. Vocabulary reference includes decision, claim, commitment, artifact, contradiction, open_question.

## Validator Output

- brief proposal checker: PASS for good example.
- workflow skill bundle checker: PASS after implementation.
- test-report structure checker: PASS after implementation.

## Trigger Checks

- should trigger: "daily Lore brief" -> PASS, covered description.
- should trigger: "what happened in the last day and what should we propose" -> PASS.
- should trigger: "scheduled read-only continuity brief" -> PASS.
- should not trigger: "create the GitHub issues now" -> PASS, outside proposal-only brief.

## Privacy Notes

All examples synthetic. Real brief runs should cite ids and paraphrase sensitive transcript excerpts.

## Changes Made After Testing

Created `lore-brief` bundle, shared proposal vocabulary, examples, evals, deterministic validator, and test report.

## Remaining Risks

Manual evals prove workflow routing and structure. They do not prove all LLM synthesis quality; future synthetic transcript fixtures can improve coverage.

## Live Workflow Exercise - 2026-06-19

Ran the default-window status path against live Lore for `/Users/jordanhindo/lore`. The first run returned `possibly_unsynced` for the 2026-06-18..2026-06-19 window, with `schemaVersion:5` and `supportedSchemaVersion:3`; `lore sync codex` then failed with `newer_store`, so the brief skill correctly refused normal synthesis and emitted a proposal-only stale-window brief. The live brief artifact `/private/tmp/lore-live-skill-tests/brief-stale-window.json` passed `node skills/lore-brief/scripts/validate-brief.mjs`. After the schema-5 compatibility patch and rebuild, `lore status --json --source codex --project /Users/jordanhindo/lore --since 2026-06-19T00:00:00.000Z` returned `ready` with `schemaVersion:5` and `supportedSchemaVersion:5`, so current briefs are no longer blocked by the schema mismatch. This exercise also found and fixed the old private proposal shape in the brief validator.
