import type { Store } from "../store/open-store.js";
import { elide } from "../budget.js";

export interface ContextMessage {
  messageId: string;
  sourceFileId: string;
  sessionId: string;
  seq: number;
  role: string;
  timestamp: string | null;
  agent: string | null;
  /** Budget-elided snippet; fetch full text with getMessage(full=true). */
  text: string;
  /** True for the message the window was centered on. */
  isAnchor: boolean;
}

export interface GetContextResult {
  messages: ContextMessage[];
}

export interface GetContextOptions {
  /** Neighbor messages to include before the anchor (default 5). */
  before?: number;
  /** Neighbor messages to include after the anchor (default 5). */
  after?: number;
}

interface ContextRow {
  message_id: string;
  source_file_id: string;
  session_id: string;
  seq: number;
  role: string;
  timestamp: string | null;
  agent: string | null;
  text: string;
}

const SELECT_COLUMNS = `message_id, source_file_id, session_id, seq, role, timestamp, agent, text`;

/**
 * Return the neighbor window around an anchor message, in seq order. The window
 * never crosses source_file_id or session_id boundaries: neighbors are drawn
 * only from the same physical file and logical session as the anchor, so two
 * unrelated transcripts that happen to share seq numbers can't bleed together.
 */
export function getContext(
  db: Store,
  messageId: string,
  opts: GetContextOptions = {},
): GetContextResult | null {
  const before = opts.before ?? 5;
  const after = opts.after ?? 5;

  const anchor = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM messages WHERE message_id = ?`)
    .get(messageId) as ContextRow | undefined;
  if (!anchor) return null;

  const beforeRows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM messages
        WHERE source_file_id = ? AND session_id = ? AND seq < ?
        ORDER BY seq DESC LIMIT ?`,
    )
    .all(anchor.source_file_id, anchor.session_id, anchor.seq, before) as ContextRow[];

  const afterRows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM messages
        WHERE source_file_id = ? AND session_id = ? AND seq > ?
        ORDER BY seq ASC LIMIT ?`,
    )
    .all(anchor.source_file_id, anchor.session_id, anchor.seq, after) as ContextRow[];

  const ordered = [...beforeRows.reverse(), anchor, ...afterRows];
  return {
    messages: ordered.map((row) => ({
      messageId: row.message_id,
      sourceFileId: row.source_file_id,
      sessionId: row.session_id,
      seq: row.seq,
      role: row.role,
      timestamp: row.timestamp,
      agent: row.agent,
      text: elide(row.text, row.message_id),
      isAnchor: row.message_id === messageId,
    })),
  };
}
