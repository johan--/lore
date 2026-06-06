import { z } from "zod";
import type { Store } from "../store/open-store.js";
import { messageRecordSchema, sourceFileRecordSchema, toolCallRecordSchema } from "../records.js";
import { upsertMessage, upsertSourceFile, upsertToolCall } from "../store/upsert.js";
import { recomputeSession } from "../store/recompute-session.js";
import { logger } from "../logger.js";

/**
 * The universal live-write path. Any harness can push already-normalized records
 * straight into its own `source` namespace without writing a pull adapter — it
 * just has to produce records that satisfy the shared Zod schemas. This is the
 * counterpart to the file-based backfill: backfill reads transcripts off disk,
 * push accepts them in memory.
 */
export const pushBatchSchema = z.object({
  sourceFile: sourceFileRecordSchema,
  messages: z.array(messageRecordSchema),
  toolCalls: z.array(toolCallRecordSchema).default([]),
});
export type PushBatch = z.infer<typeof pushBatchSchema>;

export interface PushResult {
  sourceFileId: string;
  sessionId: string;
  messages: number;
  toolCalls: number;
}

/**
 * Validate a batch at the boundary and write it in one transaction. Throws a
 * ZodError on malformed input so a caller (MCP tool, library user) gets a
 * precise rejection rather than a half-written batch. Idempotent: every write is
 * a keyed upsert, so re-pushing the same batch never duplicates rows.
 */
export function pushRecords(db: Store, input: unknown): PushResult {
  const batch = pushBatchSchema.parse(input);

  const apply = db.transaction((b: PushBatch) => {
    upsertSourceFile(db, b.sourceFile);
    for (const message of b.messages) upsertMessage(db, message);
    for (const call of b.toolCalls) upsertToolCall(db, call);
    recomputeSession(db, b.sourceFile.sessionId);
  });
  apply(batch);

  logger.debug("pushed records", {
    sourceFileId: batch.sourceFile.sourceFileId,
    source: batch.sourceFile.source,
    messages: batch.messages.length,
    toolCalls: batch.toolCalls.length,
  });

  return {
    sourceFileId: batch.sourceFile.sourceFileId,
    sessionId: batch.sourceFile.sessionId,
    messages: batch.messages.length,
    toolCalls: batch.toolCalls.length,
  };
}
