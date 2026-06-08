import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import type { Store } from "../store/open-store.js";
import { writeRecordBatch } from "../store/write-records.js";
import type { MessageRecord, SourceFileKind, ToolCallRecord } from "../records.js";
import { logger } from "../logger.js";
import type { SourceAdapter } from "../../adapters/contract.js";
import { claudeCodeAdapter } from "../../adapters/claude-code/adapter.js";
import { planReindex, prefixHash, PREFIX_BYTES, type PriorWatermark } from "./watermark.js";

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
  /**
   * Opt-in secret redaction. Off by default (local-only store keeps everything
   * verbatim). When true, message text and tool payloads pass through the
   * credential redactor before they're stored or indexed.
   */
  redact?: boolean;
  /** Source adapter that knows how to parse this harness's lines. Defaults to Claude Code. */
  adapter?: SourceAdapter;
}

export interface IndexFileResult {
  sourceFileId: string;
  sessionId: string;
  /** What the watermark decided: nothing to do, tail-appended, or fully re-indexed. */
  mode: "skip" | "append" | "full";
  messages: number;
  toolCalls: number;
  skipped: number;
}

/** Read the persisted watermark for a file, or null if it was never indexed. */
function readWatermark(db: Store, sourceFileId: string): PriorWatermark | null {
  const row = db
    .prepare(
      "SELECT byte_offset, line_count, prefix_sha256, mtime FROM source_files WHERE source_file_id = ?",
    )
    .get(sourceFileId) as
    | {
        byte_offset: number;
        line_count: number;
        prefix_sha256: string | null;
        mtime: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    byteOffset: row.byte_offset,
    lineCount: row.line_count,
    prefixSha256: row.prefix_sha256,
    mtime: row.mtime,
  };
}

/**
 * Stream-parse one transcript file and upsert its messages, tool calls, source
 * file row, and session rollup. Streaming (line-by-line) keeps memory bounded;
 * oversized text is capped by the parser.
 *
 * Resume-safe: a watermark on the source file row lets a re-index skip an
 * unchanged file, append only its new tail, or fully re-index a rewritten file.
 */
export async function indexFile(db: Store, opts: IndexFileOptions): Promise<IndexFileResult> {
  const sourceFileId = opts.path;
  const kind: SourceFileKind = opts.kind ?? "primary";
  const sessionId = opts.sessionId ?? basename(opts.path).replace(/\.jsonl$/i, "");
  const adapter = opts.adapter ?? claudeCodeAdapter;

  const stats = await stat(opts.path).catch(() => null);
  const prior = readWatermark(db, sourceFileId);

  // To detect an in-place rewrite vs. an append, hash the head region that the
  // prior watermark already covered — appends never touch those bytes, so the
  // hash stays stable across them. (Hashing the whole small file would change on
  // every append.) The hash we persist below covers the *current* head.
  const compareBytes = prior ? Math.min(PREFIX_BYTES, prior.byteOffset) : 0;
  const compareHash = compareBytes > 0 ? await prefixHash(opts.path, compareBytes) : null;

  const plan = stats
    ? planReindex(prior, { size: stats.size, mtime: stats.mtime.toISOString() }, compareHash)
    : ({ mode: "full" } as const);

  if (plan.mode === "skip") {
    logger.debug("skipped unchanged file", { path: opts.path });
    return { sourceFileId, sessionId, mode: "skip", messages: 0, toolCalls: 0, skipped: 0 };
  }

  const startByte = plan.mode === "append" ? plan.fromByte : 0;
  const startSeq = plan.mode === "append" ? plan.fromSeq : 0;

  const stream = createReadStream(opts.path, { encoding: "utf8", start: startByte });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let seq = startSeq;
  let messages = 0;
  let toolCalls = 0;
  let skipped = 0;

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
  const fileMetadata = adapter.getFileMetadata?.(
    pending.map((row) => row.line),
    sourceFileId,
  );

  // Parse the buffered lines into normalized records. Parsing is pure (no DB
  // access), so it stays outside the write transaction; the shared writer owns
  // the transaction, delete-before-rewrite, redaction, and the session rollup.
  const messageRecords: MessageRecord[] = [];
  const toolCallRecords: ToolCallRecord[] = [];
  for (const { line, seq: lineSeq } of pending) {
    const outcome = adapter.parseLine(line, {
      sourceFileId,
      sessionId,
      seq: lineSeq,
      source: adapter.source,
      fileMetadata,
      maxTextChars: opts.maxTextChars,
    });
    if (outcome.kind === "skipped") {
      skipped++;
      continue;
    }
    const { message, toolCalls: calls } = outcome.parsed;
    messageRecords.push(message);
    messages++;
    for (const call of calls) {
      call.sessionId = sessionId;
      toolCallRecords.push(call);
      toolCalls++;
    }
  }

  // Persist a head-region hash covering the current file size, so the next
  // re-index can compare against this exact region.
  const storeBytes = stats ? Math.min(PREFIX_BYTES, stats.size) : 0;
  const storeHash = storeBytes > 0 ? await prefixHash(opts.path, storeBytes) : null;

  writeRecordBatch(
    db,
    {
      sourceFile: {
        sourceFileId,
        source: adapter.source,
        sessionId,
        kind,
        agentFile: opts.agentFile ?? null,
        path: opts.path,
        byteOffset: stats ? stats.size : 0,
        lineCount: seq,
        prefixSha256: storeHash,
        mtime: stats ? stats.mtime.toISOString() : null,
        indexedAt: new Date().toISOString(),
      },
      messages: messageRecords,
      toolCalls: toolCallRecords,
    },
    { mode: plan.mode === "full" ? "full" : "append", redact: opts.redact },
  );

  logger.debug("indexed file", { path: opts.path, mode: plan.mode, messages, toolCalls, skipped });

  return { sourceFileId, sessionId, mode: plan.mode, messages, toolCalls, skipped };
}
