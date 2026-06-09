import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "./open-store.js";
import { writeRecordBatch } from "./write-records.js";
import { searchMemory } from "../search/search-memory.js";
import { listSessions } from "../retrieval/list-sessions.js";
import type { MessageRecord, SourceFileRecord, ToolCallRecord } from "../records.js";

let db: Store;

beforeEach(() => {
  db = openStore(":memory:");
});

function sourceFile(over: Partial<SourceFileRecord> = {}): SourceFileRecord {
  return {
    sourceFileId: "file-1",
    source: "codex",
    sessionId: "sess-1",
    kind: "primary",
    agentFile: null,
    path: "/rollouts/file-1.jsonl",
    byteOffset: 0,
    lineCount: 0,
    prefixSha256: null,
    mtime: null,
    indexedAt: "2026-05-10T00:00:00.000Z",
    ...over,
  };
}

function message(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "text">,
): MessageRecord {
  return {
    sourceFileId: "file-1",
    sessionId: "sess-1",
    uuid: over.messageId,
    parentUuid: null,
    seq: 0,
    role: "user",
    timestamp: "2026-05-10T00:00:00.000Z",
    project: "/work",
    branch: "main",
    model: null,
    agent: null,
    skill: null,
    textTruncated: false,
    ...over,
  };
}

function toolCall(
  over: Partial<ToolCallRecord> & Pick<ToolCallRecord, "toolCallId" | "messageId" | "toolName">,
): ToolCallRecord {
  return {
    sourceFileId: "file-1",
    sessionId: "sess-1",
    toolUseId: "tu-1",
    input: "{}",
    result: null,
    isError: null,
    truncated: false,
    ...over,
  };
}

