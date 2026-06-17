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
