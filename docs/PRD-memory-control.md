# PRD — `lore`: user control over memory (redaction on by default, forget, exclude)

> Status: draft · Created 2026-06-08 · Repo: `~/lore` · Glossary: `CONTEXT.md` · Decisions: `docs/adr/0001-redaction-on-by-default.md`, `docs/adr/0002-destructive-ops-require-explicit-confirm.md`

## Problem Statement

Lore captures everything an agent says and does, verbatim, into a local store and keeps it forever. That fidelity is the product — but today the user has almost no control over what lands there or what stays there. Three concrete gaps:

1. **Secrets land verbatim by default.** A conservative credential-redaction pass exists (`src/core/redact.ts`) but is opt-in and off. So the moment a session containing a pasted API key, GitHub token, or private key is captured — by backfill or by the live hook — that credential is written into the store in the clear, and any re-index resurrects it. The protection is built and switched off.

2. **There is no way to remove memory.** Once a conversation is indexed, the user cannot delete it. If they realize a chat contained a password, a customer name, or anything they did not want kept, their only options are to ignore it or to manually surgery the SQLite file. There is no honest "forget this."

3. **There is no way to keep memory from being captured in the first place.** A user working in an NDA'd client repo has no way to say "never index this project." Every session there flows into the shared store like any other.

These are trust boundaries. A memory tool that cannot forget, cannot decline to remember, and cannot keep a live credential out of its own index is one users cannot safely point at their real work. The gaps were surfaced directly by a public reviewer asking whether they could scope, delete, and expire their data.

## Solution

Give the user real, legible control over their memory, in three layers, without betraying the "kept forever, kept whole" promise that makes lore worth using.

**Redaction on by default.** Turn the existing credential-redaction pass on for both the live hook and backfill/`setup`. Only obvious live credentials are scrubbed at capture; everything else — your words, the agent's reasoning, tool output — is kept verbatim. A `--no-redact` escape hatch remains for the rare user who genuinely wants a credential stored. The "verbatim" promise is reframed to cover conversational content, not live secrets (see ADR 0001). This is the *automatic* defense: most pasted credentials never land at all.

**Forget.** A user-invoked command to remove already-indexed memory at session or project granularity. `lore forget --session <id>` wipes one conversation; `lore forget --project <path>` wipes everything currently indexed from one repo. Forget is point-in-time: it removes what is there now and records a **tombstone** so re-indexing or a live `push` cannot resurrect it, but it does not bar future sessions — work continues to be remembered.

**Exclude.** A standing rule that a project is never indexed. `lore exclude --project <path>` writes a project tombstone so all future captures from that repo are refused, and deletes anything already indexed from it — exclude is strictly stronger than forget. `lore exclude --list` shows the standing rules; `lore exclude --remove <path>` lifts a rule (allowing future capture again, though it never restores already-deleted data).

**Safety on every permanent action.** Forget and exclude are destructive and irreversible. Running the bare command prints a non-destructive **preview** — the exact scope and counts of what would be removed — and does nothing else. Execution requires re-running with an explicit `--confirm` flag. There is no interactive `y/N` prompt, because lore is driven by headless agents as often as by humans (see ADR 0002). Neither verb is exposed as an MCP tool; the only way memory dies is a deliberate CLI call.

From the user's perspective: a pasted API key does not silently become a permanent memory; a conversation they regret can be truly forgotten and stay forgotten; an NDA'd repo can be walled off from the store entirely; and no permanent deletion ever happens without them seeing exactly what they are about to lose and confirming it.

## User Stories

