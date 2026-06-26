# PRD - Claude Code Sync Hardening

> Status: critic-adjudicated · partially-implemented · ready-for-issues · Created
> 2026-06-25 · Repo: `~/lore`

## Problem Statement

Lore now has a PR that fixes the immediate stale Claude Code live-sync problem by
adding `lore sync <source>` and detected-source sync for Claude Code. The
direction is right, but merge arbitration found that the PR is not safe to merge
as the final freshness fix.

From the user's perspective, the problem is that Lore still cannot be trusted to
make Claude Code memory fully fresh in unattended use. A command that appears to
freshen Claude Code can omit subagent transcripts, even though subagent files are
part of Lore's full-fidelity model and often hold most of the useful work. The
documentation also tells users and agents that raw sync commands are appropriate
for cron, launchd, and task schedulers, while the single-writer lock is actually
in the wrapper script rather than the raw CLI command. That gap can teach users
to bypass the safety mechanism the PR added.

The result is a dangerous almost-fix: primary Claude Code messages can become
searchable, while subagent work remains stale; scheduled jobs can look correct
while bypassing the intended lock; and sparse scheduler environments can fail in
surprising ways. This is especially costly for Lore because stale memory is not a
cosmetic bug. It can make later agents think they have current evidence when
they only have an afterimage.

## Solution

Finish the live-sync hardening work so the product contract is honest, complete,
and testable.

`lore sync claude-code` should either truly freshen the detected Claude Code
transcript tree, including subagent transcripts, or explicitly say that it is
primary-only. The preferred solution is to include subagents for Claude Code sync
because Lore's domain model treats primary and subagent files as one logical
session history with distinct provenance.

Unattended sync should have one clear contract: manual/debug use can invoke the
CLI directly, but scheduled use must go through a lock-protected path unless the
lock is moved into the CLI write path itself. Documentation, help text, package
smoke, and skill setup guidance should all teach the same contract. Users should
not have to infer which command is safe for launchd, cron, or Task Scheduler.

The detected-source surface should also reflect the known roots Lore already
understands. Hermes has a conventional global root at `~/.hermes`; its adapter
already discovers `state.db` files below that root, including per-profile
histories while skipping snapshot backups. `lore sync hermes` should therefore
be a supported detected sync path, not a misleading "no known locations" case.
Other registered adapters should either gain their own known roots when they
exist or receive a clear error that says detected sync is not configured for
that source.

The shell wrappers should be made robust enough for sparse scheduler
environments. Missing `HOME`, missing Node, missing built CLI artifacts, stale
locks, live lock contention, and source precedence should all produce
intentional behavior with deterministic verification.

This PRD does not ask for a large redesign. It asks for the minimum vertical
hardening needed to make the current PR mergeable: complete Claude Code fidelity,
safe scheduled-sync guidance, durable wrapper behavior tests, and updated docs
that match the runtime.

## User Stories

1. As Jordan, I want `lore sync claude-code` to index Claude Code subagent
   transcripts, so that current memory includes the work done by delegated
   agents.
2. As Jordan, I want Claude Code sync to preserve full-fidelity session history,
   so that a later recall does not miss the most important part of a session.
3. As Jordan, I want a daily brief or handoff to see subagent work from the last
   day, so that summaries do not falsely imply that work never happened.
4. As Jordan, I want the sync command output to reflect the real indexed file
   count, so that a primary-only sync cannot masquerade as a full tree sync.
5. As Jordan, I want the PR to prove that subagent content is searchable after
   sync, so that the fix is not based on manual confidence.
6. As a Codex agent, I want a red-capable test for the subagent omission bug, so
   that I can make the behavior green without guessing.
7. As a Claude Code agent, I want my subagent transcripts indexed alongside my
   primary transcript, so that another harness can recall the whole session.
8. As an agent using Lore, I want search results from synced Claude Code memory
   to include provenance for primary and subagent files, so that evidence remains
   auditable.
9. As a user with launchd jobs, I want the documented scheduler command to be
   lock-protected, so that multiple sources do not write the same SQLite store at
   the same time.
10. As a user with cron jobs, I want the documented scheduler command to be safe
    by default, so that copying the README does not create a hidden concurrency
    risk.
