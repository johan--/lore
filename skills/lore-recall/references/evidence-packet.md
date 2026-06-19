# Evidence Packet Contract

Return this shape for recall answers. Markdown is fine for humans, but keep these fields explicit.

```json
{
  "question": "What the user asked",
  "status": { "status": "ready", "messageCount": 3, "filters": { "project": "/repo" } },
  "plan": ["query variant and why"],
  "selectedEvidence": [
    {
      "claim": "What this evidence supports",
      "messageId": "m-synthetic",
      "sessionId": "sess-synthetic",
      "sourceFileId": "sf-synthetic",
      "source": "codex",
      "project": "/repo",
      "branch": "main",
      "messageTimestamp": "2026-05-10T00:00:00.000Z",
      "indexedAt": "2026-05-10T00:05:00.000Z",
      "ageFromMessage": "recent",
      "ageFromIndex": "recent",
      "syncStatus": "fresh",
      "staleReason": null,
      "role": "assistant",
      "freshness": "recent",
      "excerpt": "Short synthetic excerpt or paraphrase"
    }
  ],
  "answer": "Bounded synthesis with citations to message ids",
  "gaps": ["What Lore did not prove"],
  "nextQueries": ["Optional follow-up query"]
}
```

Rules:

- `selectedEvidence` must be bounded. Prefer 1-5 items.
- Each evidence item must cite real ids from Lore output during real use.
- Freshness fields must be honest: unknown source data is `null`, never inferred.
- `syncStatus` is one of `fresh`, `possibly_stale`, or `unknown`; `staleReason` is `null` only when status is `fresh`.
- `excerpt` should be short. Prefer paraphrase when private transcript content is sensitive.
- `gaps` is required even when empty, because absence of proof matters.
