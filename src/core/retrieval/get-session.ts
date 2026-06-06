import type { Store } from "../store/open-store.js";
import { elide } from "../budget.js";

export interface SessionMessage {
  messageId: string;
  sourceFileId: string;
  seq: number;
  role: string;
  timestamp: string | null;
  agent: string | null;
  /** Budget-elided snippet; fetch full text with getMessage(full=true). */
  text: string;
}

export interface GetSessionResult {
  messages: SessionMessage[];
  /** Opaque cursor for the next page, or null when the timeline is exhausted. */
  nextCursor: string | null;
}

export interface GetSessionOptions {
  /** Opaque cursor returned by a prior call; resumes after that point. */
  cursor?: string;
  /** Max messages to return (default 100). */
  limit?: number;
}

const DEFAULT_LIMIT = 100;

interface SessionRow {
  message_id: string;
  source_file_id: string;
  seq: number;
  role: string;
  timestamp: string | null;
  agent: string | null;
  text: string;
}

function parseOffset(cursor: string | undefined): number {
  if (typeof cursor !== "string") return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Return one logical session as a single chronological timeline, folding the
 * primary thread and every subagent file together. Ordered by (timestamp,
 * source_file_id, seq) so interleaved subagent work lands in real time order and
 * ties are deterministic. Paginated by an opaque offset cursor.
 */
export function getSession(
  db: Store,
  sessionId: string,
  opts: GetSessionOptions = {},
): GetSessionResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const offset = parseOffset(opts.cursor);

  const rows = db
    .prepare(
      `SELECT message_id, source_file_id, seq, role, timestamp, agent, text
         FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC, source_file_id ASC, seq ASC
        LIMIT ? OFFSET ?`,
    )
    .all(sessionId, limit + 1, offset) as SessionRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: page.map((row) => ({
      messageId: row.message_id,
      sourceFileId: row.source_file_id,
      seq: row.seq,
      role: row.role,
      timestamp: row.timestamp,
      agent: row.agent,
      text: elide(row.text, row.message_id),
    })),
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}
