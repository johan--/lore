import type { Store } from "./store/open-store.js";
import { getSchemaVersion, SCHEMA_VERSION } from "./store/migrate.js";

export interface LoreStatusOptions {
  source?: string;
  project?: string;
  since?: string;
  until?: string;
}

export type LoreStatusState =
  | "ready"
  | "missing_store"
  | "empty_store"
  | "unreadable_store"
  | "newer_store"
  | "stale_schema"
  | "source_absent";

export interface LoreStatusSourceSummary {
  source: string;
  messageCount: number;
  sessionCount: number;
  latestMessageTimestamp: string | null;
  latestIndexedAt: string | null;
}

export interface LoreStatusEnvelope {
  ok: boolean;
  status: LoreStatusState;
  filters: LoreStatusOptions;
  storePath: string;
  schemaVersion: number | null;
  supportedSchemaVersion: number;
  messageCount: number;
  sessionCount: number;
  sources: LoreStatusSourceSummary[];
  recovery: string | null;
}

interface StatusRow {
  message_count: number;
  session_count: number;
}

interface SourceRow {
  source: string;
  message_count: number;
  session_count: number;
  latest_message_timestamp: string | null;
  latest_indexed_at: string | null;
}

export function statusFilters(options: LoreStatusOptions): LoreStatusOptions {
  const filters: LoreStatusOptions = {};
  if (options.source !== undefined) filters.source = options.source;
  if (options.project !== undefined) filters.project = options.project;
  if (options.since !== undefined) filters.since = options.since;
  if (options.until !== undefined) filters.until = options.until;
  return filters;
}

export function missingStoreStatus(
  storePath: string,
  options: LoreStatusOptions = {},
): LoreStatusEnvelope {
  return baseStatus(
    "missing_store",
    storePath,
    null,
    options,
    "Run `lore setup` or `lore index <dir>` first.",
  );
}

export function unreadableStoreStatus(
  storePath: string,
  options: LoreStatusOptions = {},
): LoreStatusEnvelope {
  return baseStatus(
    "unreadable_store",
    storePath,
    null,
    options,
    "The Lore store exists but cannot be read by this process.",
  );
}

export function readLoreStatus(
  db: Store,
  options: LoreStatusOptions = {},
  storePath = databaseName(db),
): LoreStatusEnvelope {
  const schemaVersion = getSchemaVersion(db);
  if (schemaVersion > SCHEMA_VERSION) {
    return baseStatus(
      "newer_store",
      storePath,
      schemaVersion,
      options,
      "Update Lore before reading this store.",
    );
  }
  if (schemaVersion < SCHEMA_VERSION) {
    return baseStatus(
      "stale_schema",
      storePath,
      schemaVersion,
      options,
      "Run a current Lore write/setup command to migrate the store.",
    );
  }

  const totalMessages = countAllMessages(db);
  if (totalMessages === 0) {
    return baseStatus(
      "empty_store",
      storePath,
      schemaVersion,
      options,
      "Store is readable but has no indexed messages. Run `lore index <dir>` or `lore setup`.",
    );
  }

  if (options.source !== undefined && countMessagesForSource(db, options.source) === 0) {
    return baseStatus(
      "source_absent",
      storePath,
      schemaVersion,
      options,
      `No indexed messages found for source "${options.source}".`,
    );
  }

  const { where, params } = statusWhere(options);
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS message_count, COUNT(DISTINCT m.session_id) AS session_count
       FROM messages m
       LEFT JOIN source_files sf ON sf.source_file_id = m.source_file_id
       ${where}`,
    )
    .get(...params) as StatusRow;

  const sources = db
    .prepare(
      `SELECT sf.source AS source,
              COUNT(*) AS message_count,
              COUNT(DISTINCT m.session_id) AS session_count,
              MAX(m.timestamp) AS latest_message_timestamp,
              MAX(sf.indexed_at) AS latest_indexed_at
       FROM messages m
       LEFT JOIN source_files sf ON sf.source_file_id = m.source_file_id
       ${where}
       GROUP BY sf.source
       ORDER BY message_count DESC, source ASC`,
    )
    .all(...params) as SourceRow[];

  return {
    ok: true,
    status: "ready",
    filters: statusFilters(options),
    storePath,
    schemaVersion,
    supportedSchemaVersion: SCHEMA_VERSION,
    messageCount: counts.message_count,
    sessionCount: counts.session_count,
    sources: sources.map((row) => ({
      source: row.source,
      messageCount: row.message_count,
      sessionCount: row.session_count,
      latestMessageTimestamp: row.latest_message_timestamp,
      latestIndexedAt: row.latest_indexed_at,
    })),
    recovery: null,
  };
}

function baseStatus(
  status: Exclude<LoreStatusState, "ready">,
  storePath: string,
  schemaVersion: number | null,
  options: LoreStatusOptions,
  recovery: string,
): LoreStatusEnvelope {
  return {
    ok: false,
    status,
    filters: statusFilters(options),
    storePath,
    schemaVersion,
    supportedSchemaVersion: SCHEMA_VERSION,
    messageCount: 0,
    sessionCount: 0,
    sources: [],
    recovery,
  };
}

function countAllMessages(db: Store): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM messages").get() as { count: number };
  return row.count;
}

function countMessagesForSource(db: Store, source: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM messages m
       JOIN source_files sf ON sf.source_file_id = m.source_file_id
       WHERE sf.source = ?`,
    )
    .get(source) as { count: number };
  return row.count;
}

function statusWhere(options: LoreStatusOptions): { where: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];

  if (options.source !== undefined) {
    clauses.push("sf.source = ?");
    params.push(options.source);
  }
  if (options.project !== undefined) {
    clauses.push("m.project = ?");
    params.push(options.project);
  }
  if (options.since !== undefined) {
    clauses.push("m.timestamp >= ?");
    params.push(options.since);
  }
  if (options.until !== undefined) {
    clauses.push("m.timestamp <= ?");
    params.push(options.until);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function databaseName(db: Store): string {
  const candidate = (db as Store & { name?: unknown }).name;
  return typeof candidate === "string" ? candidate : "";
}
