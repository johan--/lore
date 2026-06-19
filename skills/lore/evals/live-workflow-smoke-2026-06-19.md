# Live Workflow Smoke - 2026-06-19

This is the real-use check for the main `lore` skill and the workflow skills layered on top of it. It was run against Jordan's live `~/.lore/lore.db` from `/Users/jordanhindo/lore` on 2026-06-19. It intentionally records failures as product evidence.

## Main Lore CLI Skill

Commands exercised:

- `lore help`
- `lore status --json --source codex --project /Users/jordanhindo/lore`
- `lore search "UPD-004 package smoke" --source codex --project /Users/jordanhindo/lore --limit 5 --json`
- `lore search "workflow" --source codex --project /Users/jordanhindo/lore --limit 3 --json`
- `lore get fc676f70cb5100eb56867acfa1e1e788dbd2837edca1232b77bb2eb9e85f7ad3 --json`
- `lore context fc676f70cb5100eb56867acfa1e1e788dbd2837edca1232b77bb2eb9e85f7ad3 --before 1 --after 1 --json`
- `lore session rollout-2026-06-08T09-41-29-019ea81c-53e1-7ff3-bcf0-20dc750b987c --around fc676f70cb5100eb56867acfa1e1e788dbd2837edca1232b77bb2eb9e85f7ad3 --before 1 --after 1 --json`
- `lore sessions --project /Users/jordanhindo/lore --source codex --limit 1 --json`
- `lore timeline --project /Users/jordanhindo/lore --source codex --json`

Result: PASS for read-path mechanics. Search/get/context/session-around/sessions/timeline all worked via the `lore` CLI against the schema-5 live store after rebuild. `lore search "UPD-004 package smoke"` returned zero hits, while broader `workflow` returned older repo evidence. This proves drill-down works but also proves current workflow-pack work was not indexed.

## Recall Skill

Output artifact: `/private/tmp/lore-live-skill-tests/recall-evidence-packet.json`.

Validation:

```bash
node skills/lore-recall/scripts/validate-evidence-packet.mjs /private/tmp/lore-live-skill-tests/recall-evidence-packet.json
```

Result: PASS. The packet uses a real Lore message id (`fc676f70cb5100eb56867acfa1e1e788dbd2837edca1232b77bb2eb9e85f7ad3`) and explicitly labels the evidence stale. Exact current-work queries missed, then a broadened query found older workflow evidence.

## Brief Skill

Live default-window status command:

```bash
lore status --json --source codex --project /Users/jordanhindo/lore --since 2026-06-18T00:00:00.000Z --until 2026-06-19T23:59:59.999Z
```

Result: `status:"possibly_unsynced"`, `messageCount:0`, `schemaVersion:5`, `supportedSchemaVersion:3`. Recovery now correctly says this checkout can read the newer store but cannot run write/sync recovery, and Lore must be updated before `lore sync` or an index hook can refresh the window.

Output artifact: `/private/tmp/lore-live-skill-tests/brief-stale-window.json`.

Validation:

```bash
node skills/lore-brief/scripts/validate-brief.mjs /private/tmp/lore-live-skill-tests/brief-stale-window.json
```

Result: PASS after fixing `lore-brief` to use the shared proposal vocabulary (`kind`, `title`, `why`, `evidenceIds`, `sideEffects:false`) instead of the old private `rationale`/`risk`/`nextAction` shape. The live brief correctly refuses normal daily synthesis and emits gaps/proposals only.

## Handoff Skill

Output artifact: `/private/tmp/lore-live-skill-tests/handoff-live.json`.

Validation:

```bash
node skills/lore-handoff/scripts/validate-handoff.mjs /private/tmp/lore-live-skill-tests/handoff-live.json
```

Result: PASS. The handoff packet uses the same live evidence and preserves the contradiction: read-only Lore is usable for older evidence, but write recovery is blocked and current daily briefing is stale.

## Dev Verification Skill

The live run changed the verification standard: workflow-skill validation is necessary but not sufficient. Real skill testing must include using the skill against live Lore or an equivalent fixture that exercises the complete workflow path. This run found issues that bundle validators missed:

- `lore status` recovery for `possibly_unsynced` newer stores recommended impossible sync recovery.
- `lore-brief` validator used a private proposal shape inconsistent with the shared vocabulary and `lore-handoff`.
- Main `skills/lore` did not route agents to the workflow skills and still said not to hand off to another skill.

## Remaining Risk

`lore sync codex` still fails against the live schema-5 store from this checkout with `newer_store`. Until write compatibility is restored or a newer Lore build is used, daily/current briefs cannot be proven from the live store.
