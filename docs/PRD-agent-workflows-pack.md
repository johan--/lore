# PRD - Lore Agent Workflows Pack

> Status: critic-adjudicated · ready-for-issues · Created 2026-06-19 · Repo:
> `~/lore`

## Problem Statement

Lore already stores and retrieves full-fidelity agent transcripts. The raw
substrate is powerful: agents can search, fetch one message, fetch neighboring
context, page through sessions, list recent sessions, and use either CLI or MCP
with proven JSON-envelope parity.

The problem is that this still leaves too much judgment in the agent's hands.
An agent has to guess the right query, discover the right session, decide how far
to drill, notice whether evidence is stale, detect whether the store is readable,
and synthesize findings without over-trusting raw transcript snippets. In
practice this creates a noisy workflow: five or six calls before useful context,
unclear confidence, old sessions presented as current truth, and no reusable
shape for daily continuity or handoff.

Lore should become an evidence substrate for agents, not a truth oracle and not a
pile of transcript soup. Raw transcripts are testimony. They need provenance,
freshness, retrieval-failure handling, bounded context, and LLM-guided workflows
that turn low-level records into evidence packets, briefs, handoffs, memory-card
candidates, and proposal-only improvement signals.

This PRD scopes the next large body of work: a portable Lore workflow pack that
helps agents recall, brief, and hand off using Lore well.

## Solution

Add a workflow layer on top of the existing Lore CLI/MCP substrate. The existing
`lore` setup/retrieval skill remains the low-level "how to use the commands"
skill. The new workflow pack teaches higher-level judgment:

- **Recall** plans and executes retrieval, drills into context, labels freshness,
  explains why evidence was selected, and returns a bounded evidence packet.
- **Brief** defaults to the last 24 hours and synthesizes what happened, what remains
  open, what changed, what was learned, and proposal-only signals for possible
  skills, jobs, issues, wiki updates, or fixes.
- **Handoff** creates compact continuation packets for the next agent, separating
  verified facts, open work, stale/risky claims, and next actions.
- **Memory-card shapes** give agents proposal objects for decisions, claims,
  commitments, artifacts, contradictions, and open questions without forcing
  every agent to reread raw transcript soup.
- **Freshness and drift labels** prevent stale sessions from pretending to be
  current truth.
- **Retrieval health and failure handling** make missing stores, unreadable
  stores, stale schemas, empty indexes, and unsynced sources visible in workflow
  outputs rather than hidden behind a generic failure.
- **Verification** combines deterministic substrate tests, committed workflow
  eval specs, manual skill-evaluation runs where needed, and a project-specific
  development verification skill.

The first release ships as sibling skill folders under `skills/`:
`skills/lore-recall`, `skills/lore-brief`, `skills/lore-handoff`, and
`skills/lore-dev-verification`. Product copy may describe them as
`lore:recall`, `lore:brief`, and `lore:handoff`, but the repo layout uses
installable skill directories because nested skill auto-discovery is not proven.
A future plugin bundle can wrap these skills; this PRD does not require a new
universal plugin framework.

The workflows may propose actions. They must not create jobs, edit prompts,
write wiki pages, create issues, delete memory, or modify code unless the user
explicitly asks for that follow-up.

## User Stories

1. As a coding agent, I want a recall workflow that starts from a user's fuzzy
   reference, so that I do not have to guess one perfect search query.
2. As a coding agent, I want recall to expand and narrow queries deliberately,
   so that I can find useful memories without flooding context.
3. As a coding agent, I want recall to discover real message and session ids
   before drilling, so that I never invent identifiers.
4. As a coding agent, I want recall to fetch full messages and nearby context
   after a promising hit, so that snippets are not mistaken for decisions.
5. As a coding agent, I want recall to stop after a bounded evidence packet, so
   that I do not dump whole sessions into context.
6. As a coding agent, I want recall to label which source, project, branch,
   timestamp, role, model, and session each claim came from, so that the answer
   is auditable.
7. As a coding agent, I want recall to include an explicit "what I did not find"
   section when retrieval is thin, so that absence of evidence is not presented
   as evidence of absence.
8. As a coding agent, I want recall to explain why selected hits were considered
   relevant, so that a reviewer can spot a bad retrieval path.