11. As a future Windows tester, I want platform-specific scheduling guidance to
    be explicit, so that bash and launchd assumptions are not accidentally
    presented as universal.
12. As a package user, I want the npm-installed script path to work without a
    source checkout, so that I do not have to understand the repo layout.
13. As a source-checkout contributor, I want docs to tell me when `npm run build`
    is required before wrapper tests, so that stale `dist` artifacts do not
    confuse diagnosis.
14. As a maintainer, I want package smoke to verify every script users are told
    to copy, so that packaging cannot regress silently.
15. As a maintainer, I want the Codex notify wrapper covered by package smoke, so
    that the documented Codex entrypoint remains executable in releases.
16. As an unattended scheduler, I want lock contention behavior to be deliberate,
    so that skipped runs are either safely retried or observable enough to debug.
17. As Jordan, I want skipped lock-contention runs not to starve one source
    forever, so that Codex and Claude Code both stay fresh over time.
18. As an agent reading docs, I want manual sync and scheduled sync separated, so
    that I know when raw CLI use is appropriate.
19. As a user in a sparse launchd environment, I want missing `HOME` not to crash
    the shell wrapper with an unbound-variable error, so that failures are clear
    and actionable.
20. As a user in a sparse scheduler environment, I want missing Node to produce a
    clear non-zero failure, so that monitoring can detect setup problems.
21. As a user who sets an explicit Node path, I want the wrapper to respect it
    before relying on shell discovery, so that app environments with sparse
    `PATH` still work.
22. As a user who sets an explicit CLI path, I want the wrapper to respect it, so
    that I can point scheduled jobs at a known build.
23. As a user running the legacy Codex wrapper, I want existing Codex state-dir
    configuration to keep working, so that the generic wrapper does not break
    old setups.
24. As a maintainer, I want shell-wrapper behavior covered by deterministic
    tests, so that future reviewers do not have to trust manual smoke notes.
25. As a reviewer, I want each blocker from the arbiter packet mapped to a test
    seam, so that merge readiness can be judged mechanically.
26. As a reviewer, I want bot comments adjudicated in the PR, so that stale or
    accepted comments do not stay ambiguous.
27. As a Lore skill user, I want setup guidance to route stale Claude Code memory
    through the correct sync path, so that agents do not teach obsolete commands.
28. As a Lore skill maintainer, I want any changed user-facing setup behavior to
    have updated behavior evidence or a documented reason the base skill is out
    of scope for workflow-skill validators.
29. As an agent using the project verification skill, I want a clear distinction
    between product skill validation and workflow skill validation, so that
    validators are not misapplied.
30. As a Hermes user, I want `lore sync hermes` to detect `~/.hermes`, so that
    Hermes memory can be refreshed without remembering the raw path.
31. As a Hermes user, I want detected sync to include live `state.db` and
    per-profile histories while skipping snapshot backups, so that the sync
    matches the Hermes adapter's discovery contract.
32. As a maintainer, I want detected-source sync to reject or clearly explain
    sources with adapters but no known sync root, so that sources without known
    roots are not misleading.
33. As a future adapter author, I want sync policy to be expressed close to the
    source detection or adapter layer, so that callers do not learn hidden
    source-specific rules.
34. As a future contributor, I want the diagnosis harness to remain easy to run,
    so that this class of freshness bug can be reproduced before and after a fix.
35. As Jordan, I want final verification to include full repo checks and live
    sync proof, so that this PR can be merged with confidence.
36. As Jordan, I want no merge until explicit approval, so that PR bots and final
    review can run before the branch lands.

## Implementation Decisions

- Treat this as a hardening PRD for the existing Claude Code sync PR, not as a
  new product surface.
- Prefer the product contract that detected Claude Code sync includes both
  primary and subagent transcripts.
- Keep the current read/write compatibility model: sync remains a write path and
  must continue to refuse stores newer than the running build supports.
- Preserve redaction defaults. This work should not weaken credential redaction
  or add a new no-redact default.
- Preserve source provenance. Primary and subagent records must remain
  distinguishable by source file kind, agent file when present, session id,
  source, project, branch, role, model, and timestamp when known.
- Avoid adding a new schema unless implementation proves one is necessary. The
  current model already supports subagent source files.
