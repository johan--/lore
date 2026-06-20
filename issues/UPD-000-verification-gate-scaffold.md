# UPD-000 - Verification gate scaffold for Lore workflow skills

Type: AFK · Label: ready-for-agent · Blocked by: None - can start immediately · Plan: docs/PRD-agent-workflows-pack.md

## User stories covered

33-38, 45, 50

## What to build

Build the verification gate before any workflow skill is considered done. This slice creates the project-specific `lore-dev-verification` skill at the minimum useful depth and adds deterministic checks/templates for workflow skill bundles and `evals/test-report.md` artifacts.

The goal is not to perfect every verification scenario up front. The goal is to make the completion rule executable for UPD-001 onward: future workflow-skill slices have a local verifier, a bundle-shape checker, and a test-report structure contract before they start.

## Acceptance criteria

- [ ] A new installable `lore-dev-verification` skill exists as a sibling skill folder under `skills/`.
- [ ] The dev-verification skill is a bundle, not a single file: it includes `SKILL.md`, `references/`, `examples/`, `evals/evals.json`, `evals/test-report.md`, and a script/checker for the verification matrix or checklist examples.
- [ ] The skill description clearly triggers for verifying Lore repo changes, PRs, issue slices, workflow skills, store/retrieval changes, adapter changes, and privacy/destructive-memory changes.
- [ ] The skill distinguishes default verification, targeted verification, workflow-skill review, real-store smoke checks, and package/install smoke checks.
- [ ] The skill tells agents which existing deterministic seams to use for CLI/MCP parity, retrieval, store migrations, adapter conformance, privacy, and setup/freshness behavior.
- [ ] A deterministic bundle-shape checker exists for workflow skills and fails when required folders/files are missing.
- [ ] A deterministic `evals/test-report.md` structure checker or equivalent validator exists and fails a hollow report that only contains placeholder prose.
- [ ] A reusable test-report template documents required sections: eval ids/prompts, fixture source, run mode, with-skill results, baseline/old-skill results when practical, assertion grades, validator output, trigger checks where relevant, privacy notes, changes made after testing, and remaining risks.
- [ ] The skill explicitly says real-store smoke output is local proof and must not be committed when it contains private transcript data.
- [ ] The skill includes eval specs or manual review prompts that check whether an agent chooses the right verification path for representative Lore changes.
- [ ] Examples cover at least a retrieval change, a skill-only change, a privacy/destructive-memory change, and an adapter/store change.
- [ ] `skills/lore-dev-verification/evals/test-report.md` is committed and records eval ids, fixture source, run mode, with-skill results, baseline/old-skill results when practical, assertion grades, checker output, trigger checks, privacy notes, changes made after testing, and remaining risks.

## Blocked by

None - can start immediately

## Verification

Run targeted tests for the bundle-shape and test-report validators, run the dev-verification skill review/eval pass, then `npm run check`. This slice is not complete until its own `evals/test-report.md` proves representative verification-routing behavior and documents any deliberately skipped benchmark or trigger-loop step.
