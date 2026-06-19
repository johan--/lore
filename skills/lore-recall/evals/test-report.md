# Test Report - lore-recall

## Eval IDs And Prompts

- fuzzy-query-planning: answer vague memory packet request using query variants and cited evidence.
- last-session-in-repo: recall last Codex session for repo without dumping whole session.
- failed-empty-retrieval: handle absent decision in scoped store.
- freshness-warning: answer from old transcript with freshness warning.

## Fixture Source

Synthetic eval prompts in `skills/lore-recall/evals/evals.json` and synthetic packet examples in `skills/lore-recall/examples/`. No real transcript excerpts, credentials, private project text, or personal memory were committed.

## Run Mode

Manual with-skill review against the four synthetic prompts, plus deterministic evidence-packet checker and UPD-000 workflow-skill validator.

## With-Skill Results

- fuzzy-query-planning: PASS. The skill requires status, multiple query variants, real ids, drill-down, and a bounded evidence packet.
- last-session-in-repo: PASS. The skill forbids whole-session dumps and points to `context` or `session --around` windows.
- failed-empty-retrieval: PASS. The skill reports gaps/no-matches and next queries instead of fabricating.
- freshness-warning: PASS. The skill labels freshness and states current artifacts outrank transcript claims.

## Baseline Or Old-Skill Results

Previous baseline was the low-level `skills/lore` CLI manual. It explains commands well but does not require recall plans, explicit freshness labels, evidence packets, or failure ledgers.

## Assertion Grades

- has-query-plan: PASS. Evidence: `references/query-planning.md` requires multiple variants and rationale.
- cites-real-ids: PASS. Evidence: `SKILL.md` trust rules forbid invented ids.
- no-dump: PASS. Evidence: quick start and trust rules forbid whole-session dumps.
- bounded-drilldown: PASS. Evidence: quick start requires `get`, `context`, or `session --around` from real ids.
- reports-gaps: PASS. Evidence: failure recovery and packet contract require `gaps`.
- no-fabrication: PASS. Evidence: failure recovery says do not invent memory.
- freshness-label: PASS. Evidence: `references/freshness.md` defines required labels.
- truth-hierarchy: PASS. Evidence: trust rules say current files/tests/runtime beat stale transcripts.

## Validator Output

- evidence packet checker: PASS for `examples/good-evidence-packet.json`.
- workflow skill bundle checker: PASS after implementation.
- test-report structure checker: PASS after implementation.

## Trigger Checks

- should trigger: "use Lore to recall what we decided" -> PASS, covered description.
- should trigger: "what happened in the last session for this repo" -> PASS, covered description.
- should trigger: "find evidence from previous agent sessions" -> PASS, covered description.
- should not trigger: "write a new database migration with no memory question" -> PASS, outside recall unless past context needed.

## Privacy Notes

All examples use synthetic ids and excerpts. Real usage should paraphrase or quote only short necessary excerpts, with provenance, and never commit private transcript content as fixtures.

## Changes Made After Testing

Created the recall workflow skill bundle, evidence packet contract, query planning and freshness references, good/bad/failure examples, eval specs, deterministic packet checker, and this report.

## Remaining Risks

Manual evals prove routing and output contract, not LLM quality at scale. Future iterations can add transcript-fixture simulations once safe synthetic fixtures exist.