- Make sync policy explicit. If a source needs adapter-specific sync options,
  express that through a small sync policy or equivalent high-level decision
  rather than scattering hidden defaults across callers.
- Add Hermes to detected-source locations with the known global root
  `~/.hermes`. The existing Hermes adapter should remain responsible for walking
  the root, finding `state.db` files, treating profiles as distinct histories,
  and skipping `state-snapshots`.
- For registered adapters that still have no known detected root, return a
  precise unsupported-detected-sync message that names the supported detected
  sources and points the user to manual `index --source`.
- Keep the CLI command as the manual/debug substrate, but do not present it as
  the scheduler-safe command unless locking is implemented at the CLI write
  boundary.
- Prefer using the existing lock-protected wrapper as the scheduler contract. If
  the implementation instead moves locking into the CLI write path, update the
  docs and tests to make that explicit.
- Do not expose destructive memory operations over MCP as part of this work.
- Do not add a daemon. Scheduled operation should remain a wrapper/script
  contract plus platform-specific examples.
- Keep package installs and source-checkout installs distinct in docs. Package
  users should not be told to rely on a local checkout path unless they copied
  scripts out of the package.
- Make the legacy Codex wrapper remain a compatibility entrypoint while
  delegating to the generic sync wrapper.
- Decide whether base `lore` skill changes need a full product-skill eval report
  or a documented exemption from workflow-skill validation. Do not leave this
  ambiguous.
- Keep real transcript content out of fixtures. Repros and regression tests must
  use synthetic messages.
- The diagnosis produced three concrete feedback loops:
  - Claude Code sync omits subagent transcripts.
  - Scheduler docs/help can advertise raw sync instead of the locked wrapper.
  - Missing `HOME` can surface as an unbound-variable shell error when Node is
    not discoverable and the wrapper reaches the nvm fallback.
- The PRD critic was accepted on these points: setup must include Claude Code
  subagents too; scheduler contract changes need an explicit doc-surface
  inventory; Hermes belongs only as an independent detected-sync slice; and base
  `skills/lore` changes need product-skill evidence rather than the workflow
  skill validator.

## Testing Decisions

- The highest-value seam is the CLI integration seam for detected-source sync.
  A test should create a synthetic Claude Code project tree with one primary
  transcript and one nested subagent transcript, run detected sync, then search
  the store for a sentinel from each transcript.
- The subagent sync test must fail on the current PR branch before the fix. A
  passing test that only indexes primary files is insufficient.
- The scheduler contract should be tested at the product boundary that users see:
  CLI help, README/setup docs, package smoke, and script executability.
- Hermes detected sync should be tested with a synthetic home containing a
  `.hermes/state.db` fixture and, where practical, a profile database. The test
  should prove `lore sync hermes --home <dir>` indexes searchable Hermes content
  through the detected root.
- Hermes detection should be covered at the setup/source-detection seam so a
  future edit to known locations cannot silently remove `~/.hermes`.
- If raw CLI sync remains unlocked, help and docs must not describe it as the
  scheduler command. Tests should catch this wording/contract regression.
- If locking moves into CLI sync instead, tests should cover concurrent sync
  behavior at the CLI/write seam rather than only checking docs.
- Shell-wrapper behavior needs deterministic tests or a committed script-level
  smoke harness. The harness should cover missing source, source precedence,
  missing built CLI, missing Node, missing `HOME`, stale lock cleanup, live lock
  contention, and exit-code propagation.
- The shell-wrapper tests should avoid relying on the developer's real `HOME`,
  real Node install, real Lore database, or real transcript directories.
- Package smoke should verify every packaged script that docs tell users to run
  or copy, including the Codex notify entrypoint.
- Skill setup changes should have behavior evidence appropriate to the base
  product skill. If the workflow-skill validator does not apply to the base
  `lore` skill, the verification docs should state that and identify the correct
  product-skill proof.
- Existing full verification remains required before merge: typecheck, lint,
  format check, full test suite, package smoke, targeted CLI/setup tests, and
  live sync proof on the local store when safe.
- Good tests assert external behavior: searchable subagent content, safe
  scheduler guidance, clear wrapper failures, and package artifacts. They should
  not assert incidental helper structure.
- Prior art exists in the current CLI tests for sync success/failure, setup
  source detection tests, backfill tests for primary versus subagent behavior,
  package smoke validation, and shell syntax checks.

