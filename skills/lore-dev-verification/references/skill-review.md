# Workflow Skill Review

A Lore workflow skill is an evidence product, not a prompt snippet.

## Required bundle

- `SKILL.md`
- `references/`
- `examples/`
- `evals/evals.json`
- `evals/test-report.md`
- `scripts/` when the skill teaches structured output that can be checked

## Test-report requirements

`evals/test-report.md` must include concrete evidence for:

- Eval ids and prompts
- Fixture source
- Run mode
- With-skill results
- Baseline or old-skill results when practical, or a real reason for skipping
- Assertion grades
- Validator output
- Trigger checks when discoverability matters
- Privacy notes
- Changes made after testing
- Remaining risks

A report containing only `TODO`, `TBD`, `placeholder`, or empty headings is not a
report. Run the validator before calling the skill complete.
