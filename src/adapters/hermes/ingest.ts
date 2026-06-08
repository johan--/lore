import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import {
  computeMessageId,
  type MessageRecord,
  type MessageRole,
  type ToolCallRecord,
} from "../../core/records.js";
import { planReindex } from "../../core/indexer/watermark.js";
import type { DiscoveredFile, IngestContext, IngestResult } from "../contract.js";
import { splitDbRef } from "../sqlite/db-ref.js";

const DEFAULT_MAX_TEXT_CHARS = 100_000;

interface HermesRow {
  id: number;
  role: string;
  content: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
  tool_name: string | null;
  timestamp: number | null;
}

interface HermesToolCall {
  id?: string;
  call_id?: string;
  function?: { name?: string; arguments?: string };
}

function cap(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}

/**
 * Hermes message roles are `user`, `assistant`, `tool`, and `session_meta`. The
 * first two map straight through; `tool` rows carry a tool result and are recorded
 * as `system` messages; `session_meta` is dropped before this is called.
 */
function mapRole(role: string): MessageRole {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "system";
}

/** Hermes timestamps are epoch seconds (float). */
function toIso(seconds: number | null): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Decide whether a tool result represents an error. Hermes tool results are JSON
 * objects; a `success: false` flag or an `error` field marks failure. Unparseable
 * or shapeless results are honestly undeterminable (null) rather than assumed ok.
 */
function detectError(content: string): boolean | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      if (parsed.success === false) return true;
      if ("error" in parsed && parsed.error != null && parsed.error !== false) return true;
      return false;
    }
  } catch {
    return null;
  }
  return null;
}

function parseToolCalls(raw: string | null): HermesToolCall[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((call): call is Record<string, unknown> => call !== null && typeof call === "object")
      .map(normalizeToolCall);
  } catch {
    return [];
  }
}

function normalizeToolCall(call: Record<string, unknown>): HermesToolCall {
  const fn = call["function"];
  const rawFunction = fn && typeof fn === "object" && !Array.isArray(fn) ? fn : undefined;
  const rawArgs = rawFunction ? (rawFunction as Record<string, unknown>)["arguments"] : undefined;
  let args: string | undefined;
  if (typeof rawArgs === "string") {
    args = rawArgs;
  } else if (rawArgs !== undefined) {
    try {
      args = JSON.stringify(rawArgs);
    } catch {
      args = String(rawArgs);
    }
  }
  return {
    id: typeof call["id"] === "string" ? call["id"] : undefined,
    call_id: typeof call["call_id"] === "string" ? call["call_id"] : undefined,
    function: rawFunction
      ? {
          name:
            typeof (rawFunction as Record<string, unknown>)["name"] === "string"
              ? ((rawFunction as Record<string, unknown>)["name"] as string)
              : undefined,
          arguments: args,
        }
      : undefined,
  };
}

function fingerprintRows(
  db: Database.Database,
  sessionId: string,
  maxRowId: number | null,
): string | null {
  if (maxRowId === null) return null;
  const rows = db
    .prepare(
      "SELECT id, role, content, tool_call_id, tool_calls, tool_name, timestamp FROM messages WHERE session_id = ? AND id <= ? ORDER BY id",
    )
    .all(sessionId, maxRowId) as HermesRow[];
  const hash = createHash("sha256");
  for (const row of rows) {
    hash
      .update(String(row.id))
      .update("\0")
      .update(row.role)
      .update("\0")
      .update(row.content ?? "")
      .update("\0")
      .update(row.tool_call_id ?? "")
      .update("\0")
      .update(row.tool_calls ?? "")
      .update("\0")
      .update(row.tool_name ?? "")
      .update("\0")
      .update(row.timestamp === null ? "" : String(row.timestamp))
      .update("\0");
  }
  return hash.digest("hex");
}

