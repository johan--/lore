# UPD-003 - Handoff workflow with verified/open/stale/risky sections

Type: AFK · Label: ready-for-agent · Blocked by: UPD-002 · Plan: docs/PRD-agent-workflows-pack.md

## User stories covered

22-29, 31-32, 38-44, 48, 50

## What to build

Build the fresh-context continuation workflow: an installable `lore-handoff` skill that uses the recall/status/freshness contract from UPD-001 and the proposal/candidate vocabulary from UPD-002 to produce compact handoff packets for the next agent.

The handoff should help a fresh agent continue in the smart zone. It should separate verified facts, open work, stale claims, risky assumptions, relevant artifacts, proposal candidates, contradiction candidates, and next actions. It should cite evidence and reference existing artifacts instead of copying large transcript blocks.

## Acceptance criteria

- [ ] A new installable handoff workflow skill exists as a sibling skill folder under `skills/`.
- [ ] The handoff skill is a bundle, not a single file: it includes `SKILL.md`, `references/`, `examples/`, `evals/evals.json`, `evals/test-report.md`, and a script/checker for structured handoff examples.
- [ ] Handoff output includes verified, open, stale, risky, artifacts, proposals/candidates, and next-action sections.
- [ ] The handoff skill reuses the shared proposal/memory-card/contradiction vocabulary from UPD-002 rather than defining a private shape.
- [ ] The skill keeps output compact and explicitly avoids dumping large transcripts or paging entire sessions.
- [ ] Claims cite Lore evidence ids or are marked as uncited/open.
- [ ] The handoff preserves unresolved questions and risky assumptions rather than smoothing them into certainty.
- [ ] The skill explains when to re-run recall or inspect current repo files before acting on stale transcript evidence.
- [ ] Handoff eval specs cover completed work, unresolved work, stale claims, risky assumptions, candidate objects, contradictions, and no-dump behavior.
- [ ] Handoff examples include at least one good continuation packet and one bad/anti-pattern handoff that loses uncertainty, invents private proposal shapes, or dumps transcript text.
- [ ] `skills/lore-handoff/evals/test-report.md` is committed and records eval ids, fixture source, run mode, with-skill results, baseline/old-skill results when practical, assertion grades, structured checker output, trigger checks, privacy notes, changes made after testing, and remaining risks.
- [ ] The UPD-000 bundle-shape and test-report validators pass for `skills/lore-handoff`.
- [ ] Any deterministic helper added for handoff formatting has behavior-level tests.

## Blocked by

- UPD-002 - Brief workflow with proposal-only synthesis

## Verification

Run targeted tests for deterministic helpers, run the handoff skill eval/review pass, run the UPD-000 bundle/report validators for `skills/lore-handoff`, then `npm run check`. The slice is not complete until `skills/lore-handoff/evals/test-report.md` proves compactness, evidence, stale/risky handling, shared candidate vocabulary, contradiction preservation, and no-dump behavior with synthetic or scrubbed data.
