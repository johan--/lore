import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { pushRecords } from "./push.js";
import { searchMemory } from "../search/search-memory.js";
import { listSessions } from "../retrieval/list-sessions.js";
import type { MessageRecord, SourceFileRecord, ToolCallRecord } from "../records.js";

let db: Store;

beforeEach(() => {
  db = openStore(":memory:");
});

function sourceFile(over: Partial<SourceFileRecord> = {}): SourceFileRecord {
  return {
    sourceFileId: "codex-file-1",
    source: "codex",
    sessionId: "codex-sess-1",
    kind: "primary",
    agentFile: null,
    path: "/rollouts/codex-file-1.jsonl",
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
    sourceFileId: "codex-file-1",
    sessionId: "codex-sess-1",
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
    sourceFileId: "codex-file-1",
    sessionId: "codex-sess-1",
    toolUseId: "tu-1",
    input: "{}",
    result: null,
    isError: null,
    truncated: false,
    ...over,
  };
}

describe("pushRecords", () => {
  it("ingests a normalized batch so messages are searchable with their source provenance", () => {
    const result = pushRecords(db, {
      sourceFile: sourceFile(),
      messages: [message({ messageId: "m1", text: "shipped the codex bridge" })],
    });

    expect(result.messages).toBe(1);
    expect(result.sessionId).toBe("codex-sess-1");

    const hits = searchMemory(db, "bridge", { source: "codex" });
    expect(hits.map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("accepts an unknown harness namespace for the zero-setup push path", () => {
    const result = pushRecords(db, {
      sourceFile: sourceFile({ source: "homegrown-cli", sourceFileId: "homegrown-file" }),
      messages: [
        message({
          sourceFileId: "homegrown-file",
          messageId: "m1",
          text: "custom harness bridge",
        }),
      ],
    });

    expect(result.messages).toBe(1);
    expect(searchMemory(db, "bridge", { source: "homegrown-cli" }).map((h) => h.messageId)).toEqual(
      ["m1"],
    );
  });

  it("rejects a malformed batch at the boundary without writing anything", () => {
    expect(() =>
      pushRecords(db, {
        sourceFile: sourceFile({ source: "" }),
        messages: [message({ messageId: "m1", text: "should not land" })],
      }),
    ).toThrow();

    expect(searchMemory(db, "land")).toHaveLength(0);
  });

  it("rolls the session up from the messages table and stays idempotent on re-push", () => {
    const batch = {
      sourceFile: sourceFile(),
      messages: [
        message({ messageId: "m1", uuid: "u1", seq: 0, text: "first turn" }),
        message({ messageId: "m2", uuid: "u2", seq: 1, text: "second turn" }),
      ],
      toolCalls: [toolCall({ toolCallId: "tc1", messageId: "m2", toolName: "Bash" })],
    };

    pushRecords(db, batch);
    pushRecords(db, batch); // re-push: must not duplicate

    const sessions = listSessions(db, { source: "codex" });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe("codex-sess-1");
    expect(sessions[0]?.messageCount).toBe(2);

    expect(searchMemory(db, "turn")).toHaveLength(2);
    expect(searchMemory(db, "turn", { tool: "Bash" }).map((h) => h.messageId)).toEqual(["m2"]);
  });
});