function findPriorAssistantCall(
  db: Database.Database,
  sessionId: string,
  callId: string,
  beforeRowId: number,
): { messageId: number; call: HermesToolCall } | null {
  const candidates = db
    .prepare(
      "SELECT id, tool_calls FROM messages WHERE session_id = ? AND role = 'assistant' AND id < ? AND tool_calls LIKE '%' || ? || '%' ORDER BY id DESC",
    )
    .all(sessionId, beforeRowId, callId) as { id: number; tool_calls: string | null }[];
  for (const candidate of candidates) {
    const call = parseToolCalls(candidate.tool_calls).find((c) => (c.call_id ?? c.id) === callId);
    if (call) return { messageId: candidate.id, call };
  }
  return null;
}

/**
 * Ingest one Hermes session. The discovered ref is `<dbPath>#<sessionId>`; we open
 * the SQLite file read-only and read that session's messages ordered by the
 * autoincrement `id`, which is the resume cursor (a re-index appends only rows past
 * the last ingested id).
 *
 * Hermes is a flat timeline: an assistant row declares its tool calls in a
 * `tool_calls` JSON array, and each result arrives as a later `role='tool'` row
 * whose `tool_call_id` pairs it back. We pair them into a single tool-call record
 * carrying both the input (from the assistant row) and the result (from the tool
 * row). A tool result whose call landed before the resume watermark is still
 * recorded standalone so no result is lost. `session_meta` rows are skipped.
 *
 * Message ids are minted from each row's stable `id` (not a positional counter),
 * as the contract requires for database sources, so re-indexing the same row never
 * produces a different id.
 */
