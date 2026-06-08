import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { computeMessageId, type MessageRecord, type MessageRole } from "../../core/records.js";
import { planReindex } from "../../core/indexer/watermark.js";
import type { DiscoveredFile, IngestContext, IngestResult } from "../contract.js";
import { splitDbRef } from "../sqlite/db-ref.js";

const DEFAULT_MAX_TEXT_CHARS = 100_000;

interface CursorBubble {
  type?: number;
  text?: string;
  bubbleId?: string;
  createdAt?: number | string;
}

function cap(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}

/** Cursor bubble `type`: 1 = user, 2 = assistant. Anything else maps to system. */
function mapRole(type: number | undefined): MessageRole {
  if (type === 1) return "user";
  if (type === 2) return "assistant";
  return "system";
}

function toIso(createdAt: number | string | undefined): string | null {
  if (typeof createdAt === "string") {
    const ms = Date.parse(createdAt);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stableSeq(value: string): number {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 12), 16);
}

function parseCursorKey(key: string, expectedComposerId: string): string | null {
  const prefix = `bubbleId:${expectedComposerId}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

function fingerprintRows(
  db: Database.Database,
  keyPrefix: string,
  maxRowId: number | null,
): string | null {
  if (maxRowId === null) return null;
  const rows = db
    .prepare(
      "SELECT key, value FROM cursorDiskKV WHERE key LIKE ? || '%' AND rowid <= ? ORDER BY key",
    )
    .all(keyPrefix, maxRowId) as { key: string; value: string }[];
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(row.key).update("\0").update(row.value).update("\0");
  }
  return hash.digest("hex");
}

/**
 * Ingest one Cursor conversation. The discovered ref is `<dbPath>#<composerId>`;
 * we open the SQLite file read-only and read that composer's bubbles ordered by
 * rowid. Cursor bubbles store only message text — every tool/diff/thinking field
 * in the row is empty in practice — so this adapter is honestly text-only and
 * produces no tool-call records. The global `cursorDiskKV` rowid is the resume
 * cursor: a re-index appends only bubbles past the last ingested rowid.
 *
 * Message ids are minted from the bubble's stable rowid (not a positional
 * counter), as the contract requires for database sources, so re-indexing the
 * same row never produces a different id.
 */
export async function ingestCursorConversation(
  file: DiscoveredFile,
  ctx: IngestContext,
): Promise<IngestResult> {
  const maxChars = ctx.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  const { dbPath, sessionId: composerId } = splitDbRef(file.path);
  const keyPrefix = `bubbleId:${composerId}:`;

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const maxRow = db
      .prepare("SELECT MAX(rowid) AS maxRowId FROM cursorDiskKV WHERE key LIKE ? || '%'")
      .get(keyPrefix) as { maxRowId: number | null };
    const maxRowId = maxRow?.maxRowId ?? null;

    const prefixFingerprint =
      ctx.priorToken?.kind === "rowid" && ctx.priorToken.fingerprint
        ? fingerprintRows(db, keyPrefix, ctx.priorToken.value)
        : null;
    const plan = planReindex(ctx.priorToken, {
      kind: "rowid",
      maxRowId,
      fingerprint: prefixFingerprint,
    });
    if (plan.mode === "skip") {
      return {
        mode: "skip",
        messages: [],
        toolCalls: [],
        skipped: 0,
        resumeToken: ctx.priorToken ?? {
          kind: "rowid",
          value: maxRowId ?? 0,
          fingerprint: fingerprintRows(db, keyPrefix, maxRowId) ?? undefined,
        },
      };
    }

    const startRowid = plan.mode === "append" && plan.from.kind === "rowid" ? plan.from.value : 0;
    const rows = db
      .prepare(
        "SELECT rowid AS rowid, key, value FROM cursorDiskKV WHERE key LIKE ? || '%' AND rowid > ? ORDER BY rowid",
      )
      .all(keyPrefix, startRowid) as { rowid: number; key: string; value: string }[];

    const messages: MessageRecord[] = [];
    let skipped = 0;
    for (const row of rows) {
      const bubble = parseBubble(row.value);
      const text = typeof bubble?.text === "string" ? bubble.text : "";
      if (!bubble || text.trim().length === 0) {
        // Empty-text bubbles (tool-only / thinking turns Cursor stores nothing
        // for) carry no searchable content — count them as skipped.
        skipped++;
        continue;
      }
      const keyMessageId = parseCursorKey(row.key, composerId);
      const uuid = keyMessageId ?? (typeof bubble.bubbleId === "string" ? bubble.bubbleId : "");
      const seq = stableSeq(uuid || row.key);
      const capped = cap(text, maxChars);
      messages.push({
        messageId: computeMessageId(ctx.sourceFileId, uuid, seq),
        sourceFileId: ctx.sourceFileId,
        sessionId: ctx.sessionId,
        uuid,
        parentUuid: null,
        seq,
        role: mapRole(bubble.type),
        timestamp: toIso(bubble.createdAt),
        project: null,
        branch: null,
        model: null,
        agent: null,
        skill: null,
        text: capped.text,
        textTruncated: capped.truncated,
      });
    }

    return {
      mode: plan.mode,
      messages,
      toolCalls: [],
      skipped,
      resumeToken: {
        kind: "rowid",
        value: maxRowId ?? startRowid,
        fingerprint: fingerprintRows(db, keyPrefix, maxRowId) ?? undefined,
      },
    };
  } finally {
    db?.close();
  }
}

function parseBubble(value: string): CursorBubble | null {
  try {
    return JSON.parse(value) as CursorBubble;
  } catch {
    return null;
  }
}
