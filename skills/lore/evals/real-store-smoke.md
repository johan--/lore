# Real-store smoke proof — `lore` skill

The deterministic envelope-parity grader (`src/cli/cli-mcp-parity.test.ts`) runs
against a small seeded fixture store so grading is reproducible. This file is the
companion **real-store** check: the same commands run against the live
`~/.lore/lore.db` to prove the drill-down loop works on real, large data and that
the dump-cap holds. Re-run by hand after changes to the retrieval path.

Run from the repo root after `npm run build` (substitute a keyword you know is in
your own history):

```bash
# 1. Find — search hands back real message/session ids
node dist/cli/lore.js search "tokenizer" --limit 2 --json     # → { count, hits }, each hit has messageId + sessionId

# 2. Read back the EXACT id search returned (never invented)
node dist/cli/lore.js get <messageId> --full --json           # → full message detail object
node dist/cli/lore.js context <messageId> --before 2 --after 2 --json  # → 5-msg window, one isAnchor:true

# 3. Navigate the session it belongs to — bounded, never dumped
node dist/cli/lore.js session <sessionId> --limit 3 --json    # → 3 messages + a nextCursor
node dist/cli/lore.js session <sessionId> --limit 9999 --json # → STILL capped (40), proof of drill-down-never-dump

# 4. Survey
node dist/cli/lore.js sessions --limit 2 --json               # → { count, sessions }
node dist/cli/lore.js timeline --json                         # → { buckets }
node dist/cli/lore.js search "tokenizer" --relevant --json    # → recency-blended ranking
```

## Last verified result (2026-06-07, store ≈ 2.8 GB)

- `search` → `count: 2`, real `messageId`/`sessionId` returned.
- `get --full` → full detail object, text length 7414.
- `context --before 2 --after 2` → window of 5, anchor flagged.
- `session --limit 3` → exactly 3 messages, `nextCursor` present.
- `session --limit 9999` → **40** messages returned — hard cap held, no dump.
- `sessions` → rollups with `messageCount`, project, time span.
- `timeline` → 66 day-buckets (latest `2026-06-08`, count 5670).
- `search --relevant` → ranked by recency-blended score.

Every step used only the CLI; no `lore serve` was running.