9. As a coding agent, I want recall to flag stale evidence, so that an old
   session does not silently override current repo state.
10. As a coding agent, I want recall to prefer current files, tests, and live
   runtime artifacts over old transcript claims when they disagree, so that Lore
   remains evidence rather than authority.
11. As Jordan, I want agents to use Lore faster and with fewer tool calls, so
   that past work becomes a practical memory layer rather than an archaeology
   project.
12. As Jordan, I want the workflow to handle unreadable-store and stale-schema
   failures gracefully, so that an agent reports the fix path instead of giving
   up or hallucinating.
13. As Jordan, I want a daily brief workflow defaulting to the last 24 hours, so that
   I can ask what happened without specifying dates every time.
14. As Jordan, I want the brief to identify open work and in-progress threads,
   so that unfinished commitments do not disappear between sessions.
15. As Jordan, I want the brief to surface what was learned or discovered, so
   that useful session information can compound.
16. As Jordan, I want the brief to propose possible skills, jobs, issues, wiki
   updates, or fixes, so that Lore can generate improvement signals.
17. As Jordan, I want brief proposals to be inert by default, so that no workflow
   silently creates jobs, edits files, or changes memory.
18. As Jordan, I want the brief to cite the evidence behind each major claim, so
   that I can inspect the transcript trail.
19. As Jordan, I want the brief to distinguish "verified", "likely", "open",
   and "stale" sections, so that the synthesis does not flatten uncertainty.
20. As a scheduled agent, I want the same brief workflow to be runnable from a
   cron-like automation, so that daily continuity can exist without a separate
   deterministic CLI pretending to do LLM judgment.
21. As a user without automations, I want the brief to be manually invokable as a
   skill, so that the feature does not depend on one host's cron support.
22. As a next-session agent, I want a handoff workflow that tells me what is
   verified, what is open, what is stale, what is risky, and what to do next, so
   that I can continue without rereading everything.
23. As a next-session agent, I want handoffs to cite the specific messages or
   sessions they rely on, so that I can drill down if I need more detail.
24. As a next-session agent, I want handoffs to preserve unresolved questions,
   so that uncertainty is not erased by compaction.
25. As Jordan, I want handoffs to be compact enough for fresh-agent context, so
   that they improve continuity without dragging old noise forward.
26. As a coding agent, I want typed memory-card shapes for decisions, claims,
   commitments, artifacts, contradictions, and open questions, so that I can
   reason over durable objects instead of only raw prose.
27. As Jordan, I want memory cards to point back to evidence, so that a card can
   be challenged or updated later.
28. As Jordan, I want memory-card creation to require an explicit follow-up
   action when persistence is involved, so that brief/recall do not mutate the
   wiki or store on their own.
29. As a coding agent, I want contradiction candidates surfaced, so that two
   sessions that disagree become reviewable instead of silently averaged.
30. As a coding agent, I want freshness labels that include age, source,
   project, branch, sync status, and stale-risk, so that I can calibrate trust.
31. As a coding agent, I want to know when the current session may not be indexed
   yet, so that I do not assume Lore is fully fresh.
32. As a coding agent, I want retrieval health checks to distinguish missing
   store, empty store, unreadable schema, too-new schema, no matching source, and
   no matching query, so that recovery is actionable.
33. As a maintainer, I want the workflow outputs to be testable with evals, so
   that future prompt edits do not regress behavior.
34. As a maintainer, I want deterministic substrate changes covered by ordinary
   tests, so that workflow prompts are not used to hide core bugs.
35. As a maintainer, I want CLI and MCP parity preserved wherever the workflows
   rely on both surfaces, so that a host can use either path.
36. As a maintainer, I want retrieval output additions to be additive and
   bounded, so that existing users are not broken and context budgets remain
   protected.
37. As a maintainer, I want a project-specific development verification skill,
   so that agents working on Lore know exactly which checks prove a change.
38. As a reviewer, I want recall/brief/handoff eval fixtures to use synthetic or
   scrubbed data only, so that no real transcript data is committed.
39. As a privacy-conscious user, I want workflows to honor existing forget,
   exclude, redaction, and destructive-command rules, so that memory control is
   not weakened by a smarter synthesis layer.
