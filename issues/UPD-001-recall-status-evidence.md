# UPD-001 - Recall status and evidence packet tracer bullet

Type: AFK · Label: ready-for-agent · Blocked by: UPD-000 · Plan: docs/PRD-agent-workflows-pack.md

## User stories covered

1-12, 30-36, 38-43, 48, 50

## What to build

Build the first user-facing vertical slice of the Lore Agent Workflows Pack: a recall workflow that can check Lore health, retrieve evidence, label freshness, and return a bounded evidence packet. This slice proves the full path from deterministic substrate to installable workflow skill under the verification gate from UPD-000.

The slice includes a read-only Lore health surface with CLI/MCP parity, minimum freshness metadata needed by workflow outputs, an installable `lore-recall` skill folder, and workflow eval specs that demonstrate query planning, drill-down, provenance, freshness, bounded context, and retrieval-failure handling.

The recall skill should use the existing low-level Lore skill as the substrate reference, not duplicate setup/indexing instructions. It should teach agents to plan searches, use real ids from Lore output, fetch context only when useful, distinguish evidence from truth, report gaps, and avoid unbounded session dumps.

## Acceptance criteria

- [ ] A read-only health/status command returns a structured JSON envelope for ready, missing store, empty store, unreadable store, newer store, stale schema, source absent, project absent, and possibly unsynced states.
- [ ] `lore status --json` accepts explicit scoped inputs for states that require scope: `--source <name>`, `--project <path>`, `--since <iso>`, and `--until <iso>`.
- [ ] The matching MCP read tool exposes equivalent optional parameters and returns the same status envelope for the same operation.
- [ ] `source_absent` is returned only when a source filter is supplied and no indexed messages exist for that source.
- [ ] `project_absent` is returned only when a project filter is supplied and no indexed messages exist for that project after any source filter is applied.
- [ ] `possibly_unsynced` is returned only when a scoped ready store has no indexed message/index timestamp inside a caller-provided active window, or when the relevant freshness metadata is unknown.
- [ ] Search-specific misses remain `count: 0` / `no_matches` in evidence packets, not status failures.
- [ ] Status and retrieval additions preserve bounded output and do not mutate the store.
- [ ] Retrieval evidence exposes the minimum freshness fields needed by the PRD, using `null` for unknown source data rather than guessing.
- [ ] A new installable recall workflow skill exists as a sibling skill folder under `skills/`.
- [ ] The recall skill is a bundle, not a single file: it includes `SKILL.md`, `references/`, `examples/`, `evals/evals.json`, `evals/test-report.md`, and a script/checker for structured evidence-packet examples.
- [ ] The recall skill produces an evidence packet with retrieval plan, selected evidence, freshness labels, cited ids, and gaps/no-matches.
- [ ] The recall skill explains that raw transcripts are testimony, not truth, and directs agents to prefer current files/tests/runtime artifacts over stale memory when they disagree.
- [ ] Recall eval specs cover fuzzy query planning, last-session-in-repo recall, failed/empty retrieval recovery, freshness warning, and no-dump behavior.
- [ ] Recall examples include at least one good evidence packet and one bad/anti-pattern output that shows what agents must avoid.
- [ ] `skills/lore-recall/evals/test-report.md` is committed and records eval ids, fixture source, run mode, with-skill results, baseline/old-skill results when practical, assertion grades, structured checker output, trigger checks, privacy notes, changes made after testing, and remaining risks.
- [ ] The UPD-000 bundle-shape and test-report validators pass for `skills/lore-recall`.
- [ ] Deterministic tests cover the status envelope, scoped status inputs, freshness metadata, and CLI/MCP parity for any changed retrieval surfaces.
- [ ] No real transcript excerpts, credentials, or private memory are committed as fixtures.

## Blocked by

- UPD-000 - Verification gate scaffold for Lore workflow skills

## Verification

Run the targeted deterministic tests for status/retrieval changes, run the recall skill eval/review pass, run the UPD-000 bundle/report validators for `skills/lore-recall`, then `npm run check`. The slice is not complete until `skills/lore-recall/evals/test-report.md` proves the skill behavior was exercised with synthetic or scrubbed data.
