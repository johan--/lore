# Verification Matrix

Pick the highest row that matches the change. Add narrower checks while
iterating, but do not replace the final gate with a narrow check.

| Change type | Required checks |
| --- | --- |
| Default docs-only change | `npm run format`, then `npm run check` if docs affect workflow, packaging, or skill behavior |
| CLI retrieval/status/search change | targeted CLI tests, `src/cli/cli-mcp-parity.test.ts` when MCP equivalent exists, `npm run check` |
| MCP read tool change | `src/mcp/server.test.ts`, CLI/MCP parity test when CLI equivalent exists, `npm run check` |
| Store migration/write path | migration/open-store tests, write compatibility tests, privacy/destructive-memory review, `npm run check` |
| Adapter/ingestion change | adapter conformance tests plus source-specific tests, redaction check if text shape changes, `npm run check` |
| Privacy/destructive-memory change | forget/exclude/tombstone tests, explicit confirm behavior, no destructive MCP exposure, `npm run check` |
| Workflow skill change | bundle-shape validator, `evals/test-report.md` validator, skill eval/review pass, `npm run check` |
| Packaging/install change | `npm pack --dry-run`, packaged skill smoke, bundle/report validators, `npm run check` |
| Real-store smoke | local-only CLI proof against `~/.lore/lore.db`; do not commit transcript content |

## Targeted commands

```bash
npm run test -- src/cli/cli-mcp-parity.test.ts
npm run test -- src/mcp/server.test.ts
npm run test -- src/core/search
npm run test -- src/core/retrieval
npm run test -- src/core/ingest/forget.test.ts src/core/store/tombstones.test.ts
```

Use `npm run check` as the final repo gate for issue slices unless the issue
explicitly says a narrower gate is acceptable.
