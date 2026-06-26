# CSH-004 - Base Lore skill and package verification proof

Type: AFK · Label: ready-for-agent · Blocked by: CSH-001, CSH-002, CSH-003 · Plan: docs/PRD-claude-code-sync-hardening.md

## Parent

docs/PRD-claude-code-sync-hardening.md

## User stories covered

14-15, 25-29, 35-36

## What to build

Close the verification loop for the hardening program. The base `lore` skill is
the product substrate skill, not a workflow skill, so changed setup guidance
needs concrete product-skill eval evidence rather than the workflow-skill bundle
validator. Package smoke must also verify the script entrypoints that docs tell
users to copy.

This slice also owns the final proof bundle: targeted tests, package smoke,
full repo verification, live-safe smoke where appropriate, and review readiness
without merging.

## Acceptance criteria

- [ ] The base `lore` skill eval spec includes prompts/assertions for safe Claude Code catch-up and Hermes detected sync.
- [ ] A committed base-skill test report records fixture source, run mode, assertions, validator output, trigger checks, privacy notes, changes made, and remaining risks.
- [ ] The report explicitly explains why workflow-skill validation applies to workflow skills and not the base product skill.
- [ ] Package smoke verifies every packaged script that docs tell users to run or copy, including the Codex notify wrapper.
- [ ] The PRD is updated with critic adjudication and no longer misleads future agents about already-completed work.
- [ ] Final verification includes targeted tests, `npm run package:smoke`, and `npm run check`.
- [ ] No merge is performed until Jordan explicitly approves after PR bots and final review.

## Blocked by

- CSH-001
- CSH-002
- CSH-003

## Verification

Run package smoke, targeted skill/setup tests, full repo verification, and a
final review against docs/PRD-claude-code-sync-hardening.md.
