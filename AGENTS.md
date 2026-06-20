# Lore Agent Workflow

Lore is a local, full-fidelity, searchable memory store for agent session
transcripts. Work here touches three product surfaces:

- The TypeScript CLI and MCP server.
- The SQLite store, adapters, search, indexing, redaction, and deletion paths.
- The bundled agent skill under `skills/lore`.

Do not copy workflows from UI-heavy apps. Lore has no app frontend. Verification
means CLI behavior, MCP parity, schema/write-path safety, adapter fidelity,
privacy behavior, and skill behavior.

This repo follows a Matt Pocock-style agentic coding workflow. The rule is not
"add ceremony." The rule is: keep the human in planning, slice work into large
vertical tracer bullets, run implementation in fresh contexts, and review with
fresh eyes before integration.

## Workflow Levels

Use the light workflow for small work:

- Read the relevant code/docs first.
- Make the smallest scoped change that solves the request.
- Run the relevant verification command.
- Report what changed and what proved it.

Use the program workflow for large bodies of work:

- New product surfaces such as `lore:recall`, `lore:brief`, typed cards,
  privacy audit, new adapters, or new retrieval flows.
- Store, schema, search, ranking, redaction, deletion, or compatibility changes.
- Cross-agent skill bundle changes.
- Multi-issue work that should land as one final PR.
- Anything where stale memory, privacy, or broken retrieval would be costly.

Do not force the program workflow onto typo fixes, tiny docs polish, simple
formatting changes, or narrow bug fixes with an obvious test seam.

## Program Workflow

1. **Alignment before planning.**
   For ambiguous work, use a grill/alignment step before writing the PRD. The
   goal is shared design concept, not a document for its own sake. If the answer
   can be discovered from the codebase, discover it instead of asking Jordan.

2. **One PRD per large body of work.**
   Write or update one PRD under `docs/PRD-*.md`. The PRD is the destination
   document: problem, solution, extensive user stories, implementation
   decisions, testing decisions, seams, out of scope, and notes. It should shape
   the whole program, not one tiny issue.

3. **Use existing test seams first.**
   Prefer the highest existing seam that proves user-visible behavior: CLI
   command behavior, MCP JSON-envelope parity, core retrieval/store behavior,
   adapter conformance, or skill eval behavior. Propose new seams only at the
   highest practical boundary.

4. **Separate adversarial critic pass.**
   A different agent critiques the PRD. The critic attacks missing cases, wrong
   seams, hidden coupling, privacy holes, stale-memory risk, untestable claims,
   scope creep, and codebase mismatch. Critique is evidence, not authority.
   Jordan adjudicates findings manually as accept, reject, or modify.

5. **Create vertical issue slices.**
   Break the adjudicated PRD into independently grabbable files under `issues/`.
   Follow the existing local style when extending the current series
   (`NN-short-name.md`). Use a named series such as `UPD-###-short-name.md` when
   a new program needs its own namespace. Issues must be in dependency order and
   include explicit `Blocked by`.

6. **Large tracer bullets, not horizontal phases.**
   Each issue should be a vertical slice that crosses the relevant layers needed
   to prove one behavior end to end. Do not create all-schema, all-plumbing,
   all-docs, all-tests phases unless that slice is itself the externally visible
   behavior or an unavoidable migration. The slice should be large enough to
   prove integration and small enough to fit a fresh agent's smart zone.

7. **Start one integration branch.**
   Create one integration branch for the program, for example
   `codex/lore-agent-workflows-integration`. The integration branch starts with
   the PRD and issue files. It is the landing zone for issue branches and the
   source branch for the final PR.

8. **Use one worktree and branch per issue.**
   Each issue gets its own branch and worktree from the current integration
   branch. Issue branches merge back into integration, not directly into `main`.
   Before merging an issue branch, update it from integration and resolve
   conflicts there.

9. **Dual-agent TDD per implementation slice.**
   For each slice, use a fresh test author and a separate implementer.

   - The test author writes the failing test first and verifies it is red for the
     right reason.
   - The implementer makes that test green. The implementer does not write its
     own acceptance test for the slice.
   - The main agent verifies scope and runs the relevant suite before commit.
   - After commit, a separate reviewer reviews the slice diff against the issue.
     The reviewer output is input, not authority. Verify claims against source
     before applying fixes.

10. **Merge only reviewed, green slices.**
    Merge an issue branch into integration only after its tests pass, scope is
    reviewed, and review findings are adjudicated. After every merge, run the
    relevant verification from the integration worktree.

11. **Clean local worktrees after integration.**
    Delete the issue worktree and local issue branch only after the branch is
    merged into integration, integration verification passes, and the issue
    worktree has no uncommitted work.

