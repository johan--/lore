import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import type { Store } from "../store/open-store.js";
import { upsertMessage, upsertSession, upsertSourceFile, upsertToolCall } from "../store/upsert.js";
import { parseLine } from "../../adapters/claude-code/parse-line.js";
import type { SourceFileKind } from "../records.js";
import { logger } from "../logger.js";

export interface IndexFileOptions {
  path: string;
  kind?: SourceFileKind;
  /** For subagent files: the agent file hash/name. */
  agentFile?: string | null;
  /**
   * Authoritative logical session for this file. Discovery passes the structural
   * parent session for subagent files; for primary files it defaults to the
   * filename (`<sessionId>.jsonl`).
   */
  sessionId?: string;
  maxTextChars?: number;
}

export interface IndexFileResult {
  sourceFileId: string;
  sessionId: string;
  messages: number;
  toolCalls: number;
  skipped: number;
}

/**
 * Stream-parse one transcript file and upsert its messages, tool calls, source
 * file row, and session rollup. Streaming (line-by-line) keeps memory bounded;
 * oversized text is capped by the parser. Idempotent: re-running over the same
 * file updates rows in place.
 */
export async function indexFile(db: Store, opts: IndexFileOptions): Promise<IndexFileResult> {
  const sourceFileId = opts.path;
  const kind: SourceFileKind = opts.kind ?? "primary";
  const sessionId = opts.sessionId ?? basename(opts.path).replace(/\.jsonl$/i, "");

  const stream = createReadStream(opts.path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let seq = 0;
  let messages = 0;
  let toolCalls = 0;
  let skipped = 0;
  let project: string | null = null;
  let branch: string | null = null;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;

  // better-sqlite3 transactions are synchronous, so we stream lines async into a
  // buffer first, then apply them in one transaction.
  interface Pending {
    line: string;
    seq: number;
  }
  const pending: Pending[] = [];
  for await (const line of rl) {
    if (line.trim().length === 0) {
      seq++;
      continue;
    }
    pending.push({ line, seq });
    seq++;
  }

  const apply = db.transaction((rows: Pending[]) => {
    for (const { line, seq: lineSeq } of rows) {
      const outcome = parseLine(line, {
        sourceFileId,
        sessionId,
        seq: lineSeq,
        source: "claude-code",
        maxTextChars: opts.maxTextChars,
      });
      if (outcome.kind === "skipped") {
        skipped++;
        continue;
      }
      const { message, toolCalls: calls } = outcome.parsed;
      upsertMessage(db, message);
      messages++;
      for (const call of calls) {
        call.sessionId = sessionId;
        upsertToolCall(db, call);
        toolCalls++;
      }
      if (message.project) project = message.project;
      if (message.branch) branch = message.branch;
      if (message.timestamp) {
        if (!firstTimestamp || message.timestamp < firstTimestamp)
          firstTimestamp = message.timestamp;
        if (!lastTimestamp || message.timestamp > lastTimestamp) lastTimestamp = message.timestamp;
      }
    }
  });
  apply(pending);

  const stats = await stat(opts.path).catch(() => null);

  upsertSourceFile(db, {
    sourceFileId,
    source: "claude-code",
    sessionId,
    kind,
    agentFile: opts.agentFile ?? null,
    path: opts.path,
    byteOffset: stats ? stats.size : 0,
    lineCount: seq,
    prefixSha256: null,
    mtime: stats ? stats.mtime.toISOString() : null,
    indexedAt: new Date().toISOString(),
  });

  upsertSession(db, {
    sessionId,
    source: "claude-code",
    project,
    branch,
    firstTimestamp,
    lastTimestamp,
    messageCount: messages,
  });

  logger.debug("indexed file", { path: opts.path, messages, toolCalls, skipped });

  return { sourceFileId, sessionId, messages, toolCalls, skipped };
}
