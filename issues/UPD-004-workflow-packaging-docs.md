# UPD-004 - Workflow pack packaging and documentation integration

Type: AFK · Label: ready-for-agent · Blocked by: UPD-003 · Plan: docs/PRD-agent-workflows-pack.md

## User stories covered

41-45, 48-50

## What to build

Finish the workflow pack as a shippable product surface. Ensure the sibling workflow skills are packaged, documented, and discoverable through the same published `skills/` tree as the existing Lore skill. Update user-facing docs so agents and users understand the difference between the low-level Lore skill and the higher-level recall, brief, handoff, and development-verification skills.

This slice should include install/load smoke checks for the sibling skill folders, deterministic bundle/test-report validators from UPD-000, package dry-run proof, and documentation that explains the optional future plugin wrapper without requiring one in this release.

## Acceptance criteria

- [ ] The published package includes the new sibling skill folders under `skills/`.
- [ ] A deterministic smoke check verifies every new workflow skill folder has the required bundle shape: `SKILL.md`, `references/`, `examples/`, `evals/evals.json`, `evals/test-report.md`, and required scripts/checkers when structured output exists.
- [ ] The smoke check validates `evals/test-report.md` structure, not just file presence, and fails hollow placeholder reports.
- [ ] Documentation explains the relationship between the existing low-level `lore` skill and the workflow skills.
- [ ] Documentation uses product names like `lore:recall`, `lore:brief`, and `lore:handoff` while pointing to the actual installable skill folders.
- [ ] Installation or package dry-run proof shows the skill folders are included.
- [ ] A smoke check proves the new skills can be found/read from the packaged tree.
- [ ] Documentation explains that these workflow skills are full bundles with references, examples, evals, validators, and evidence-backed test reports, not one-file prompt snippets.
- [ ] Documentation states that no workflow skill is complete until its test report proves the eval/review pass ran.
- [ ] README and onboarding docs do not imply that a universal plugin framework exists in this release.
- [ ] Docs preserve privacy/destructive-memory rules and proposal-only behavior.
- [ ] The final issue DAG and workflow execution notes are reflected in project docs where future agents will look.

## Blocked by

- UPD-003 - Handoff workflow with verified/open/stale/risky sections

## Verification

Run package/install smoke checks relevant to skills, including bundle-shape and test-report structure checks, then `npm run check`.