## Out of Scope

- New source adapters for Openclaw, Cursor, Hermes, or any other harness.
- Designing brand-new detected roots for sources whose standard location is not
  already known. Hermes is in scope because `~/.hermes` is a known global root.
- A new long-running daemon or background service.
- MCP server API changes.
- Store schema redesign.
- Destructive memory operations, forget/exclude behavior, or privacy-policy
  changes beyond preserving current redaction defaults.
- Windows Task Scheduler implementation beyond keeping docs honest and not
  presenting macOS bash/launchd snippets as universal.
- A full plugin bundle for Lore skills.
- Reworking the whole skill validation system, except to clarify the correct
  verification seam for changed base `lore` setup guidance.
- Merging the PR. Merge remains blocked until Jordan explicitly approves after
  fixes, review, PR bots, and final verification.

## Further Notes

The original diagnosis loop produced a tight red-capable command:

```bash
/tmp/lore-pr23-repro.sh
```

On the current branch, it produced this minimized failure:

```text
FAIL subagent-sync: claude-code sync omitted subagent transcript
  sync output: Synced claude-code ... 1 files, 1 indexed, 0 skipped, 1 messages, 0 tool calls.
  search output: { "count": 0, "hits": [] }
FAIL scheduler-contract: CLI help advertises raw lore sync <source> for schedulers, bypassing wrapper lock
RED: 2 repro checks failed
```

During implementation, this loop was converted into deterministic repository
tests covering CLI sync, setup, detected-source discovery, and sync-wrapper
behavior. Future agents should treat the committed tests as the source of truth
for current state and use the original `/tmp` harness only as explanatory
diagnosis history.

The sparse `HOME` issue requires an isolated state and lock directory to avoid
being masked by lock contention. With that isolation, the current wrapper can
produce:

```text
scripts/lore-sync-once.sh: line 68: HOME: unbound variable
lore-sync: node not found; set LORE_NODE_BIN
```

Ranked diagnosis hypotheses:

1. If Claude Code sync delegates to the primary-only backfill default, then a
   synthetic subagent transcript will not be searchable after `sync
   claude-code`. This was confirmed.
2. If scheduler docs/help advertise raw sync while locking lives only in the
   wrapper, then a user following the visible contract can bypass single-writer
   protection. This was confirmed in help/docs text.
3. If wrapper Node discovery expands `HOME` under `set -u`, then a sparse
   scheduler environment with no `HOME` and no Node on `PATH` can emit an
   unbound-variable shell error. This was confirmed with isolated lock state.
4. If package smoke does not include every documented script entrypoint, then a
   future package can ship a broken notify wrapper while smoke still passes. This
   remains an important hardening gap rather than a current confirmed breakage.
5. If Hermes has a known root at `~/.hermes` but `detectSource` only lists Codex
   and Claude Code locations, then `lore sync hermes` will fail even though the
   adapter can discover Hermes histories from the conventional root. This was
   confirmed by inspecting the current known-location list and Hermes discovery
   contract.
6. If detected-source sync accepts adapters without known locations, then errors
   for sources such as Openclaw are technically accurate but operationally
   misleading. This remains a UX hardening gap for sources whose standard root is
   not yet known.

After implementation, the final arbiter pass should re-run the repro loop and
expect it to go green, then run full repo verification and package smoke before
asking Jordan for merge approval.

## Critic Adjudication

- Accepted: the core problem framing is correct; stale Claude subagent memory is
  a product-trust issue, not a polish issue.
- Accepted: `lore setup` must follow the same Claude Code subagent fidelity
  decision as `lore sync claude-code`.
- Accepted: scheduler guidance must enumerate help, README, AGENT-ONBOARD, base
  skill setup references, hook references, package smoke, and script behavior
  tests.
- Accepted with scope control: Hermes detected sync stays in this PRD because
  `~/.hermes` is a known global root, but it is sliced independently from Claude
  Code fidelity.
- Accepted: base `skills/lore` verification must be concrete. The resolution is
  a base product-skill eval report, not the workflow-skill bundle validator.
- Rejected: splitting Hermes into a separate PRD. The implementation is a narrow
  known-location addition and keeps the detected-source contract honest in the
  same vertical program.
