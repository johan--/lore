import type { Store } from "../store/open-store.js";
import { sanitizeFtsQuery } from "./sanitize-fts.js";

export interface SearchHit {
  messageId: string;
  sessionId: string;
  sourceFileId: string;
  role: string;
  timestamp: string | null;
  project: string | null;
  branch: string | null;
  model: string | null;
  agent: string | null;
  /** May be elided by the response budget; see snippet vs. get_message(full). */
  text: string;
  textTruncated: boolean;
  score: number;
}

export interface SearchOptions {
  limit?: number;
}

const DEFAULT_LIMIT = 20;

interface HitRow {
  message_id: string;
  session_id: string;
  source_file_id: string;
  role: string;
  timestamp: string | null;
  project: string | null;
  branch: string | null;
  model: string | null;
  agent: string | null;
  text: string;
  text_truncated: number;
  score: number;
}

/**
 * Keyword search over message text, ranked by FTS5 bm25 (lower is better; we
 * negate so a higher `score` is a better match). Query operator characters are
 * sanitized so they never throw. Returns full provenance for every hit.
 */
export function searchMemory(db: Store, query: string, opts: SearchOptions = {}): SearchHit[] {
  const sanitized = sanitizeFtsQuery(query);
  if (!sanitized) return [];
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const rows = db
    .prepare(
      `SELECT m.message_id, m.session_id, m.source_file_id, m.role, m.timestamp,
              m.project, m.branch, m.model, m.agent, m.text, m.text_truncated,
              -bm25(messages_fts) AS score
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
        WHERE messages_fts MATCH ?
        ORDER BY score DESC
        LIMIT ?`,
    )
    .all(sanitized, limit) as HitRow[];

  return rows.map((r) => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    sourceFileId: r.source_file_id,
    role: r.role,
    timestamp: r.timestamp,
    project: r.project,
    branch: r.branch,
    model: r.model,
    agent: r.agent,
    text: r.text,
    textTruncated: r.text_truncated === 1,
    score: r.score,
  }));
}
