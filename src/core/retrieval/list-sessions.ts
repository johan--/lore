import type { Store } from "../store/open-store.js";
import { clampLimit, MAX_RESULTS } from "../limits.js";

export interface SessionSummary {
  sessionId: string;
  source: string | null;
  project: string | null;
  branch: string | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  messageCount: number;
}

export interface ListSessionsOptions {
  project?: string;
  /** Filter to one harness namespace (e.g. "claude-code", "codex"). */
  source?: string;
  /** Inclusive lower bound on a session's last activity. */
  since?: string;
  /** Inclusive upper bound on a session's last activity. */
  until?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;

interface SummaryRow {
  session_id: string;
  source: string | null;
  project: string | null;
  branch: string | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
  message_count: number;
}

/**
 * Roll up sessions into one row each, aggregated directly from messages so the
 * counts and time bounds can never drift from the indexed content. `source` is
 * joined from the file table (a file-level attribute), and is filterable so a
 * caller can scope to one harness namespace.
 */
export function listSessions(db: Store, opts: ListSessionsOptions = {}): SessionSummary[] {
  const limit = clampLimit(opts.limit, DEFAULT_LIMIT, MAX_RESULTS);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (typeof opts.project === "string") {
    where.push("m.project = ?");
    params.push(opts.project);
  }
  if (typeof opts.source === "string") {
    where.push("sf.source = ?");
    params.push(opts.source);
  }

  const having: string[] = [];
  if (typeof opts.since === "string") {
    having.push("MAX(m.timestamp) >= ?");
    params.push(opts.since);
  }
  if (typeof opts.until === "string") {
    having.push("MAX(m.timestamp) <= ?");
    params.push(opts.until);
  }
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT m.session_id AS session_id,
              MIN(sf.source) AS source,
              MIN(m.project) AS project,
              MIN(m.branch) AS branch,
              MIN(m.timestamp) AS first_timestamp,
              MAX(m.timestamp) AS last_timestamp,
              COUNT(*) AS message_count
         FROM messages m
         LEFT JOIN source_files sf ON sf.source_file_id = m.source_file_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        GROUP BY m.session_id
        ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
        ORDER BY last_timestamp DESC
        LIMIT ?`,
    )
    .all(...params) as SummaryRow[];

  return rows.map((r) => ({
    sessionId: r.session_id,
    source: r.source,
    project: r.project,
    branch: r.branch,
    firstTimestamp: r.first_timestamp,
    lastTimestamp: r.last_timestamp,
    messageCount: r.message_count,
  }));
}