1. As a user, I want pasted live credentials scrubbed from my memory automatically at capture, so that an API key never becomes a permanent record without my asking.
2. As a user, I want redaction applied during the initial backfill of my existing history, so that an old credential already sitting in past transcripts is scrubbed too, not just future ones.
3. As a user, I want redaction applied to live sessions via the hook, so that credentials I paste today never land verbatim.
4. As a user who genuinely needs a credential stored, I want a `--no-redact` escape hatch, so that I can opt out of scrubbing when I have a real reason.
5. As a user, I want the "verbatim, nothing dropped" promise rewritten to be honest about credential scrubbing, so that the docs match what the tool actually does.
6. As a user, I want to forget a single session, so that one conversation I regret can be removed from my memory.
7. As a user, I want to forget everything from a single project, so that I can wipe a repo's history without losing the rest of my memory.
8. As a user, I want forgotten data to stay gone after re-indexing, so that the next `lore setup` or `lore index` does not quietly bring it back.
9. As a user, I want forgotten data to stay gone even if a harness streams it back via `push`, so that the live-write path cannot resurrect what I deleted.
10. As a user, I want `forget --project` to be point-in-time, so that after wiping a repo's history my future work there is still remembered.
11. As a user, I want to exclude a project from indexing entirely, so that an NDA'd or sensitive repo never enters my store.
12. As a user, I want excluding a project to also delete anything already indexed from it, so that "never remember this repo" is true retroactively, not just going forward.
13. As a user, I want to list my standing exclusions, so that I can audit which repos are walled off.
14. As a user, I want to lift an exclusion, so that I can start remembering a repo again if my situation changes.
15. As a user, I want lifting an exclusion to be honest that it does not restore deleted history, so that I am not surprised when old data does not come back.
16. As a user, I want a preview of exactly what a forget will remove (counts and scope) before anything is deleted, so that I understand the blast radius.
17. As a user, I want a preview of what an exclude will remove and bar before it runs, so that I see both the deletion and the standing rule I am creating.
18. As a user, I want destructive commands to do nothing unless I add an explicit `--confirm`, so that I can never delete memory by accident or by a stray keystroke.
19. As a user, I want no interactive prompt on destructive commands, so that the behavior is identical and safe whether I run it or an agent runs it headless.
20. As a coding agent, I want a clear instruction sequence for destructive memory operations, so that I always show the user the preview and get explicit approval before running `--confirm`.
21. As a user, I want forget and exclude to be unavailable over MCP, so that a compromised or misbehaving MCP client can never wipe my memory.
22. As a user, I want forget to work on a single session even inside a multi-session store file (cursor, hermes), so that I can remove one conversation without nuking the other conversations sharing that file.
23. As a user, I want to understand that cursor sessions can only be forgotten by session (not project), so that I am not confused when `--project` does not match cursor history.
24. As a coding agent, I want the `lore` skill to teach the forget/exclude commands and the confirmation protocol, so that I can help the user control their memory correctly.
25. As a user, I want the README, AGENT-ONBOARD, and PRD copy updated for the new defaults and commands, so that the documentation does not lie about how the tool behaves.
26. As a user, I want the store schema migrated safely to add the tombstone table, so that upgrading does not require rebuilding my store from scratch.
27. As a user, I want forget and exclude operations to run in a single transaction, so that a crash mid-delete cannot leave my store half-wiped.

## Implementation Decisions

