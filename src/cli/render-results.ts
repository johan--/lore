import type { SearchHit } from "../core/search/search-memory.js";
import type { SessionSummary } from "../core/retrieval/list-sessions.js";

/**
 * Render search hits for `lore search`. Kept pure (hits in, string out) so the
 * CLI stays a thin dispatcher and the formatting is directly testable.
 *
 * JSON mode mirrors the MCP server's `{ count, hits }` envelope exactly, so an
 * agent parsing CLI output and an agent parsing MCP output see the same shape.
 * Human mode leads each hit with its `messageId` because that is the key an
 * agent needs to pull the full text back via `get_message`.
 */
export function renderSearchResults(hits: SearchHit[], json: boolean): string {
  if (json) return JSON.stringify({ count: hits.length, hits }, null, 2) + "\n";
  if (hits.length === 0) return "No matches.\n";
  return hits.map((h, i) => renderHit(h, i + 1)).join("\n") + "\n";
}

function renderHit(h: SearchHit, n: number): string {
  const meta = [`score ${h.score.toFixed(2)}`, h.role, h.timestamp ?? "(no timestamp)"].join("  ");
  const provenance = [
    h.source ? `source ${h.source}` : null,
    `session ${h.sessionId}`,
    h.project ? `project ${h.project}` : null,
    h.branch ? `branch ${h.branch}` : null,
    h.model ? `model ${h.model}` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
  const truncated = h.textTruncated ? " (elided — get_message(full=true) for the rest)" : "";
  return (
    `[${n}] ${meta}\n` +
    `    ${provenance}\n` +
    `    message ${h.messageId}\n` +
    `    ${h.text}${truncated}\n`
  );
}

/**
 * Render session rollups for `lore sessions`. JSON mode mirrors the search
 * envelope as `{ count, sessions }`. Human mode leads with the `sessionId` so it
 * can be passed straight back into `lore search --session <id>`.
 */
export function renderSessions(sessions: SessionSummary[], json: boolean): string {
  if (json) return JSON.stringify({ count: sessions.length, sessions }, null, 2) + "\n";
  if (sessions.length === 0) return "No sessions.\n";
  return sessions.map(renderSession).join("\n") + "\n";
}

function renderSession(s: SessionSummary): string {
  const meta = [
    s.source,
    s.project ? `project ${s.project}` : null,
    s.branch ? `branch ${s.branch}` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
  const span = `${s.firstTimestamp ?? "?"} → ${s.lastTimestamp ?? "?"}`;
  return `${s.sessionId}  (${s.messageCount} messages)\n` + `    ${meta}\n` + `    ${span}\n`;
}
