import {
  computeMessageId,
  type MessageRecord,
  type MessageRole,
  type ToolCallRecord,
} from "../../core/records.js";
import type { FileMetadata, ParseContext, ParseOutcome } from "../contract.js";

const DEFAULT_MAX_TEXT_CHARS = 100_000;

interface OpenclawContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  /** toolCall block fields */
  id?: string;
  name?: string;
  arguments?: unknown;
}

interface OpenclawMessage {
  role?: string;
  content?: OpenclawContentBlock[] | string | null;
  /** toolResult message fields */
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

interface OpenclawLine {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: OpenclawMessage;
  /** session line */
  cwd?: string;
  /** model_change line */
  modelId?: string;
}

function cap(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}

/**
 * openclaw message roles are `user`, `assistant`, and `toolResult`. The first two
 * map straight through; `toolResult` arrives as its own line (like Codex's
 * function_call_output) and is recorded as a `system` message carrying the
 * result text, with the structured tool call attached.
 */
function mapRole(role: string | undefined): MessageRole {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "system";
}

/** Join `text` and `thinking` blocks into searchable text. */
function extractText(content: OpenclawContentBlock[] | string | null | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    else if (block.type === "thinking" && typeof block.thinking === "string")
      parts.push(block.thinking);
  }
  return parts.join("\n");
}

function parseJsonLine(rawLine: string): OpenclawLine | null {
  try {
    return JSON.parse(rawLine) as OpenclawLine;
  } catch {
    return null;
  }
}

/**
 * File-level metadata: openclaw records the working directory on the `session`
 * line and the model on a `model_change` line, so a single pass over the file's
 * lines surfaces project + model for every message.
 */
export function getOpenclawFileMetadata(rawLines: string[]): FileMetadata {
  let project: string | null = null;
  let model: string | null = null;
  for (const line of rawLines) {
    const parsed = parseJsonLine(line);
    if (!parsed) continue;
    if (parsed.type === "session" && typeof parsed.cwd === "string") project = parsed.cwd;
    else if (parsed.type === "model_change" && typeof parsed.modelId === "string")
      model = parsed.modelId;
  }
  return { project, branch: null, model, agent: null };
}

/** Tool calls embedded as `toolCall` blocks in an assistant message's content. */
function extractToolCalls(
  content: OpenclawContentBlock[] | string | null | undefined,
  ctx: ParseContext,
  messageId: string,
  maxChars: number,
): ToolCallRecord[] {
  if (!Array.isArray(content)) return [];
  const calls: ToolCallRecord[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object" || block.type !== "toolCall") continue;
    const input = cap(JSON.stringify(block.arguments ?? null), maxChars);
    calls.push({
      toolCallId: `${messageId}:${block.id ?? calls.length}`,
      sourceFileId: ctx.sourceFileId,
      sessionId: ctx.sessionId,
      messageId,
      toolUseId: typeof block.id === "string" ? block.id : "",
      toolName: typeof block.name === "string" ? block.name : "",
      input: input.text,
      result: null,
      isError: null,
      truncated: input.truncated,
    });
  }
  return calls;
}

/**
 * Parse one openclaw transcript line into a normalized message (+ tool calls).
 * Only `message` lines yield records; `session`, `model_change`,
 * `thinking_level_change`, and `custom` lines are meta and skipped (their useful
 * fields are surfaced via `getOpenclawFileMetadata`). openclaw is a hybrid of the
 * Claude and Codex shapes: tool *calls* are embedded as `toolCall` content blocks
 * on assistant messages, while tool *results* arrive as standalone `toolResult`
 * message lines paired back by `toolCallId`.
 */
export function parseOpenclawLine(rawLine: string, ctx: ParseContext): ParseOutcome {
  const maxChars = ctx.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;

  const parsed = parseJsonLine(rawLine);
  if (!parsed) return { kind: "skipped", reason: "json-parse-error" };
  if (parsed.type !== "message") {
    return { kind: "skipped", reason: `unhandled-type:${String(parsed.type)}` };
  }

  const msg = parsed.message ?? {};
  const uuid = typeof parsed.id === "string" ? parsed.id : "";
  const parentUuid = typeof parsed.parentId === "string" ? parsed.parentId : null;
  const timestamp = typeof parsed.timestamp === "string" ? parsed.timestamp : null;
  const messageId = computeMessageId(ctx.sourceFileId, uuid, ctx.seq);

  const base = {
    messageId,
    sourceFileId: ctx.sourceFileId,
    sessionId: ctx.sessionId,
    uuid,
    parentUuid,
    seq: ctx.seq,
    timestamp,
    project: ctx.fileMetadata?.project ?? null,
    branch: ctx.fileMetadata?.branch ?? null,
    model: ctx.fileMetadata?.model ?? null,
    agent: ctx.fileMetadata?.agent ?? null,
    skill: null,
  };

  // A toolResult line: record the result text as a system message and attach the
  // paired tool call carrying the structured result.
  if (msg.role === "toolResult") {
    const result = cap(extractText(msg.content), maxChars);
    const callId = typeof msg.toolCallId === "string" ? msg.toolCallId : "";
    const message: MessageRecord = {
      ...base,
      role: "system",
      text: result.text,
      textTruncated: result.truncated,
    };
    const toolCall: ToolCallRecord = {
      toolCallId: `${messageId}:result:${callId || ctx.seq}`,
      sourceFileId: ctx.sourceFileId,
      sessionId: ctx.sessionId,
      messageId,
      toolUseId: callId,
      toolName: typeof msg.toolName === "string" ? msg.toolName : "",
      input: "",
      result: result.text,
      isError: typeof msg.isError === "boolean" ? msg.isError : null,
      truncated: result.truncated,
    };
    return { kind: "parsed", parsed: { message, toolCalls: [toolCall] } };
  }

  const capped = cap(extractText(msg.content), maxChars);
  const message: MessageRecord = {
    ...base,
    role: mapRole(msg.role),
    text: capped.text,
    textTruncated: capped.truncated,
  };
  const toolCalls = extractToolCalls(msg.content, ctx, messageId, maxChars);
  return { kind: "parsed", parsed: { message, toolCalls } };
}