40. As a privacy-conscious user, I want no workflow to expose destructive memory
   operations over MCP, so that compromised clients cannot delete memory.
41. As a contributor, I want the pack to be distributed in a way that works for
   multiple agents where practical, so that Lore's workflow knowledge is not
   trapped in one harness.
42. As a contributor, I want the pack to avoid assuming every agent supports the
   same plugin mechanism, so that packaging stays honest.
43. As a coding agent, I want the existing low-level Lore skill to remain
   available, so that setup, indexing, hook wiring, and raw CLI usage are still
   teachable.
44. As a coding agent, I want the new workflow skills to share common reference
   material, so that recall, brief, and handoff do not drift into three slightly
   different Lore doctrines.
45. As Jordan, I want the workflow pack to reflect the project's Matt Pocock
   style, so that it lands as large vertical tracer bullets with fresh review,
   not as a pile of tiny prompt edits.
46. As Jordan, I want issues from this PRD to include discovered Lore usability
   problems when they directly affect workflows, so that the program fixes the
   real obstacles instead of building around them.
47. As Jordan, I want unrelated cleanup kept out of this PRD, so that the final
   integration PR remains reviewable.
48. As a coding agent, I want examples of good and bad recall/brief/handoff
   outputs, so that I can imitate the intended evidence discipline.
49. As a scheduled workflow runner, I want a clear "proposal-only" contract, so
   that automation can safely generate suggestions without taking action.
50. As a future agent, I want the PRD, issues, and verification skill to leave a
   clean trail, so that I can continue the program without re-deriving the plan.

## Implementation Decisions

**One program, three workflows.**
This is one large body of work: the Lore Agent Workflows Pack. It should produce
one PRD, one issue series, one integration branch, and one final PR. Recall,
brief, and handoff are separate user-facing workflows, but they share the same
evidence, freshness, privacy, and verification rules.

**Existing Lore skill remains the substrate skill.**
The current Lore skill teaches setup, indexing, CLI/MCP retrieval, navigation,
push, forget, exclude, and hook wiring. It should not be overloaded into a long
all-purpose prompt. The workflow pack should add higher-level workflow skills or
subskills while reusing shared references. The exact file/package shape can vary
by host, but the stable product names are `lore:recall`, `lore:brief`, and
`lore:handoff`.

**Workflow skills are real bundles, not single markdown files.**
For this program, a good skill is a small front door plus enough bundled
resources that a fresh agent does not have to infer the workflow. Each workflow
skill folder should include:

```text
skills/<skill-name>/
  SKILL.md                 # concise router, trigger description, quick start
  references/              # detailed contracts and workflow doctrine
  examples/                # at least one good and one bad output
  evals/evals.json         # realistic prompts and expected behavior/assertions
  evals/test-report.md     # evidence that the skill was actually exercised
  scripts/                 # validators/checkers for structured output, when applicable
```

References and examples are expected for `lore-recall`, `lore-brief`,
`lore-handoff`, and `lore-dev-verification`. Scripts are expected when the skill
has a structured output that can be checked mechanically, such as evidence
packets, brief proposals, handoff packets, memory-card candidates, or
verification matrices. Omit a script only when there is genuinely nothing
deterministic to validate, and say why in the issue implementation notes.

Draft each skill with `write-a-skill` to get the structure, progressive
disclosure, examples, and resource split right. Then use `skill-creator` to
design eval prompts, run with-skill/baseline or manual review passes, improve
the skill, and tune the trigger description.

**No workflow skill is done until it is rigorously tested.**
A skill slice is not complete just because the files exist. It must leave an
auditable test trail using synthetic or scrubbed data:

- `evals/evals.json` with realistic prompts, expected behavior, and assertions.
- At least one with-skill run for each eval, plus baseline/old-skill runs when
  practical.
- Assertion grading, either by a deterministic script or an explicit grader pass.
- Example validation for every structured output the skill teaches.
- Trigger-description checks with realistic should-trigger and should-not-trigger
  prompts when discoverability matters.
- A committed `evals/test-report.md` summarizing what ran, what passed, what
  failed, what was changed, and what remains risky.

