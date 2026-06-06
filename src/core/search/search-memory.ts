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
  project?: string;
  branch?: string;
  /** Harness namespace (e.g. "claude-code", "codex"); a file-level attribute. */
  source?: string;
  agent?: string;
  skill?: string;
  /** Tool name; matches messages that issued a tool_call with this name. */
  tool?: string;
  role?: string;
  model?: string;
  /** Inclusive lower bound on ISO-8601 timestamp. */
  since?: string;
  /** Inclusive upper bound on ISO-8601 timestamp. */
  until?: string;
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

  const where: string[] = ["messages_fts MATCH ?"];
  const params: (string | number)[] = [sanitized];

  const eqFilters: [keyof SearchOptions, string][] = [
    ["project", "m.project"],
    ["branch", "m.branch"],
    ["agent", "m.agent"],
    ["skill", "m.skill"],
    ["role", "m.role"],
    ["model", "m.model"],
  ];
  for (const [key, column] of eqFilters) {
    const value = opts[key];
    if (typeof value === "string") {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (typeof opts.since === "string") {
    where.push("m.timestamp >= ?");
    params.push(opts.since);
  }
  if (typeof opts.until === "string") {
    where.push("m.timestamp <= ?");
    params.push(opts.until);
  }
  if (typeof opts.source === "string") {
    where.push("sf.source = ?");
    params.push(opts.source);
  }
  if (typeof opts.tool === "string") {
    where.push(
      "EXISTS (SELECT 1 FROM tool_calls tc WHERE tc.message_id = m.message_id AND tc.tool_name = ?)",
    );
    params.push(opts.tool);
  }
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT m.message_id, m.session_id, m.source_file_id, m.role, m.timestamp,
              m.project, m.branch, m.model, m.agent, m.text, m.text_truncated,
              -bm25(messages_fts) AS score
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         LEFT JOIN source_files sf ON sf.source_file_id = m.source_file_id
        WHERE ${where.join(" AND ")}
        ORDER BY score DESC
        LIMIT ?`,
    )
    .all(...params) as HitRow[];

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
