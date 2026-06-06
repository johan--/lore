import type { Store } from "./open-store.js";
import { upsertSession } from "./upsert.js";

/**
 * Recompute a session's rollup from the canonical messages table.
 *
 * A logical session can span a primary file plus several subagent files, and an
 * append re-index only sees its own new tail — so per-run counts are never
 * authoritative. Deriving project/branch/timestamps/count straight from the
 * messages table keeps the rollup correct no matter how the rows arrived
 * (full index, append, or a live push from another harness).
 */
export function recomputeSession(db: Store, sessionId: string): void {
  const row = db
    .prepare(
      `SELECT
         (SELECT project FROM messages WHERE session_id = @s AND project IS NOT NULL ORDER BY seq DESC LIMIT 1) AS project,
         (SELECT branch  FROM messages WHERE session_id = @s AND branch  IS NOT NULL ORDER BY seq DESC LIMIT 1) AS branch,
         (SELECT source  FROM source_files WHERE session_id = @s ORDER BY indexed_at DESC LIMIT 1) AS source,
         MIN(timestamp) AS first_timestamp,
         MAX(timestamp) AS last_timestamp,
         COUNT(*)       AS message_count
       FROM messages WHERE session_id = @s`,
    )
    .get({ s: sessionId }) as {
    project: string | null;
    branch: string | null;
    source: string | null;
    first_timestamp: string | null;
    last_timestamp: string | null;
    message_count: number;
  };
  upsertSession(db, {
    sessionId,
    source: (row.source as "claude-code" | "codex" | null) ?? "claude-code",
    project: row.project,
    branch: row.branch,
    firstTimestamp: row.first_timestamp,
    lastTimestamp: row.last_timestamp,
    messageCount: row.message_count,
  });
}