If a baseline, benchmark, trigger loop, or validator is genuinely not relevant,
the test report must explain why. Otherwise the skill is not ready.

The test report is the skill's completion artifact. It should name the eval ids,
fixture source, run mode, grader/checker used, pass/fail counts, validator output,
trigger checks where applicable, generated review or benchmark artifacts if any,
privacy notes, and remaining risks. "Manual review" is acceptable only when it is
written down with evidence and assertions; it is not a synonym for skipping tests.

**LLM workflows, not deterministic CLI commands.**
Recall planning, daily synthesis, proposal generation, contradiction surfacing,
and handoff judgment require an LLM. The deterministic CLI should provide
bounded evidence, health, provenance, and metadata. It should not pretend to
write a "brief" by stringing together command output.

**Evidence Packet is the common output primitive.**
Recall, brief, and handoff all build on evidence packets: bounded sets of hits,
full messages, context windows, session excerpts, freshness labels, and gaps.
Evidence packets must include enough provenance for a future agent or reviewer
to reproduce the retrieval path.

**Retrieval plans are explicit.**
The recall workflow should show or internally maintain a short retrieval plan:
initial query, filters, expansion terms, drill-down ids, and stopping condition.
When recall fails, it should report what was tried and what recovery path is
available.

**Freshness labels are first-class.**
Workflow outputs must label age and stale-risk. A transcript from yesterday is
not the same as a transcript from last month. A hit from the current repo is not
the same as a hit from another project. A session before a branch switch is not
the same as a current branch artifact. Labels should be descriptive rather than
pretending to be a numeric confidence score.

The minimum freshness label fields are:

- `source`, `project`, `branch`, `sessionId`, `messageId`, and `sourceFileId`
  when known.
- `messageTimestamp` from the transcript when known.
- `indexedAt` from the source-file record when known.
- `ageFromMessage` and `ageFromIndex` as human-readable age buckets.
- `syncStatus`: `fresh`, `possibly_stale`, or `unknown`.
- `staleReason`: a short explanation when status is not `fresh`.

Null means the source did not provide the field; it is not guessed. A workflow
must warn that the current session may be unindexed when the newest indexed
message for the relevant source/project is older than the active work window or
when no freshness hook/sync evidence exists.

**Readiness and retrieval-health diagnostics are in scope.**
During this PRD pass, the live `lore search` command returned an unreadable-store
schema error. That is directly relevant to workflow reliability. The pack needs
a structured retrieval-health concept that can distinguish missing store, empty
store, unreadable store, too-new store, unsupported read surface, stale schema,
missing source, no matching sessions, no matching query, and possibly-unsynced
current session.

The concrete first-release contract is a read-only status surface:

```bash
lore status --json [--source <name>] [--project <path>] [--since <iso>] [--until <iso>]
```

The matching read-only MCP `status` tool accepts equivalent optional parameters:
`source`, `project`, `since`, and `until`.

The unscoped status command reports global store readiness. Scoped failure states
only apply when the corresponding scope is provided: `source_absent` requires a
source filter; `project_absent` requires a project filter; `possibly_unsynced`
requires a caller-provided active window (`since`/`until`) or missing freshness
metadata for the scoped source/project. Search-specific misses remain `count: 0`
/ `no_matches`, not status failures.

The status envelope is:

```ts
type LoreStatus =
  | {
      ok: true;
      status: "ready";
      filters: {
        source?: string;
        project?: string;
        since?: string;
        until?: string;
      };
      storePath: string;
      schemaVersion: number;
      supportedSchemaVersion: number;
      messageCount: number;
      sessionCount: number;
      sources: Array<{
        source: string;
        messageCount: number;
        sessionCount: number;
        latestMessageTimestamp: string | null;
        latestIndexedAt: string | null;
      }>;
      recovery: null;
    }
  | {
      ok: false;
      status:
        | "missing_store"
        | "empty_store"
        | "unreadable_store"
        | "newer_store"
        | "stale_schema"
        | "source_absent"
        | "project_absent"
        | "possibly_unsynced";
      filters: {
        source?: string;
        project?: string;
        since?: string;
        until?: string;
      };
      storePath: string;
      schemaVersion?: number;
      supportedSchemaVersion?: number;
      recovery: string;
    };
```

