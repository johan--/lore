import type { Store } from "./open-store.js";
import type { MessageRecord, SourceFileRecord, ToolCallRecord } from "../records.js";
import { deleteFileRows, upsertMessage, upsertSourceFile, upsertToolCall } from "./upsert.js";
import { recomputeSession } from "./recompute-session.js";
import { redactSecrets } from "../redact.js";

/**
 * The one place a normalized batch becomes rows. Both ingestion paths funnel
 * through here: the file backfill (`indexFile`) after it parses a transcript into
 * records, and the live `push` path after it validates an in-memory batch. Having
 * a single writer means delete-before-rewrite, redaction, the upsert order, and
 * the session rollup can never drift between the two callers.
 */

export interface RecordBatch {
  sourceFile: SourceFileRecord;
  messages: MessageRecord[];
  toolCalls: ToolCallRecord[];
}

export interface WriteOptions {
  /**
   * "full" clears the file's existing rows before writing, so a rewritten or
   * rotated file never leaves orphans behind. "append" leaves prior rows in
   * place (tail-append, or a live push that adds to an open session). Default
   * "append".
   */
  mode?: "full" | "append";
  /**
   * Credential redaction over message text and tool payloads. On by default —
   * obvious live credentials (sk-, gh tokens, AWS keys, etc.) are scrubbed at
   * index time. Pass `redact: false` to store everything verbatim.
   */
  redact?: boolean;
}

export interface WriteResult {
  messages: number;
  toolCalls: number;
}

/** Apply the credential redactor to a message, returning a new record (never mutates input). */
function redactMessage(message: MessageRecord): MessageRecord {
  return { ...message, text: redactSecrets(message.text).text };
}

/** Apply the credential redactor to a tool call, returning a new record (never mutates input). */
function redactToolCall(call: ToolCallRecord): ToolCallRecord {
  return {
    ...call,
    input: redactSecrets(call.input).text,
    result: call.result === null ? null : redactSecrets(call.result).text,
  };
}

function assertBatchMembership(
  batch: RecordBatch,
  messages: MessageRecord[],
  toolCalls: ToolCallRecord[],
): void {
  const { sourceFileId, sessionId } = batch.sourceFile;
  for (const message of messages) {
    if (message.sourceFileId !== sourceFileId || message.sessionId !== sessionId) {
      throw new Error(`Message ${message.messageId} does not match batch source/session`);
    }
  }
  for (const call of toolCalls) {
    if (call.sourceFileId !== sourceFileId || call.sessionId !== sessionId) {
      throw new Error(`Tool call ${call.toolCallId} does not match batch source/session`);
    }
  }
}

/**
 * Write a normalized batch in one transaction: optional delete-before-rewrite,
 * the source-file row, every message and tool call (idempotent upserts), then a
 * session rollup recomputed from the canonical messages table. Returns how many
 * rows were written.
 */
export function writeRecordBatch(
  db: Store,
  batch: RecordBatch,
  opts: WriteOptions = {},
): WriteResult {
  const mode = opts.mode ?? "append";
  const shouldRedact = opts.redact ?? true;
  const messages = shouldRedact ? batch.messages.map(redactMessage) : batch.messages;
  const toolCalls = shouldRedact ? batch.toolCalls.map(redactToolCall) : batch.toolCalls;
  assertBatchMembership(batch, messages, toolCalls);

  const apply = db.transaction(() => {
    const previous = db
      .prepare("SELECT session_id AS sessionId FROM source_files WHERE source_file_id = ?")
      .get(batch.sourceFile.sourceFileId) as { sessionId: string } | undefined;

    if (mode === "full") deleteFileRows(db, batch.sourceFile.sourceFileId);
    upsertSourceFile(db, batch.sourceFile);
    for (const message of messages) upsertMessage(db, message);
    for (const call of toolCalls) upsertToolCall(db, call);
    recomputeSession(db, batch.sourceFile.sessionId);
    if (previous?.sessionId && previous.sessionId !== batch.sourceFile.sessionId) {
      recomputeSession(db, previous.sessionId);
    }
  });
  apply();

  return { messages: messages.length, toolCalls: toolCalls.length };
}
