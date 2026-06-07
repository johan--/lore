# Security Policy

## Reporting a vulnerability

If you find a security issue in Lore, please report it privately rather than
opening a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/jordanhindo/lore/security/advisories/new)
for this repository, or open a minimal public issue asking for a private contact
channel if that is unavailable. Please give us a reasonable window to respond
before any public disclosure.

## What Lore stores, and where

Lore is local-only by design. It builds a SQLite database of your agent session
transcripts and serves search over it via MCP. Nothing is sent off your machine.

- The store lives at `~/.lore/lore.db` (override with `LORE_DB`).
- Transcripts are indexed **verbatim by default**. If your sessions contain
  secrets (API keys, tokens, `.env` contents), those secrets are written to the
  store in plaintext.
- The store is a normal file on disk. It is protected only by your filesystem
  permissions. It is not encrypted at rest.

## Redaction is opt-in and best-effort

Passing `--redact` to `lore index` / `lore hook` runs a conservative credential
scrubber over message text and tool payloads before they are stored. It matches
common shapes (OpenAI, GitHub, AWS, Slack keys, Bearer tokens, PEM private-key
blocks). It will not catch every secret. Treat it as a safety net, not a
guarantee. If a transcript is sensitive, do not index it.

## Scope

Because Lore is a local tool that you run on your own machine over data you
already have on disk, the threat model is narrow: it does not open a network
listener, does not authenticate remote callers, and grants no access beyond what
the user running it already has. The most likely real-world risk is the
plaintext store described above. Handle `~/.lore/lore.db` with the same care you
would give the transcripts it indexes.