CLI and MCP status envelopes must stay equivalent.

**Additive evidence metadata is allowed where the substrate is too thin.**
If freshness labels need indexed-at time, source-file metadata, or clearer
schema-readability data that current search hits do not expose, the program may
add bounded metadata to the retrieval surfaces. Additions must preserve existing
CLI/MCP parity and avoid unbounded payloads.

**Brief defaults to the last 24 hours.**
The brief workflow uses a default time window of the rolling 24 hours ending at
run time, unless the user specifies a different window. Date labels should render
in the user's/local timezone, but retrieval filters should use explicit ISO
instants. Eval fixtures must pin `now` or use a fake clock so default-window
behavior is deterministic. The brief should summarize activity, open work,
changes, learned/discovered signals, and proposals.

**Brief is proposal-only.**
A brief may propose creating or updating skills, jobs, issues, wiki pages,
memory cards, docs, tests, or code. It must not perform those actions. Each
proposal should include evidence, rationale, expected payoff, rough risk, and
the explicit next action the user would have to request.

**Optional cron runner means scheduleable workflow, not autonomous mutation.**
The pack should support being run by a scheduler in hosts that have automations.
The scheduled run invokes the same LLM brief workflow and produces a brief. It
does not execute proposals automatically. For hosts without automations, manual
skill invocation is the same feature. Scheduled brief runs should execute with
read-only Lore commands/tools and no write/destructive tools. The output carries
`sideEffects: false` and a proposal list shaped as:

```ts
type BriefProposal = {
  kind: "skill" | "job" | "issue" | "wiki" | "fix" | "task" | "memory_card";
  title: string;
  rationale: string;
  evidenceIds: string[];
  risk: "low" | "medium" | "high";
  nextAction: string;
};
```

**Handoff is for fresh contexts.**
A handoff should help the next agent start in the smart zone. It must be compact,
source-linked, and sorted into verified, open, stale, risky, and next-action
sections. It should reference existing artifacts instead of copying large
transcripts.

**Memory cards are typed outputs before they are persistent records.**
This PRD defines memory-card shapes and when workflows should propose them. It
does not require a new database table for memory cards unless implementation
proves that is the highest seam. Persistence into a wiki, issue, task system, or
future card store requires an explicit follow-up action. The first shared
candidate vocabulary lands with `lore-brief`, because brief is the first workflow
that emits proposals; handoff reuses that vocabulary rather than introducing a
private shape later.

**Contradictions are surfaced, not resolved by averaging.**
If two sessions disagree, the workflow records both claims with evidence and
marks the contradiction or drift. The user or a later workflow may adjudicate.
The synthesis layer should not flatten disagreement into a confident answer.
This PRD only requires contradiction candidates that emerge during recall, brief,
or handoff. A broad contradiction inbox or durable contradiction database is out
of scope.

**Privacy and retention rules are inherited from Lore.**
The workflow pack must preserve redaction-on-by-default, forget/exclude behavior,
preview-before-confirm rules, and the absence of destructive MCP tools. It must
not commit real transcript fixtures or encourage agents to paste real private
transcripts into evals.

**Project development verification comes first.**
The existing Lore skill verifies user-facing Lore setup and CLI usage. It is not
the same as a repository development verification skill. This program should add
a project-specific `lore-dev-verification` skill before the user-facing workflow
skills land. Draft it with the lighter `write-a-skill` workflow so the structure,
trigger description, and progressive disclosure are clean. Then use
`skill-creator` for evaluation prompts, benchmarking/manual review loops,
description optimization, and the same rigorous skill-done gate unless a step is
genuinely not relevant and the reason is documented in the test report. The skill
tells agents how to verify changes to retrieval, CLI/MCP parity, store
compatibility, adapters, privacy, workflow skills, and real-store smoke checks.

The first dev-verification slice should also add deterministic bundle-shape and
`evals/test-report.md` structure checkers. Those checkers are what make the
skill-testing rule enforceable for later workflow slices. Presence-only checks
are not enough; a hollow placeholder report should fail.

