# Issue 6 — Redaction on by default

Type: AFK · Blocked by: none (parallel with Issue 5) · Plan: docs/PRD-memory-control.md · Decision: docs/adr/0001-redaction-on-by-default.md

## What to build

Flip credential redaction from opt-in to default-on for every write path, with a `--no-redact` escape hatch. The redaction pass itself (`src/core/redact.ts`) is correct and unchanged — only the default wiring and the CLI flags change.

Scope:
- **One default at the chokepoint.** Change `writeRecordBatch` to resolve `opts.redact ?? true`. Because backfill (`indexFile`), the hook, `setup` (via `backfillDirectory`), and `push` all converge here, this single change makes every path redact by default — including `push`, which passes no redact option today and so currently never redacts.
- **Replace `--redact` opt-in with `--no-redact` opt-out** at the CLI entry points that currently parse `rest.includes("--redact")` — `index` and `hook` in `src/cli/lore.ts`. Each must parse `--no-redact` and pass `redact: false` when present (default omits the option → write path defaults it on).
- **Plumb the opt-out through `setup`.** `runSetup` calls `backfillDirectory` with no redact param; `backfillDirectory` already threads `redact` to `indexFile`. Add a way for the setup CLI entry to pass `redact: false` when `--no-redact` is given, mirroring `index`/`hook`.
- **Invert the stale test.** `index-file.test.ts`'s "keeps secrets verbatim by default" case encodes the old opt-in behavior. Rewrite it to assert the new default: a seeded credential is redacted by default; with `--no-redact` (redact: false) it stays verbatim; non-credential content is untouched in both cases.

## Acceptance criteria

- [ ] `npm run check` passes.
- [ ] A seeded credential (e.g. an `sk-…` key) indexed via backfill with no redact option is stored redacted.
- [ ] The same credential indexed via the hook with no redact option is stored redacted.
- [ ] A record written via `push` with no redact option is redacted (behavior test through `writeRecordBatch`).
- [ ] Passing `redact: false` (the `--no-redact` path) keeps the credential verbatim.
- [ ] Non-credential conversational content is byte-identical whether redaction is on or off.
- [ ] The inverted `index-file.test.ts` assertion passes and no longer claims verbatim-by-default.

## Verification

`npm run check`
