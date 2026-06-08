import type { Store } from "../store/open-store.js";
import { elide } from "../budget.js";
import { clampLimit, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE } from "../limits.js";

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
  /**
   * Max messages to return. Defaults to `DEFAULT_SESSION_PAGE` and is hard-capped
   * at `MAX_SESSION_PAGE` — a session can hold thousands of messages, so the
   * contract is page-and-drill, never dump. The remainder stays reachable via the
   * returned cursor, so capping never strands deep messages.
   */
  limit?: number;
}

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
  const limit = clampLimit(opts.limit, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE);
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

export interface SessionWindowMessage extends SessionMessage {
  /** True for the single message the window is centered on. */
  isAnchor: boolean;
}

export interface GetSessionWindowResult {
  messages: SessionWindowMessage[];
}

export interface GetSessionWindowOptions {
  /** Messages to include before the anchor (default 5, capped at MAX_SESSION_PAGE). */
  before?: number;
  /** Messages to include after the anchor (default 5, capped at MAX_SESSION_PAGE). */
  after?: number;
}

const DEFAULT_WINDOW_SIDE = 5;

/**
 * The folded-timeline ordering key. `timestamp` can be NULL for messages that
 * never carried one; `COALESCE(timestamp,'')` sorts those first and, crucially,
 * lets the row-value comparison below stay total (a NULL inside a row-value
 * comparison would make the whole predicate NULL and silently drop rows).
 */
const ORDER_KEY = "COALESCE(timestamp,''), source_file_id, seq";
/** Same key, descending — note each column needs its own DESC, not a trailing one. */
const ORDER_KEY_DESC = "COALESCE(timestamp,'') DESC, source_file_id DESC, seq DESC";

function toWindowMessage(row: SessionRow, isAnchor: boolean): SessionWindowMessage {
  return {
    messageId: row.message_id,
    sourceFileId: row.source_file_id,
    seq: row.seq,
    role: row.role,
    timestamp: row.timestamp,
    agent: row.agent,
    text: elide(row.text, row.message_id),
    isAnchor,
  };
}

/**
 * Jump to a known message and return its neighborhood within the folded session
 * timeline — the `--around` mode. Unlike `getContext`, which never crosses a
 * source file, this window spans the whole logical session (primary + subagents)
 * so the anchor's real-time neighbors show up even when they live in a different
 * file. Returns null when the anchor is not part of the session, so callers can
 * report not_found rather than an empty-but-valid window. Each side is capped at
 * `MAX_SESSION_PAGE` so an oversized `before`/`after` can't coerce a dump.
 */
export function getSessionWindow(
  db: Store,
  sessionId: string,
  anchorId: string,
  opts: GetSessionWindowOptions = {},
): GetSessionWindowResult | null {
  const before = clampLimit(opts.before, DEFAULT_WINDOW_SIDE, MAX_SESSION_PAGE);
  const after = clampLimit(opts.after, DEFAULT_WINDOW_SIDE, MAX_SESSION_PAGE);

  const anchor = db
    .prepare(
      `SELECT message_id, source_file_id, seq, role, timestamp, agent, text
         FROM messages
        WHERE session_id = ? AND message_id = ?`,
    )
    .get(sessionId, anchorId) as SessionRow | undefined;
  if (!anchor) return null;

  const anchorKey: [string, string, number] = [
    anchor.timestamp ?? "",
    anchor.source_file_id,
    anchor.seq,
  ];

  const beforeRows = db
    .prepare(
      `SELECT message_id, source_file_id, seq, role, timestamp, agent, text
         FROM messages
        WHERE session_id = ? AND (${ORDER_KEY}) < (?, ?, ?)
        ORDER BY ${ORDER_KEY_DESC}
        LIMIT ?`,
    )
    .all(sessionId, ...anchorKey, before) as SessionRow[];

  const afterRows = db
    .prepare(
      `SELECT message_id, source_file_id, seq, role, timestamp, agent, text
         FROM messages
        WHERE session_id = ? AND (${ORDER_KEY}) > (?, ?, ?)
        ORDER BY ${ORDER_KEY} ASC
        LIMIT ?`,
    )
    .all(sessionId, ...anchorKey, after) as SessionRow[];

  return {
    messages: [
      ...beforeRows.reverse().map((r) => toWindowMessage(r, false)),
      toWindowMessage(anchor, true),
      ...afterRows.map((r) => toWindowMessage(r, false)),
    ],
  };
}
