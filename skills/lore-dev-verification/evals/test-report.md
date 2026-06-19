# Test Report - lore-dev-verification

## Eval IDs And Prompts

- retrieval-change-routing: Verify a Lore change that adds freshness fields to search results exposed through CLI and MCP.
- workflow-skill-routing: Verify a Lore workflow skill-only change to lore-brief.
- privacy-change-routing: Verify a change touching Lore forget/exclude destructive memory behavior.

## Fixture Source

Synthetic prompts from `skills/lore-dev-verification/evals/evals.json`. No real Lore transcripts, credentials, private project text, or personal memory were used.

## Run Mode

Manual with-skill review using the drafted `lore-dev-verification` instructions plus deterministic validator checks from `src/skills/workflow-skill-validation.ts`.

## With-Skill Results

- retrieval-change-routing: PASS. The skill routes the change to CLI/MCP parity, retrieval tests, bounded/null-field checks, privacy fixture review, and `npm run check`.
- workflow-skill-routing: PASS. The skill routes the change to bundle-shape validation, test-report validation, skill eval/review evidence, and `npm run check`.
- privacy-change-routing: PASS. The skill routes the change to forget/exclude/tombstone tests, explicit-confirm review, no destructive MCP exposure, privacy fixture checks, and `npm run check`.

## Baseline Or Old-Skill Results

Baseline comparison is not available because `lore-dev-verification` is a new skill with no prior version in this repo. The old baseline behavior was ad hoc use of `AGENTS.md` verification commands and had no reusable bundle/test-report validator.

## Assertion Grades

- cli-mcp-parity: PASS. Evidence: `references/verification-matrix.md` requires parity tests for shared CLI/MCP retrieval/status surfaces.
- bounded-null-fields: PASS. Evidence: retrieval example requires bounded output and `null` for unknown source data.
- full-check: PASS. Evidence: every matrix row keeps `npm run check` as final gate unless issue scope explicitly narrows it.
- bundle-validator: PASS. Evidence: quick start and skill review reference require the workflow skill bundle validator.
- report-validator: PASS. Evidence: quick start and skill review reference require the test-report structure validator.
- eval-report: PASS. Evidence: skill review reference defines concrete `evals/test-report.md` requirements.
- destructive-cli-only: PASS. Evidence: privacy example requires no destructive MCP exposure.
- confirm-gate: PASS. Evidence: privacy example requires explicit confirmation behavior.
- privacy-fixtures: PASS. Evidence: rules and examples reject real transcript or credential fixtures.

## Validator Output

- workflow-skill bundle checker: PASS for `skills/lore-dev-verification` after implementation.
- test-report structure checker: PASS for this report after implementation.
- package validator: PASS for required UPD-000 skill set after implementation.

## Trigger Checks

- should trigger: "verify this Lore PR before merge" -> PASS, covered by description.
- should trigger: "check a workflow skill bundle and test report" -> PASS, covered by description.
- should trigger: "review a destructive memory change" -> PASS, covered by description.
- should not trigger: "summarize my groceries" -> PASS, outside Lore verification.

## Privacy Notes

All evals and examples are synthetic. Real-store smoke checks are documented as local-only proof and must not commit private message contents.

## Changes Made After Testing

Added deterministic validators for workflow skill bundle shape and `evals/test-report.md` structure, plus examples and references clarifying verification routing.

## Remaining Risks

This report proves the dev-verification skill routes representative verification scenarios and that its structure can be checked. Later workflow skills still need their own with-skill eval evidence and validator output.
