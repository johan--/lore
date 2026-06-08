# lore — Retrieval & Memory-Quality Context

The shared language for how lore *ranks*, *scores*, and *ages* the memory it serves.
(lore is a local-only SQLite store of agent session transcripts, queried over MCP and a CLI.)

## Language

### Retrieval surfaces

**search_memory**:
Keyword lookup ranked purely by how well the words match. The "best match, ignore age" surface.
_Avoid_: full-text-search, keyword-search (those are the mechanism, not the concept).

**find_relevant**:
The default "smart" retrieval — best match, gently biased toward what matters now.
_Avoid_: semantic-search (it is not semantic; see **Relevance**).

### What ranks a memory

**Relevance**:
How well a memory answers the query. Today purely **lexical**, not **semantic**.
_Avoid_: similarity, match-score.

**Lexical relevance**:
Word-for-word overlap between query and memory. What lore has today.

**Semantic relevance**:
Meaning-level match that catches paraphrase; needs embeddings/vectors. Deliberately not built.

**Recency**:
How recently a memory was created. A *gentle prior* on ranking — never the dominant term.
_Avoid_: freshness, decay (decay is the implementation of this prior).

**Importance**:
How much a memory matters independent of the query — *derived* from transcripts already on
disk, never recorded by observing reads.

**Recurrence**:
How often the same content/topic appears across distinct sessions; the main computable
**Importance** signal.
_Avoid_: frequency, popularity.

**Reuse**:
Evidence a memory was actually used after being retrieved (e.g. its content reappears in a
later turn). Verbatim-only without vectors, so weak — a corroborator, not a pillar.

**Usage-stamp**:
A record that a memory *was retrieved*, written at retrieval time. Distinct from **Reuse**
(which is derived, not recorded). Not built; reserved for **Pruning**.

### Memory hygiene

**Pruning**:
Removing memories that are *never useful* — not merely old. Requires **Usage-stamp** data; no
automatic pruning exists today.

**Forget**:
An explicit, user-initiated deletion or redaction of specific memory. Independent of **Pruning**.
Not built.

## Relationships

- **find_relevant** ranks by **Relevance**, nudged by **Recency** and **Importance**.
- **search_memory** ranks by **Lexical relevance** only.
- **Importance** is derived from **Recurrence** (plus recency and authorship) — never from **Usage-stamps**.
- **Pruning** consumes **Usage-stamps**; ranking does not.

## Example dialogue

> **Dev:** "Should `find_relevant` return the newest matching memory?"
> **Design:** "No — it returns the *best* match, with **Recency** only breaking near-ties. 'Newest matching' is exactly what the old blend did wrong."
> **Dev:** "How do we know a memory is important — do we log when it's read?"
> **Design:** "No. We count how often it **recurs** across transcripts we already store. Logging reads is a **Usage-stamp**, and that's for **Pruning** later — not ranking."

## Flagged ambiguities

- "relevant" was used to mean both *lexical query match* and *overall usefulness* — resolved:
  **Relevance** = query match (lexical today); **Importance** = query-independent worth.
  `find_relevant` blends both.
- "reuse" conflated two mechanisms — resolved: **Reuse** (derived from echoes in later turns,
  verbatim-only, weak) vs **Usage-stamp** (recorded at read time, precise, reserved for pruning).