describe("writeRecordBatch", () => {
  it("writes a batch so messages are searchable and the session is rolled up", () => {
    const result = writeRecordBatch(db, {
      sourceFile: sourceFile(),
      messages: [
        message({ messageId: "m1", uuid: "u1", seq: 0, text: "first turn" }),
        message({ messageId: "m2", uuid: "u2", seq: 1, text: "second turn" }),
      ],
      toolCalls: [toolCall({ toolCallId: "tc1", messageId: "m2", toolName: "Bash" })],
    });

    expect(result).toEqual({ messages: 2, toolCalls: 1 });
    expect(searchMemory(db, "turn")).toHaveLength(2);
    const sessions = listSessions(db, { source: "codex" });
    expect(sessions[0]?.messageCount).toBe(2);
  });

  it("append mode keeps prior rows; full mode clears them before rewriting", () => {
    writeRecordBatch(db, {
      sourceFile: sourceFile(),
      messages: [message({ messageId: "m1", uuid: "u1", seq: 0, text: "original alpha" })],
      toolCalls: [],
    });

    // Append a second message for the same file: both should survive.
    writeRecordBatch(
      db,
      {
        sourceFile: sourceFile(),
        messages: [message({ messageId: "m2", uuid: "u2", seq: 1, text: "appended beta" })],
        toolCalls: [],
      },
      { mode: "append" },
    );
    expect(searchMemory(db, "alpha")).toHaveLength(1);
    expect(searchMemory(db, "beta")).toHaveLength(1);

    // Full re-index of the same file: only the new content should remain.
    writeRecordBatch(
      db,
      {
        sourceFile: sourceFile(),
        messages: [message({ messageId: "m3", uuid: "u3", seq: 0, text: "rewritten gamma" })],
        toolCalls: [],
      },
      { mode: "full" },
    );
    expect(searchMemory(db, "alpha")).toHaveLength(0);
    expect(searchMemory(db, "beta")).toHaveLength(0);
    expect(searchMemory(db, "gamma")).toHaveLength(1);
  });

  it("is idempotent: re-writing the same batch never duplicates rows", () => {
    const batch = {
      sourceFile: sourceFile(),
      messages: [message({ messageId: "m1", uuid: "u1", seq: 0, text: "stable turn" })],
      toolCalls: [toolCall({ toolCallId: "tc1", messageId: "m1", toolName: "Read" })],
    };
    writeRecordBatch(db, batch);
    writeRecordBatch(db, batch);

    expect(searchMemory(db, "stable")).toHaveLength(1);
    expect(listSessions(db, {})).toHaveLength(1);
  });

  it("rejects rows that do not belong to the batch source file/session", () => {
    expect(() =>
      writeRecordBatch(db, {
        sourceFile: sourceFile(),
        messages: [
          message({
            messageId: "m1",
            sourceFileId: "other-file",
            text: "should not land",
          }),
        ],
        toolCalls: [],
      }),
    ).toThrow(/does not match batch source\/session/);

    expect(searchMemory(db, "land")).toHaveLength(0);
  });

  it("recomputes the old session if a source file moves sessions", () => {
    writeRecordBatch(db, {
      sourceFile: sourceFile({ sourceFileId: "moving-file", sessionId: "sess-a" }),
      messages: [
        message({
          sourceFileId: "moving-file",
          sessionId: "sess-a",
          messageId: "m1",
          text: "alpha session",
        }),
      ],
      toolCalls: [],
    });

    writeRecordBatch(
      db,
      {
        sourceFile: sourceFile({ sourceFileId: "moving-file", sessionId: "sess-b" }),
        messages: [
          message({
            sourceFileId: "moving-file",
            sessionId: "sess-b",
            messageId: "m2",
            text: "beta session",
          }),
        ],
        toolCalls: [],
      },
      { mode: "full" },
    );

    const oldSession = db
      .prepare("SELECT message_count FROM sessions WHERE session_id = ?")
      .get("sess-a") as { message_count: number };
    const newSession = db
      .prepare("SELECT message_count FROM sessions WHERE session_id = ?")
      .get("sess-b") as { message_count: number };
    expect(oldSession.message_count).toBe(0);
    expect(newSession.message_count).toBe(1);
  });

  it("redacts credentials in message text and tool payloads by default", () => {
    // No redact option — default should redact.
    writeRecordBatch(db, {
      sourceFile: sourceFile(),
      messages: [message({ messageId: "m1", text: "key is sk-abcdef0123456789ABCDEFG here" })],
      toolCalls: [
        toolCall({
          toolCallId: "tc1",
          messageId: "m1",
          toolName: "Bash",
          input: "export TOK=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
          result: "ok",
        }),
      ],
    });

    const hit = searchMemory(db, "key")[0];
    expect(hit?.text).toContain("[REDACTED]");
    expect(hit?.text).not.toContain("sk-abcdef");
    const call = db.prepare("SELECT input FROM tool_calls WHERE tool_call_id = ?").get("tc1") as {
      input: string;
    };
    expect(call.input).toContain("[REDACTED]");
    expect(call.input).not.toContain("ghp_");
  });

  it("redacts credentials in message text and tool payloads when redact: true is explicit", () => {
    writeRecordBatch(
      db,
      {
        sourceFile: sourceFile(),
        messages: [message({ messageId: "m1", text: "key is sk-abcdef0123456789ABCDEFG here" })],
        toolCalls: [
          toolCall({
            toolCallId: "tc1",
            messageId: "m1",
            toolName: "Bash",
            input: "export TOK=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            result: "ok",
          }),
        ],
      },
      { redact: true },
    );

    const hit = searchMemory(db, "key")[0];
    expect(hit?.text).toContain("[REDACTED]");
    expect(hit?.text).not.toContain("sk-abcdef");
    const call = db.prepare("SELECT input FROM tool_calls WHERE tool_call_id = ?").get("tc1") as {
      input: string;
    };
    expect(call.input).toContain("[REDACTED]");
    expect(call.input).not.toContain("ghp_");
  });

  it("keeps credentials verbatim when redact: false opts out", () => {
    const secret = "sk-abcdef0123456789ABCDEFG";
    writeRecordBatch(
      db,
      {
        sourceFile: sourceFile(),
        messages: [message({ messageId: "m1", text: `key is ${secret} here` })],
        toolCalls: [],
      },
      { redact: false },
    );

    const hit = searchMemory(db, "key")[0];
    expect(hit?.text).toContain(secret);
    expect(hit?.text).not.toContain("[REDACTED]");
  });

  it("does not mutate the caller's records when redacting", () => {
    const msg = message({ messageId: "m1", text: "token sk-abcdef0123456789ABCDEFG end" });
    // Default redact-on path.
    writeRecordBatch(db, { sourceFile: sourceFile(), messages: [msg], toolCalls: [] });
    expect(msg.text).toBe("token sk-abcdef0123456789ABCDEFG end");
  });
});
