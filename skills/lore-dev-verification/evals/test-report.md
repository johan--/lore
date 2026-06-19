# Test Report - lore-dev-verification

## Eval IDs And Prompts

- retrieval-change-routing: Verify Lore change adds freshness fields search results exposed through CLI and MCP.
- workflow-skill-routing: Verify Lore workflow skill-only change lore-brief.
- privacy-change-routing: Verify change touching Lore forget/exclude destructive memory behavior.

## Fixture Source

Synthetic prompts `skills/lore-dev-verification/evals/evals.json`. No real Lore transcripts, credentials, private project text, or personal memory were used.

## Run Mode

Manual with-skill review using drafted `lore-dev-verification` instructions plus deterministic validator checks in `src/skills/workflow-skill-validation.ts`.

## With-Skill Results

- retrieval-change-routing: PASS. The skill routes the change to CLI/MCP parity, retrieval tests, bounded/null-field checks, privacy fixture review, and `npm run check`.
- workflow-skill-routing: PASS. The skill routes the change to bundle-shape validation, test-report validation, skill eval/review evidence, and `npm run check`.
- privacy-change-routing: PASS. The skill routes the change to forget/exclude/tombstone tests, explicit-confirm review, no destructive MCP exposure, privacy fixture checks, and `npm run check`.

## Baseline Or Old-Skill Results

Baseline comparison is not available because `lore-dev-verification` is a new skill with no prior repo version. Previous baseline behavior was ad hoc use of `AGENTS.md` verification commands with no reusable bundle/test-report validator.

## Assertion Grades

- cli-mcp-parity: PASS. Evidence: `references/verification-matrix.md` requires parity tests for shared CLI/MCP retrieval/status surfaces.
- bounded-null-fields: PASS. Evidence: retrieval example requires bounded output and `null` for unknown source data.
- full-check: PASS. Evidence: every matrix row keeps `npm run check` as the final gate unless issue scope explicitly narrows it.
- bundle-validator: PASS. Evidence: quick start and skill review reference require workflow skill bundle validator.
- report-validator: PASS. Evidence: quick start and skill review reference require test-report structure validator.
- eval-report: PASS. Evidence: skill review reference defines concrete `evals/test-report.md` requirements.
- destructive-cli-only: PASS. Evidence: privacy example requires no destructive MCP exposure.
- confirm-gate: PASS. Evidence: privacy example requires explicit confirmation behavior.
- privacy-fixtures: PASS. Evidence: rules and examples reject real transcript or credential fixtures.

## Validator Output

- workflow-skill bundle checker: PASS `skills/lore-dev-verification` implementation and reviewer fixes.
- evals schema checker: PASS rejects missing or empty eval cases and assertion-less evals.
- test-report structure checker: PASS report implementation.
- package validator: PASS required UPD-000 skill set implementation.

## Trigger Checks

- should trigger: "verify Lore PR before merge" -> PASS, covered description.
- should trigger: "check workflow skill bundle test report" -> PASS, covered description.
- should trigger: "review destructive memory change" -> PASS, covered description.
- should not trigger: "summarize my groceries" -> PASS, outside Lore verification.

## Privacy Notes

All evals and examples are synthetic. Real-store smoke checks are documented as local-only proof and must not commit private message contents.

## Changes Made After Testing

Added deterministic validators for workflow skill bundle shape and `evals/test-report.md` structure, plus examples and references clarifying verification routing. Post-review fixes added evals schema validation, source-checkout validator fallback through local `tsx`, and explicit setup/freshness verification routing.

## Remaining Risks

This report proves the dev-verification skill routes representative verification scenarios and that structure can be checked. Later workflow skills still need their own with-skill eval evidence and validator output.

## Live Workflow Exercise - 2026-06-19

Applied the verification skill to the workflow-pack itself after validator-only testing proved insufficient. Live tests against Lore found three issues that static bundle checks missed: stale-window recovery recommended an impossible sync path for a newer store, `lore-brief` used an inconsistent private proposal shape, and the main `skills/lore` entrypoint did not route to the new workflow skills. These were patched and covered by targeted tests/validators. Remaining risk: `lore sync codex` still cannot write to the schema-5 live store from this checkout.
