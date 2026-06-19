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
      "source": "codex",
      "project": "/repo",
      "branch": "main",
      "timestamp": "2026-05-10T00:00:00.000Z",
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
- `excerpt` should be short. Prefer paraphrase when private transcript content is sensitive.
- `gaps` is required even when empty, because absence of proof matters.
