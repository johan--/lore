# Lore

Local-only, full-fidelity memory of agent session transcripts, shared across harnesses and queried without a server. This glossary fixes the vocabulary for how memory is captured, protected, and removed.

## Language

**Redaction**:
The conservative scrubbing of obvious live credentials (API keys, tokens, PEM private keys) from message text and tool payloads at capture time. On by default. Does not touch non-credential content.
_Avoid_: Sanitize, filter, masking

**Forget**:
The user-invoked removal of already-indexed memory at session or project granularity. Deletes the rows and records a tombstone so re-indexing cannot resurrect them.
_Avoid_: Delete, purge, erase (when speaking of the user action — those name the raw row operation, not the durable act)

**Exclude**:
A standing rule that a project is never to be indexed. A tombstone written before the data exists, so the ingest path refuses it on every capture.
_Avoid_: Ignore, skip, blocklist

**Tombstone**:
A persistent record that a session or project is barred from the index. Outlives any single index run; consulted by the one shared ingest path so forgotten or excluded data stays gone across re-indexing.
_Avoid_: Denylist, blacklist, marker

**Session**:
One captured conversation, keyed by `session_id`. The natural unit a user points at to forget a single chat. Some sources (claude-code, codex) write one transcript file per session; others (cursor, hermes) pack many sessions into a single file. Removal therefore operates on the `session_id`, never on the file.

**Project**:
The repo or working directory a session belongs to, carried on every message. The coarsest unit for forget, and the only unit for exclude.
