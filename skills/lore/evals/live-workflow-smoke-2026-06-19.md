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

Result: PASS for read-path mechanics. Search/get/context/session-around/sessions/timeline all worked via the `lore` CLI against the schema-5 live store after rebuild. Initial `lore search "UPD-004 package smoke"` returned zero hits before write compatibility was restored; after the schema-5 fix and rebuild, the same query returned current 2026-06-19 UPD-004 evidence.

## Recall Skill

Output artifact: `/private/tmp/lore-live-skill-tests/recall-evidence-packet.json`.

Validation:

```bash
node skills/lore-recall/scripts/validate-evidence-packet.mjs /private/tmp/lore-live-skill-tests/recall-evidence-packet.json
```

Result: PASS. The packet uses a real Lore message id (`fc676f70cb5100eb56867acfa1e1e788dbd2837edca1232b77bb2eb9e85f7ad3`) and explicitly labels the evidence stale. A follow-up post-fix recall query for `UPD-004 package smoke` returned current 2026-06-19 evidence after `lore sync codex` could write to the schema-5 store.

## Brief Skill

Live default-window status command:

```bash
lore status --json --source codex --project /Users/jordanhindo/lore --since 2026-06-18T00:00:00.000Z --until 2026-06-19T23:59:59.999Z
```

Initial result: `status:"possibly_unsynced"`, `messageCount:0`, `schemaVersion:5`, `supportedSchemaVersion:3`. Recovery correctly said this checkout could read the newer store but could not run write/sync recovery.

Post-fix result after porting the schema-5 content-hash migration/writer, running `npm run build`, and running `lore sync codex`: `status:"ready"`, `schemaVersion:5`, `supportedSchemaVersion:5`, and same-day Codex evidence present for `/Users/jordanhindo/lore`.

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

Result: PASS. The handoff packet uses the same live evidence and preserves the original contradiction: read-only Lore was usable for older evidence while write recovery was blocked. That blocker is now resolved for schema 5 after the content-hash compatibility patch.

## Dev Verification Skill

The live run changed the verification standard: workflow-skill validation is necessary but not sufficient. Real skill testing must include using the skill against live Lore or an equivalent fixture that exercises the complete workflow path. This run found issues that bundle validators missed:

- `lore status` recovery for `possibly_unsynced` newer stores recommended impossible sync recovery.
- `lore-brief` validator used a private proposal shape inconsistent with the shared vocabulary and `lore-handoff`.
- Main `skills/lore` did not route agents to the workflow skills and still said not to hand off to another skill.
- `lore sync codex` could not write to Jordan's live schema-5 store until this branch ported the content-hash schema/writer semantics and bumped support to schema 5.
- CLI/package help under-described freshness/status and workflow-skill routing, so `package:smoke` now checks for core command, workflow-skill, and schema-version help snippets.

## Remaining Risk

`lore sync codex` no longer fails with `newer_store` after build; current-day status for `/Users/jordanhindo/lore` is `ready` with `schemaVersion:5` and `supportedSchemaVersion:5`. A separate reliability risk remains: raw manual sync can overlap another live sync and log `database is locked` for a few active files while still completing. Use the lock-protected Codex notify wrapper for routine freshness, and track raw-sync lock reporting/retry as a follow-up if it recurs.
