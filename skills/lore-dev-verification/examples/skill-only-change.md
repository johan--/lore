# Example: Workflow Skill Change Verification

Change: update `skills/lore-brief` instructions.

Plan:

- Run the bundle-shape validator for `skills/lore-brief`.
- Run the test-report validator for `skills/lore-brief/evals/test-report.md`.
- Execute the skill eval/review pass described in `evals/evals.json`.
- Record validator output, assertion grades, trigger checks, and remaining risks
  in `evals/test-report.md`.
- Run `npm run check` before merge.
