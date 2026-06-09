# Redaction is on by default

Lore originally indexed everything verbatim and kept secret redaction opt-in (`--redact`, off by default), on the theory that a local-only store should drop nothing unless asked. In practice that meant a pasted live credential (an `sk-…` key, a GitHub/AWS/Slack token, a PEM private-key block) landed verbatim in the store the moment a session was captured — and re-indexing would resurrect it.

We decided to run the conservative credential-redaction pass (`src/core/redact.ts`) **on by default**, for both the live hook and backfill/`setup`. The "verbatim" promise is reframed to cover conversational content — your words and the agent's reasoning are kept whole; the only thing scrubbed at capture is obvious live credentials. A working credential is a hazard, not content, and there is near-zero legitimate reason to keep one in agent memory; the patterns are deliberately conservative (low false-positive risk).

Consequences: the headline copy in README, PRD-lore, and AGENT-ONBOARD that says "indexed verbatim by default, nothing gets dropped unless you ask" must be rewritten to carve out credentials. Users who genuinely want a credential stored can still opt out at the call site. This does not change the "read-only over source files" guarantee — redaction only affects what is written into the index, never the transcripts on disk.
