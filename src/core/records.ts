import { z } from "zod";

/**
 * Normalized records that the core (store/search/MCP) operates on. Adapters are
 * responsible for turning source-specific transcript lines into these shapes and
 * Zod-validating them at the boundary, so the core never sees source quirks.
 */

export const SOURCES = ["claude-code", "codex"] as const;
export const sourceSchema = z.enum(SOURCES);
export type Source = z.infer<typeof sourceSchema>;

export const SOURCE_FILE_KINDS = ["primary", "subagent"] as const;
export const sourceFileKindSchema = z.enum(SOURCE_FILE_KINDS);
export type SourceFileKind = z.infer<typeof sourceFileKindSchema>;

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/**
 * A physical transcript file on disk. This is the unit of ingestion and the
 * thing a resume watermark is attached to. Distinct from a logical session: one
 * session can span a primary file plus several subagent files.
 */
export const sourceFileRecordSchema = z.object({
  sourceFileId: z.string().min(1),
  source: sourceSchema,
  sessionId: z.string().min(1),
  kind: sourceFileKindSchema,
  /** For subagent files, the agent file hash/name; null for primary files. */
  agentFile: z.string().nullable(),
  path: z.string().min(1),
  byteOffset: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  prefixSha256: z.string().nullable(),
  mtime: z.string().nullable(),
  indexedAt: z.string(),
});
export type SourceFileRecord = z.infer<typeof sourceFileRecordSchema>;

/** A logical session, rolled up across all of its source files. */
export const sessionRecordSchema = z.object({
  sessionId: z.string().min(1),
  source: sourceSchema,
  project: z.string().nullable(),
  branch: z.string().nullable(),
  firstTimestamp: z.string().nullable(),
  lastTimestamp: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

/**
 * One message within a file. The primary key is a synthetic
 * `messageId = hash(sourceFileId + uuid + seq)` because raw `uuid`s collide
 * across (and even within) files with different content — keying on uuid alone
 * would silently overwrite distinct messages. `uuid`/`parentUuid` are kept as
 * plain columns for thread reconstruction.
 */
export const messageRecordSchema = z.object({
  messageId: z.string().min(1),
  sourceFileId: z.string().min(1),
  sessionId: z.string().min(1),
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  /** Zero-based line index within the source file. */
  seq: z.number().int().nonnegative(),
  role: messageRoleSchema,
  timestamp: z.string().nullable(),
  project: z.string().nullable(),
  branch: z.string().nullable(),
  model: z.string().nullable(),
  /** Subagent identity (the agent file hash) for subagent messages; null on the primary thread. */
  agent: z.string().nullable(),
  /** Skill name if this message invoked a `Skill` tool_use; null otherwise. */
  skill: z.string().nullable(),
  /** Human-readable text, size-capped. `textTruncated` flags elision. */
  text: z.string(),
  textTruncated: z.boolean(),
});
export type MessageRecord = z.infer<typeof messageRecordSchema>;

/**
 * A tool invocation. `tool_use` and `tool_result` blocks are paired within file
 * scope by `toolUseId`. The result side may arrive on a later line.
 */
export const toolCallRecordSchema = z.object({
  toolCallId: z.string().min(1),
  sourceFileId: z.string().min(1),
  sessionId: z.string().min(1),
  /** The message the tool_use originated from. */
  messageId: z.string().min(1),
  toolUseId: z.string(),
  toolName: z.string(),
  input: z.string(),
  result: z.string().nullable(),
  isError: z.boolean().nullable(),
  truncated: z.boolean(),
});
export type ToolCallRecord = z.infer<typeof toolCallRecordSchema>;

/** The full output of parsing a single transcript line. */
export interface ParsedLine {
  message: MessageRecord;
  toolCalls: ToolCallRecord[];
}
