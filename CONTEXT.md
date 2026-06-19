# Lore

Local-only, full-fidelity memory for agent session transcripts, shared across harnesses and queried without a server. This glossary fixes vocabulary for how memory is captured, protected, queried, and removed.

## Language

**Redaction**: Conservative scrubbing of obvious live credentials (API keys, tokens, PEM private keys) from message text and tool payloads at capture time. On by default. Does not touch non-credential content.
_Avoid_: Sanitize, filter, masking

**Forget**: User-invoked removal of already-indexed memory at session or project granularity. Deletes rows and records a tombstone so re-indexing cannot resurrect them.
_Avoid_: Delete, purge, erase (when speaking of the user action; name raw row operations, not the durable act)

**Exclude**: Standing rule that a project is never indexed. A tombstone is written before data exists, so the ingest path refuses it on every capture.
_Avoid_: Ignore, skip, blocklist

**Tombstone**: Persistent record that a session or project is barred from the index. Outlives a single index run; consulted by the shared ingest path so forgotten or excluded data stays gone across re-indexing.
_Avoid_: Denylist, blacklist, marker

**Session**: One captured conversation, keyed by `session_id`. The natural unit a user points to when asking to forget a single chat. Some sources (claude-code, codex) write one transcript file per session; others (cursor, hermes) pack many sessions into a single file. Removal therefore operates on `session_id`, never on file.

**Project**: Repo working directory a session belongs to, carried on every message. The coarsest unit for forget, and the only unit for exclude.

**Read Compatibility**: Ability to query an existing store even when it was produced by a newer Lore build, as long as the memory surfaces being queried are still present.
_Avoid_: Schema forgiveness, downgrade support

**Write Compatibility**: Permission for a Lore build to mutate an existing store. Not assumed for newer stores; a write path must either understand the store shape it is mutating or refuse before changing it.
_Avoid_: Best-effort migration, blind upgrade

**Evidence Packet**: Bounded, provenance-carrying bundle of Lore records and nearby context used to support an agent answer. It can include search hits, full messages, context windows, session excerpts, freshness labels, and retrieval-failure notes. It is evidence, not truth.
_Avoid_: Search dump, answer, summary

**Workflow Skill**: LLM-guided agent workflow layered over Lore's deterministic CLI/MCP substrate. It applies judgment, query planning, synthesis, and failure handling while relying on commands/tools for evidence. The CLI remains the substrate; the skill is the reasoning layer.
_Avoid_: CLI command, script, deterministic workflow

**Skill Test Report**: Committed `evals/test-report.md` artifact proving a Lore skill was exercised after creation or change. It records eval prompts or ids, fixture source, run mode, with-skill and baseline/old-skill results when practical, assertion grades, validator output, trigger checks where relevant, privacy notes, changes made after testing, and remaining risks.
_Avoid_: Manual pass (unless it is evidence-backed), eval TODO, unchecked examples

**Recall**: Workflow skill for retrieving past session evidence. It plans searches, expands or narrows terms, drills into message/context/session ids, labels freshness and trust, and returns an evidence packet.
_Avoid_: Search (when meaning the full workflow), memory (too broad)

**Brief**: Workflow skill for a time-window synthesis, defaulting to the rolling last 24 hours unless the user specifies another window. It reports what happened, what remains open, what changed, what was learned, and proposal-only signals for possible skills, jobs, issues, wiki updates, or fixes.
_Avoid_: Report, digest (when they omit open work and proposals)

**Handoff**: Workflow skill for preparing the next agent to continue. It produces a compact continuation packet with verified, open, stale, risky, and next-action sections.
_Avoid_: Summary (too lossy), compaction (host behavior, not the Lore workflow)

**Memory Card**: Typed, evidence-linked durable object distilled from raw transcripts, such as a decision, claim, commitment, artifact, contradiction, or open question. A card does not replace the underlying transcript; it points back to it.
_Avoid_: Note, wiki page (unless the card is actually compiled into the wiki)

**Freshness Label**: Explicit metadata on a recall, brief, handoff, or memory card that describes age, source, project, branch, sync status, and stale-risk. It warns when evidence may be an afterimage of an older session.
_Avoid_: Confidence score (unless backed by a defined scoring model)

**Proposal**: Suggested next action produced by a Lore workflow, such as creating a skill, job, issue, wiki update, or fix. A proposal is inert until the user explicitly asks an agent to execute it.
_Avoid_: Automation, action, task (unless it has actually been created)
