import type { Store } from "../store/open-store.js";

export type TimelineBucket = "day" | "hour";

export interface TimelineEntry {
  bucket: string;
  count: number;
}

export interface TimelineOptions {
  project?: string;
  /** Filter to one harness namespace (e.g. "claude-code", "codex"). */
  source?: string;
  since?: string;
  until?: string;
  bucket?: TimelineBucket;
}

interface TimelineRow {
  bucket: string;
  count: number;
}

/**
 * Bucket-by-bucket message activity. Buckets are derived by slicing the stored
 * ISO-8601 timestamp (already UTC), so the grouping is deterministic and free of
 * any timezone reinterpretation. Messages without a timestamp are excluded.
 */
export function timeline(db: Store, opts: TimelineOptions = {}): TimelineEntry[] {
  const bucketExpr =
    opts.bucket === "hour"
      ? "replace(substr(m.timestamp, 1, 13), 'T', ' ')"
      : "substr(m.timestamp, 1, 10)";

  const where: string[] = ["m.timestamp IS NOT NULL"];
  const params: string[] = [];
  if (typeof opts.project === "string") {
    where.push("m.project = ?");
    params.push(opts.project);
  }
  if (typeof opts.source === "string") {
    where.push("sf.source = ?");
    params.push(opts.source);
  }
  if (typeof opts.since === "string") {
    where.push("m.timestamp >= ?");
    params.push(opts.since);
  }
  if (typeof opts.until === "string") {
    where.push("m.timestamp <= ?");
    params.push(opts.until);
  }

  const rows = db
    .prepare(
      `SELECT ${bucketExpr} AS bucket, COUNT(*) AS count
         FROM messages m
         LEFT JOIN source_files sf ON sf.source_file_id = m.source_file_id
        WHERE ${where.join(" AND ")}
        GROUP BY bucket
        ORDER BY bucket ASC`,
    )
    .all(...params) as TimelineRow[];

  return rows.map((r) => ({ bucket: r.bucket, count: r.count }));
}