**Packaging should be useful but not speculative.**
The first release ships four sibling skill folders: `skills/lore-recall`,
`skills/lore-brief`, `skills/lore-handoff`, and
`skills/lore-dev-verification`. Each skill should be installable from the
published `skills/` tree and must satisfy the bundle contract above. Do not rely
on nested skill discovery under `skills/lore` until that is proven. A
plugin-style bundle is desirable later, especially for names like `lore:recall`,
`lore:brief`, and `lore:handoff`, but this PRD does not require building a
universal plugin abstraction.

**Discovered issues are included only when workflow-critical.**
This PRD intentionally scopes issues found while drafting if they affect recall,
brief, handoff, freshness, privacy, or verification. Generic refactors, unrelated
adapter work, and cosmetic docs polish remain out of scope.

## Testing Decisions

Good tests here assert behavior at the highest practical seam. Deterministic
substrate changes are proven by normal unit/integration tests. Workflow skills
ship with committed eval specs and are exercised through the `skill-creator`
review loop or an automated skill-eval runner added by the implementation. The
repo does not currently have an automated skill eval runner in `npm run check`,
so this PRD must not pretend prompt eval specs alone are deterministic proof.
Every workflow skill must include a committed `evals/test-report.md` that records
the executed skill tests, assertion grades, example validation, trigger checks
where applicable, generated review or benchmark artifacts if any, and remaining
risks. If an implementation slice adds an automated runner, that runner becomes
part of verification; otherwise the manual/agent-review test report is the
acceptance artifact and deterministic unit/integration tests carry the hard
substrate proof. A skill issue cannot be called done while this report is absent
or while the report says required evals/checks were skipped without a concrete
reason.

The first implementation slice must make this practical by creating the
`lore-dev-verification` skill plus deterministic bundle-shape and
test-report-structure validators. Later workflow slices must run those validators
against their skill folders before they are complete.

**Recall skill evals.**
Use seeded or synthetic fixture stores and prompts such as "what did we decide
about X", "find the last session in this repo where Y happened", and "the first
query failed, recover". Expected behavior: plan, search, drill down, cite ids,
fetch context, label freshness, stop bounded, and report gaps.

**Brief skill evals.**
Use a small fixture history across a day boundary with a pinned fake `now`.
Expected behavior: default to the rolling last 24 hours, identify completed/open
work, cite evidence, produce proposal-only signals, avoid creating anything, and
label uncertainty.

**Handoff skill evals.**
Use a fixture session with completed work, unresolved work, stale claims, and a
risky assumption. Expected behavior: compact continuation packet, verified/open/
stale/risky sections, cited evidence, next actions, and no transcript dumping.

**Proposal and memory-card evals.**
The brief slice owns the first shared proposal vocabulary because it is the first
workflow that emits proposals. Use fixture transcripts containing a decision, a
claim, a commitment, an artifact, and a contradiction. Expected behavior: propose
typed candidates with evidence links and do not persist them automatically.
Handoff evals then verify reuse of the same shared shapes rather than a private
handoff-only vocabulary.

**Retrieval-health tests.**
Deterministic tests should cover `lore status --json` and MCP `status` parity for
missing store, empty store, unreadable store, too-new store, stale schema, source
absent, project absent, and ready store. Workflow eval specs should cover
`no_matches` as a retrieval gap rather than a health failure.

**Freshness metadata tests.**
If retrieval surfaces add indexed-at or source freshness metadata, tests should
assert the fields appear in both CLI and MCP JSON envelopes, remain bounded, and
preserve parity.

**CLI/MCP parity tests.**
Any additive JSON shape used by workflows must keep CLI/MCP parity when both
surfaces expose the same operation.

**Privacy tests and review.**
Fixtures must be synthetic or scrubbed. Tests and evals must not include real
Jordan transcript excerpts, credentials, private project text, or personal
memory. Destructive memory operations remain CLI-only and human-confirmed.

**Development verification skill.**
The `lore-dev-verification` skill should encode when to run the full default
check, targeted retrieval tests, MCP tests, store migration tests, adapter
conformance tests, workflow-skill eval/review passes, and real-store smoke
checks. Draft it with `write-a-skill`; improve and evaluate it with
`skill-creator`, documenting any deliberately skipped review/benchmark step. Real-store smoke proofs should remain local and must not commit
private output.

## Out of Scope

