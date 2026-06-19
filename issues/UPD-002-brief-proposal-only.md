# UPD-002 - Brief workflow with proposal-only synthesis

Type: AFK · Label: ready-for-agent · Blocked by: UPD-001 · Plan: docs/PRD-agent-workflows-pack.md

## User stories covered

13-21, 26-32, 38-42, 44, 48-50

## What to build

Build the daily continuity workflow: an installable `lore-brief` skill that defaults to the last 24 hours, uses the recall/status/freshness contract from UPD-001, and produces a cited brief with proposal-only signals.

This is also the first vertical slice that emits proposals, so it owns the shared proposal vocabulary for skills, jobs, issues, wiki updates, fixes, tasks, memory-card candidates, and contradiction candidates. The vocabulary should be placed in shared bundled references/examples so handoff can reuse it later instead of inventing a parallel shape.

The brief should synthesize what happened, what remains open, what changed, what was learned, and what the evidence suggests proposing next. It may propose follow-up objects, but it must not perform those actions. Scheduled usage must be framed as read-only synthesis with no mutation authority.

## Acceptance criteria

- [ ] A new installable brief workflow skill exists as a sibling skill folder under `skills/`.
- [ ] The brief skill is a bundle, not a single file: it includes `SKILL.md`, `references/`, `examples/`, `evals/evals.json`, `evals/test-report.md`, and a script/checker for structured proposal/brief examples.
- [ ] The default time window is the rolling 24 hours ending at run time unless the user specifies another window.
- [ ] Date labels are displayed in the user's/local timezone, while retrieval filters use explicit ISO instants.
- [ ] Eval fixtures use a fake clock or pinned `now` value so default-window behavior is deterministic.
- [ ] The brief output separates completed activity, open work, changes, learned/discovered signals, stale or uncertain evidence, and proposals.
- [ ] Each major claim in the brief cites Lore evidence ids or explicitly reports that evidence was not found.
- [ ] Proposals use the structured no-side-effect shape from the PRD: kind, title, rationale, evidence ids, risk, and next action.
- [ ] The shared proposal vocabulary includes memory-card candidate kinds for decision, claim, commitment, artifact, contradiction, and open question.
- [ ] Contradiction candidates preserve both sides with evidence instead of resolving by averaging.
- [ ] The brief output explicitly carries or states `sideEffects: false` for scheduled/no-side-effect use.
- [ ] The skill tells agents not to create jobs, issues, wiki pages, skills, tasks, memory cards, or code unless the user asks for that follow-up.
- [ ] Brief eval specs cover default last-24-hours behavior, open-work detection, stale evidence, proposal-only behavior, memory-card candidates, contradiction candidates, and no unauthorized writes.
- [ ] Brief examples include at least one good brief and one bad/anti-pattern brief that violates proposal-only or evidence rules.
- [ ] `skills/lore-brief/evals/test-report.md` is committed and records eval ids, fixture source, run mode, with-skill results, baseline/old-skill results when practical, assertion grades, structured checker output, trigger checks, privacy notes, changes made after testing, and remaining risks.
- [ ] The UPD-000 bundle-shape and test-report validators pass for `skills/lore-brief`.
- [ ] Any deterministic helper added for time-window retrieval, proposal formatting, memory-card candidates, or contradiction candidates has behavior-level tests.

## Blocked by

- UPD-001 - Recall status and evidence packet tracer bullet

## Verification

Run targeted tests for deterministic helpers, run the brief skill eval/review pass, run the UPD-000 bundle/report validators for `skills/lore-brief`, then `npm run check`. The slice is not complete until `skills/lore-brief/evals/test-report.md` proves proposal-only, last-24-hours, evidence, candidate-object, and no-write behavior with synthetic or scrubbed data.