- **Granularity is session and project only.** No message-level forget. Secrets smear across turns (the paste, the agent's echo, tool output), so deleting one message is false comfort; redaction (which hits every occurrence by pattern) and session-forget are the right tools. Message-level would also push the re-index guard into the per-record write loop for marginal benefit.

- **A new deep module, the tombstone store**, is the only code that touches the new table. Its interface: add a tombstone, remove one, list (optionally filtered by kind), and load the session-set and project-set the write-path guard consults. Callers treat tombstones as a black box.

- **A new deep module, the forget/exclude operations layer**, holds the verbs and the preview/execute split. Preview functions return counts and scope without mutating; the execute functions delete rows and write tombstones in one transaction. The CLI stays thin — it parses flags, calls preview or (with `--confirm`) execute, and renders output.

- **The re-index guard is a row-filter in the single shared write path** (`writeRecordBatch`), not a file-skip. It loads the tombstone sets once per batch and drops any normalized row whose `session_id` is session-tombstoned or whose `project` is project-tombstoned. Because backfill (via `indexFile`), the hook, and `push` all converge on `writeRecordBatch` (verified: `push.ts` and `index-file.ts` both call it), one filter covers every write path and every adapter, current and future, keyed off the stable normalized ids adapters already produce.

- **The tombstone table** has two kinds of entry distinguished by a `kind` column ("session" or "project"), a `value` (the session id or the project cwd path), a `reason` ("forget" | "exclude" | optional note) for auditability, and a `created_at` timestamp, with a composite primary key on (kind, value). This shape came out of the grill:

  ```
  tombstones
    kind        TEXT   -- "session" | "project"
    value       TEXT   -- session_id, or project (cwd) path
    reason      TEXT   -- "forget" | "exclude" | user note
    created_at  TEXT   -- iso timestamp
    PRIMARY KEY (kind, value)
  ```

- **Verb-to-tombstone mapping:** `forget --session X` deletes X's rows and inserts `(session, X, "forget")`. `forget --project P` deletes P's rows and inserts one `(session, …, "forget")` per session that existed in P at forget time — no project row, so future sessions resume. `exclude --project P` deletes P's rows and inserts `(project, P, "exclude")`, barring future captures. `exclude --remove P` deletes the `(project, P)` row. `exclude --list` returns rows where kind = "project".

- **forget = the past; exclude = the past and the future.** This is the crisp distinction between the two verbs.

- **Row deletion is by session and by project**, building on the existing internal deletion machinery (`deleteFileRows` and the FTS delete trigger that keeps search synced automatically). New deletion helpers operate by `session_id` and by `project`; FTS stays consistent through the existing trigger.

- **`forget --project P` enumerates the affected sessions from `messages`, not from the `sessions` rollup.** The `sessions.project` column is derived from the *last non-null* project on a session's messages (`recompute-session.ts`), so a session whose final message carries a null project would be missed by a `sessions.project = P` query. The operation therefore reads `SELECT DISTINCT session_id FROM messages WHERE project = P` to build the per-session tombstone list, and deletes rows by `messages.project = P`. Project matching is **exact-string** on the cwd path (no normalization, no prefix/subpath matching) — what the adapters stored is what must be passed.

- **Redaction defaults flip from opt-in to default-on by changing one default at the write path.** `writeRecordBatch` resolves `opts.redact ?? true`, so every caller that does not pass `redact` now redacts: backfill, the hook, `setup` (via `backfillDirectory`, which already threads `redact` but is never given one by `runSetup`), and crucially `push` (which passes no redact option today and so currently never redacts). The opt-out is `--no-redact`, replacing the current `--redact` opt-in at the `index`, `hook`, and `setup` CLI entry points (each must grow the flag and pass `redact: false`). The redaction pass itself (`src/core/redact.ts`) is unchanged — only the default wiring changes. See ADR 0001.

- **Deletion does not touch the `source_files` watermark; the tombstone is the durable backstop.** Forget/exclude delete `messages` rows (and roll up sessions) but leave the per-file head-hash/size watermark alone. This is deliberate: the watermark is a re-read optimization, while the tombstone is the permanence guarantee. If a forgotten file is later rewritten, its watermark invalidates and `writeRecordBatch` re-inserts — at which point the guard, keyed on the tombstone, drops the forgotten rows again. Correctness never depends on watermark state, only on the tombstone, so the two mechanisms stay decoupled.

- **The migration is append-only**, adding one step that creates the tombstone table and bumps `SCHEMA_VERSION` from 2 to 3, consistent with the existing migration array. Existing stores upgrade in place.

- **Destructive operations are two-step and flag-gated, never interactively prompted.** Bare command = preview; `--confirm` executes. See ADR 0002.

- **Forget and exclude are CLI-only.** They are not added to the MCP tool surface. The MCP server keeps its read tools plus the additive, idempotent `push`; nothing destructive is reachable over MCP.

- **Cursor is session-only for these operations** because cursor sessions carry `project: null` (Cursor's store has no cwd). `forget --project` and `exclude --project` cannot match cursor history; this is documented as a known limitation rather than faked.

- **Session-id discovery rides on the existing `lore sessions` listing**, not a new lookup command. A user forgetting one conversation finds its `session_id` the same way they already browse history; the `forget` preview echoes the resolved session(s) so a mistyped id surfaces as a zero-count preview before any `--confirm`.

## Testing Decisions

Good tests here exercise observable behavior through the public interface — "after I forget a session and re-index, it is gone" — not private helper structure. They seed a real store, run the real operations, and assert what a user would observe. Prior art: the existing store tests (`write-records.test.ts`, `upsert` coverage), adapter ingest tests that seed and assert normalized rows, and `redact.test.ts`.

Modules to test:

- **Tombstone store** — add/remove/list/loadSets round-trips; kind filtering; composite-key idempotency.
- **Forget/exclude operations** — preview counts match what exists; `forget --session` deletes only that session and tombstones it; `forget --project` deletes the project's current rows, tombstones each session, and writes no project row; `exclude --project` deletes existing rows and writes a project tombstone; `exclude --remove` lifts the rule but does not restore data; operations are transactional.
- **The re-index guard (the resurrection test — highest value)** — forget a session, then re-index the same source and separately `push` the same records, and assert the data stays gone in both paths; the same for an excluded project; and that a non-tombstoned session sharing a multi-session file is unaffected. **The re-index leg must force the full/append write path**, not a plain re-run: `indexFile` returns `skip` for an unchanged file (head-hash + size watermark) and never calls `writeRecordBatch`, so a plain re-index would "pass" without ever exercising the guard — a false green. The test must rewrite/grow the source file (or otherwise invalidate the watermark) so the guard actually runs.
- **Redaction-default** — a credential is scrubbed by default through backfill and through the hook; `--no-redact` keeps it verbatim; non-credential content is untouched either way. This includes **inverting the existing `index-file.test.ts` "keeps secrets verbatim by default" assertion**, which encodes the old opt-in behavior and will be wrong once the default flips.

Thin CLI flag-parsing, rendered output strings, the skill bundle, and docs are verified by reading and by the behavior tests above the seam, not by dedicated unit tests — consistent with how the repo already treats its CLI surface.

## Out of Scope

- **Time-based expiry / TTL.** Deliberately declined. Auto-expiry fights the "yours forever" promise; a clock silently deleting memory is exactly the behavior lore exists to avoid. Manual `forget` is the honest substitute — the user chooses. This was raised by the reviewer and consciously rejected on vision grounds, not overlooked.
- **A general capture-rules configuration engine** (per-source/per-pattern include/exclude policies). That is an enterprise-governance surface; lore has no config-file surface today and this PRD does not add one. Exclude covers the one real standing-rule case.
- **Message-level forget.** See Implementation Decisions.
- **Editing or mutating transcripts on disk.** Lore remains read-only over source files; forget/exclude delete from the index only. The source transcripts are never touched.
- **Restoring forgotten or excluded data.** Forget and exclude deletion are irreversible by design; only the exclusion *rule* is reversible.
- **Exposing forget/exclude over MCP.**

## Further Notes

- This work answers, directly, three of the six trust-boundary points a public reviewer raised: deletion (forget), prevention of capture (exclude), and — over-delivering — automatic secret handling (redaction-on-by-default). Three other points (provenance on every hit, visibility of what's stored, scoping searches) were already shipped. The sixth (expiry) is the declined out-of-scope item above.
- The "verbatim" promise reframing touches user-facing copy in README, AGENT-ONBOARD, and PRD-lore; these must be updated in lockstep with the default flip so the docs never describe a behavior the tool no longer has.
- Protect the emotional core (verbatim recall, provenance, get-context) above all: redaction is conservative and narrow precisely so it never corrupts legitimate recalled content, which for a memory tool is its own kind of data loss.