- A deterministic `lore brief` CLI that pretends to do synthesis without an LLM.
- Automatic creation of jobs, skills, issues, wiki pages, memory cards, tasks,
  or code changes from a brief.
- Exposing forget or exclude over MCP.
- A new semantic/vector search system.
- A new universal plugin framework for every possible agent host.
- A new memory-card database unless implementation proves it is necessary for
  the accepted workflow seams.
- A broad contradiction inbox or automatic contradiction-resolution system.
- A scheduled brief runner that has write, destructive-memory, issue-creation,
  wiki-write, or job-creation authority.
- Broad adapter expansion unrelated to recall, brief, handoff, freshness,
  privacy, or verification.
- Rewriting existing Lore setup/indexing docs except where workflow packaging,
  health, or verification requires it.
- Treating transcript evidence as current truth when current source files,
  tests, runtime artifacts, or user corrections disagree.
- Real transcript fixtures or committed private memory data.

## Further Notes

This PRD received an adversarial critic pass before issue slicing. Accepted
critic findings:

- Retrieval health needed a concrete contract, so the PRD now specifies
  `lore status --json` and MCP `status` parity.
- Skill evals were aspirational, so the PRD now distinguishes deterministic tests
  from committed manual/agent-review eval specs unless a runner is added.
- Packaging was underspecified, so the first release now uses sibling skill
  folders under `skills/`.
- Freshness labels needed minimum fields and null semantics.
- Memory cards and contradictions stay proposal/output vocabulary only.
- Scheduled briefs need a structured no-side-effect proposal output.
- The issue plan must be vertical tracer bullets, not vocabulary then health then
  prompt layers.
- A later DAG critic found the dev-verification gate was too late, proposal
  vocabulary was too horizontal, status inputs were under-specified, and
  test-report presence could be hollow. The issue plan now starts with an early
  verification gate, folds proposal vocabulary into brief, defines scoped status
  inputs, pins brief's default window to rolling 24 hours, and requires
  test-report structure validation.

Vertical issue slices after adjudication:

1. Verification gate scaffold: early `lore-dev-verification` skill plus
   bundle-shape and test-report-structure validators.
2. Recall tracer bullet: `lore status` health, minimum freshness metadata, and
   an installable `lore-recall` skill that produces evidence packets.
3. Brief tracer bullet: `lore-brief` skill defaulting to the rolling last 24
   hours, with proposal-only structured output, shared memory-card/contradiction
   candidate vocabulary, and scheduleable/no-side-effect guidance.
4. Handoff tracer bullet: `lore-handoff` skill with verified/open/stale/risky
   continuation packets that reuse the shared proposal vocabulary.
5. Packaging/docs tracer bullet: install/load smoke for the sibling skill
   folders, test-report structure validation, docs for product names, and no
   speculative plugin framework.

These slices are the approved inputs for the `UPD` issue series. Issue files
should be written in dependency order and treated as ready for the program
workflow once their per-slice test-author/implementer/reviewer loop starts.


## Packaging And Execution Notes

UPD-004 ships the workflow pack as sibling skill folders in the existing package `skills/` tree. Product names such as `lore:recall`, `lore:brief`, `lore:handoff`, and `lore:dev-verification` are documentation names for those folders, not proof that a universal plugin wrapper exists in this release. A plugin wrapper remains optional future packaging.

The package smoke command is:

```bash
npm run package:smoke
```

It builds the CLI, restores executable mode on `dist/cli/lore.js`, validates `npm pack --dry-run --json`, packs a real tarball, reads the workflow skills from the packaged tree, checks required test-report headings, and verifies packaged CLI help. This command is the durable proof that the workflow skills are shipped as bundles rather than loose prompt files.

The issue DAG executed in dependency order: UPD-000 verification gate, UPD-001 recall/status/evidence, UPD-002 brief/proposal vocabulary, UPD-003 handoff continuation, and UPD-004 packaging/docs smoke. UPD-003 review fixes were applied after merge and merged again into integration before cleanup. UPD-004 additionally captured the live usability regression where `lore status` blocked on a newer-but-readable store even though `lore search` worked; read-only status now follows the read-compatibility policy while write paths continue to refuse unknown newer stores.

