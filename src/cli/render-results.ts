import type { SearchHit } from "../core/search/search-memory.js";
import type { SessionSummary } from "../core/retrieval/list-sessions.js";
import type { MessageDetail } from "../core/retrieval/get-message.js";
import type { GetContextResult } from "../core/retrieval/get-context.js";
import type { GetSessionResult, GetSessionWindowResult } from "../core/retrieval/get-session.js";
import type { TimelineEntry } from "../core/retrieval/timeline.js";

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

/**
 * Render one message for `lore get`. JSON mode emits the `getMessage` detail
 * object verbatim, matching the MCP `get_message` envelope so a parser sees the
 * same shape from either path. Human mode leads with the ids needed to drill
 * further and flags elided text.
 */
export function renderMessage(detail: MessageDetail, json: boolean): string {
  if (json) return JSON.stringify(detail, null, 2) + "\n";
  const meta = [
    detail.role,
    detail.timestamp ?? "(no timestamp)",
    detail.model ? `model ${detail.model}` : null,
  ]
    .filter((p): p is string => p !== null)
    .join("  ");
  const note = detail.textTruncated ? " (stored text was truncated at ingest)" : "";
  return (
    `message ${detail.messageId}\n` +
    `    session ${detail.sessionId}\n` +
    `    ${meta}\n` +
    `    ${detail.text}${note}\n`
  );
}

/**
 * Render the neighbor window for `lore context`. JSON mode emits the
 * `getContext` result verbatim, matching the MCP `get_context` envelope. Human
 * mode marks the anchor with `>` so the centered message is obvious.
 */
export function renderContext(result: GetContextResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2) + "\n";
  if (result.messages.length === 0) return "No context.\n";
  return (
    result.messages
      .map((m) => {
        const marker = m.isAnchor ? "> " : "  ";
        return `${marker}message ${m.messageId}  (${m.role}, seq ${m.seq})\n      ${m.text}`;
      })
      .join("\n") + "\n"
  );
}

/**
 * Render one bounded page of a session timeline for `lore session`. JSON mode
 * mirrors the MCP `get_session` envelope as `{ messages, nextCursor }`. Human
 * mode trails the page with the cursor to pass back via `--cursor`, making the
 * page-and-drill contract obvious — there is deliberately no "show everything"
 * path because a session can run to thousands of messages.
 */
export function renderSessionPage(result: GetSessionResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2) + "\n";
  if (result.messages.length === 0) return "No messages.\n";
  const body = result.messages
    .map((m) => {
      const who = m.agent ? `${m.role}/${m.agent}` : m.role;
      return `  message ${m.messageId}  (${who}, seq ${m.seq})\n      ${m.text}`;
    })
    .join("\n");
  const more = result.nextCursor
    ? `\n\nmore: lore session <id> --cursor ${result.nextCursor}\n`
    : "\n";
  return body + more;
}

/**
 * Render the `--around` window for `lore session`. JSON mode emits the
 * `getSessionWindow` result verbatim as `{ messages }`. Human mode marks the
 * anchor with `>` like `lore context`, but this window spans the whole folded
 * session (primary + subagents) rather than a single file.
 */
export function renderSessionWindow(result: GetSessionWindowResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2) + "\n";
  if (result.messages.length === 0) return "No messages.\n";
  return (
    result.messages
      .map((m) => {
        const marker = m.isAnchor ? "> " : "  ";
        const who = m.agent ? `${m.role}/${m.agent}` : m.role;
        return `${marker}message ${m.messageId}  (${who}, seq ${m.seq})\n      ${m.text}`;
      })
      .join("\n") + "\n"
  );
}

/**
 * Render bucketed activity for `lore timeline`. JSON mode mirrors the MCP
 * `timeline` envelope as `{ buckets }`. Human mode prints one `bucket  count`
 * row per period in chronological order — enough to eyeball when a project was
 * active and feed a `--since/--until` window back into search.
 */
export function renderTimeline(buckets: TimelineEntry[], json: boolean): string {
  if (json) return JSON.stringify({ buckets }, null, 2) + "\n";
  if (buckets.length === 0) return "No activity.\n";
  return buckets.map((b) => `${b.bucket}  ${b.count}`).join("\n") + "\n";
}