12. **One final PR for the whole program.**
    Once all slices land on integration, run full integration verification. Then
    run two independent reviewers over the complete feature diff against the PRD.
    In Codex, use GPT-5.5 for both reviewers with different angles and reasoning
    levels. If working from Claude Code, use one Opus agent and one Codex
    reviewer when available. Adjudicate claims with real evidence before calling
    the feature done.

## Model Guidance

For Codex work in this repo:

- Use GPT-5.5 for authoring, test authors, implementers, critics, and reviewers.
- Use medium or high reasoning for ordinary slices.
- Use extra-high reasoning for PRD critics, final whole-feature review, store
  migrations, privacy/delete behavior, and cross-harness ingestion changes.
- Use GPT-5.4-mini or the newest mini-equivalent only for scout tasks such as
  finding call sites, summarizing existing tests, or mapping files.

## Verification Commands

Default repo verification:

```bash
npm run check
```

Use narrower commands while iterating:

```bash
npm run typecheck
npm run lint
npm run format
npm run test
npm run build
```

For retrieval and CLI/MCP work, include targeted tests where possible:

```bash
npm run test -- src/cli/cli-mcp-parity.test.ts
npm run test -- src/mcp/server.test.ts
npm run test -- src/core/search
```

For skill or live-store behavior, deterministic tests live in the repo and the
large local-store smoke proof is documented in
`skills/lore/evals/real-store-smoke.md`. Do not put real transcript excerpts into
fixtures.

## Skill Completion Gate

No Lore skill is done when the files merely exist. A skill change is complete
only when the bundle and its behavior have been tested.

- New or changed skills must include `SKILL.md`, relevant `references/`,
  `examples/`, `evals/evals.json`, and validators/checkers for structured output
  when there is anything deterministic to check.
- Each new or changed workflow/dev-verification skill must commit
  `evals/test-report.md`.
- When a bundle-shape or test-report validator exists, run it before calling a
  skill slice complete.
- The test report must record eval prompts or ids, fixture source, run mode,
  with-skill results, baseline/old-skill results when practical, assertion
  grades, validator output, trigger checks where discoverability matters,
  privacy notes, changes made after testing, and remaining risks.
- Manual or agent-review evaluation is acceptable only when it is documented with
  evidence and assertions. It is not a substitute for testing.
- If a baseline, trigger loop, benchmark, or validator is genuinely irrelevant,
  the test report must say why. Otherwise the skill is not ready.

## Lore-Specific Quality Bars

- Raw Lore transcripts are testimony, not truth. Current repo files, current
  tests, and live runtime artifacts beat old session memory.
- Every search/retrieval feature must preserve provenance: message id, session
  id, source, project, branch when known, timestamp, role, and model when known.
- Every response path must be bounded. Never add a command or tool that dumps an
  unbounded session or huge message by default.
- CLI and MCP JSON envelopes must stay equivalent when they expose the same
  operation.
- Read paths must not mutate the store. Write paths must refuse incompatible
  newer stores instead of guessing.
- Destructive memory operations remain CLI-only, preview-first, and explicitly
  confirmed. Never expose `forget` or `exclude` over MCP.
- Redaction is on by default. Do not weaken credential redaction without a PRD,
  ADR, and privacy-focused review.
- Fixtures must be synthetic or minimal scrubbed samples. Do not commit real
  transcript data, credentials, private project text, or personal memory.
- Adapters must be honest about missing fields. Use `null` for data the source
  does not provide; never infer branch, cwd, model, or tool calls as fake data.
- Skill changes are whole-bundle changes. Treat `skills/lore` as a package, not
  a single markdown file.
- Workflow skills are evidence products. They need evals, examples, validators,
  and a committed test report before they are considered done.

## Product Skill vs Dev Verification

`skills/lore` is the user-facing skill for setting up and using Lore. It teaches
agents how to search, drill down, navigate sessions, push records, and control
memory.

Do not confuse that with project development verification. If a dedicated
`lore:dev-verification` or `lore-dev-verification` skill is added later, it
should verify changes to this repo itself: CLI/MCP parity, store migrations,
adapter conformance, privacy behavior, skill evals, recall workflows, and brief
workflows.

## Proposed Future Workflow Pack

The next Lore workflow expansion should be packaged as agent skills around the
existing CLI/MCP substrate:

- `lore:dev-verification`: project-specific verification gate for Lore repo
  changes and workflow skills, including bundle-shape and test-report checks.
- `lore:recall`: LLM-guided retrieval plans, query expansion, context drilling,
  source/freshness checks, and cited evidence packets.
- `lore:brief`: default rolling-last-24-hours synthesis of what happened, what is
  open, what changed, what was learned, and proposal-only signals for skills,
  jobs, issues, wiki updates, or fixes.
- `lore:handoff`: compact continuation packets for the next agent, with verified,
  open, stale, and risky sections.

These skills may propose actions. They must not create jobs, edit prompts, update
wiki pages, create tasks, or modify code unless the user explicitly asks for that
next step.