export async function ingestHermesConversation(
  file: DiscoveredFile,
  ctx: IngestContext,
): Promise<IngestResult> {
  const maxChars = ctx.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  const { dbPath, sessionId } = splitDbRef(file.path);

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const maxRow = db
      .prepare("SELECT MAX(id) AS maxRowId FROM messages WHERE session_id = ?")
      .get(sessionId) as { maxRowId: number | null };
    const maxRowId = maxRow?.maxRowId ?? null;

    const prefixFingerprint =
      ctx.priorToken?.kind === "rowid" && ctx.priorToken.fingerprint
        ? fingerprintRows(db, sessionId, ctx.priorToken.value)
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
          fingerprint: fingerprintRows(db, sessionId, maxRowId) ?? undefined,
        },
      };
    }

    const session = db.prepare("SELECT model, cwd FROM sessions WHERE id = ?").get(sessionId) as
      | { model: string | null; cwd: string | null }
      | undefined;
    const model = session?.model ?? null;
    const project = session?.cwd ?? null;

    const startRowid = plan.mode === "append" && plan.from.kind === "rowid" ? plan.from.value : 0;
    const rows = db
      .prepare(
        "SELECT id, role, content, tool_call_id, tool_calls, tool_name, timestamp FROM messages WHERE session_id = ? AND id > ? ORDER BY id",
      )
      .all(sessionId, startRowid) as HermesRow[];

    const messages: MessageRecord[] = [];
    const toolCalls: ToolCallRecord[] = [];
    const callsById = new Map<string, ToolCallRecord>();
    let skipped = 0;

    for (const row of rows) {
      if (row.role === "session_meta") {
        skipped++;
        continue;
      }

      const uuid = String(row.id);
      const messageId = computeMessageId(ctx.sourceFileId, uuid, row.id);
      const content = typeof row.content === "string" ? row.content : "";
      const declaredCalls = row.role === "assistant" ? parseToolCalls(row.tool_calls) : [];

      // A tool result row: record its content as a system message and pair the
      // result back onto the originating assistant tool call when we have it.
      if (row.role === "tool") {
        const result = cap(content, maxChars);
        const callId = typeof row.tool_call_id === "string" ? row.tool_call_id : "";
        const paired = callId ? callsById.get(callId) : undefined;
        if (paired) {
          paired.result = result.text;
          paired.isError = detectError(content);
          paired.truncated = paired.truncated || result.truncated;
        } else if (callId) {
          const prior = findPriorAssistantCall(db, sessionId, callId, row.id);
          if (prior) {
            const assistantMessageId = computeMessageId(
              ctx.sourceFileId,
              String(prior.messageId),
              prior.messageId,
            );
            const input = cap(prior.call.function?.arguments ?? "", maxChars);
            toolCalls.push({
              toolCallId: `${assistantMessageId}:${callId}`,
              sourceFileId: ctx.sourceFileId,
              sessionId: ctx.sessionId,
              messageId: assistantMessageId,
              toolUseId: callId,
              toolName:
                typeof prior.call.function?.name === "string" ? prior.call.function.name : "",
              input: input.text,
              result: result.text,
              isError: detectError(content),
              truncated: input.truncated || result.truncated,
            });
          } else {
            toolCalls.push({
              toolCallId: `${messageId}:result:${callId}`,
              sourceFileId: ctx.sourceFileId,
              sessionId: ctx.sessionId,
              messageId,
              toolUseId: callId,
              toolName: typeof row.tool_name === "string" ? row.tool_name : "",
              input: "",
              result: result.text,
              isError: detectError(content),
              truncated: result.truncated,
            });
          }
        } else {
          toolCalls.push({
            toolCallId: `${messageId}:result:${callId || row.id}`,
            sourceFileId: ctx.sourceFileId,
            sessionId: ctx.sessionId,
            messageId,
            toolUseId: callId,
            toolName: typeof row.tool_name === "string" ? row.tool_name : "",
            input: "",
            result: result.text,
            isError: detectError(content),
            truncated: result.truncated,
          });
        }
        if (result.text.trim().length === 0) {
          skipped++;
          continue;
        }
        messages.push({
          messageId,
          sourceFileId: ctx.sourceFileId,
          sessionId: ctx.sessionId,
          uuid,
          parentUuid: null,
          seq: row.id,
          role: "system",
          timestamp: toIso(row.timestamp),
          project,
          branch: null,
          model,
          agent: null,
          skill: null,
          text: result.text,
          textTruncated: result.truncated,
        });
        continue;
      }

      // user / assistant rows. Skip a row that carries neither text nor tool calls.
      if (content.trim().length === 0 && declaredCalls.length === 0) {
        skipped++;
        continue;
      }

      for (const call of declaredCalls) {
        const callId = call.call_id ?? call.id ?? "";
        const input = cap(call.function?.arguments ?? "", maxChars);
        const record: ToolCallRecord = {
          toolCallId: `${messageId}:${callId || toolCalls.length}`,
          sourceFileId: ctx.sourceFileId,
          sessionId: ctx.sessionId,
          messageId,
          toolUseId: callId,
          toolName: typeof call.function?.name === "string" ? call.function.name : "",
          input: input.text,
          result: null,
          isError: null,
          truncated: input.truncated,
        };
        toolCalls.push(record);
        if (callId) callsById.set(callId, record);
      }

      // A tool-call-only assistant turn carries no searchable text, but we still
      // emit the (empty-text) message so its tool calls have a real anchor row.
      const capped = cap(content, maxChars);
      messages.push({
        messageId,
        sourceFileId: ctx.sourceFileId,
        sessionId: ctx.sessionId,
        uuid,
        parentUuid: null,
        seq: row.id,
        role: mapRole(row.role),
        timestamp: toIso(row.timestamp),
        project,
        branch: null,
        model,
        agent: null,
        skill: null,
        text: capped.text,
        textTruncated: capped.truncated,
      });
    }

    return {
      mode: plan.mode,
      messages,
      toolCalls,
      skipped,
      resumeToken: {
        kind: "rowid",
        value: maxRowId ?? startRowid,
        fingerprint: fingerprintRows(db, sessionId, maxRowId) ?? undefined,
      },
    };
  } finally {
    db?.close();
  }
}
