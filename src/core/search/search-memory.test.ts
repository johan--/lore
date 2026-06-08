import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage, upsertToolCall, upsertSourceFile } from "../store/upsert.js";
import { searchMemory } from "./search-memory.js";
import { MAX_RESULTS } from "../limits.js";
import type { MessageRecord, ToolCallRecord, SourceFileRecord } from "../records.js";

function msg(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "text">,
): MessageRecord {
  return {
    sourceFileId: "sf-1",
    sessionId: "sess-1",
    uuid: over.messageId,
    parentUuid: null,
    seq: 0,
    role: "user",
    timestamp: "2026-05-10T00:00:00.000Z",
    project: "/repo",
    branch: "main",
    model: "claude-opus-4-8",
    agent: null,
    skill: null,
    textTruncated: false,
    ...over,
  };
}

function freshStore(): Store {
  return openStore(":memory:");
}

describe("searchMemory", () => {
  it("returns a hit with full provenance for a known keyword", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", text: "remember the alamo battle" }));
    upsertMessage(db, msg({ messageId: "m2", text: "unrelated content here" }));

    const hits = searchMemory(db, "alamo");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit?.messageId).toBe("m1");
    expect(hit?.sessionId).toBe("sess-1");
    expect(hit?.timestamp).toBe("2026-05-10T00:00:00.000Z");
    expect(hit?.project).toBe("/repo");
    expect(hit?.branch).toBe("main");
    expect(hit?.model).toBe("claude-opus-4-8");
  });

  it("is idempotent — re-upserting the same message_id does not duplicate", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", text: "alamo one" }));
    upsertMessage(db, msg({ messageId: "m1", text: "alamo two" }));

    const hits = searchMemory(db, "alamo");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.text).toBe("alamo two");
  });

  it("preserves distinct rows when uuid collides but message_id differs", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({ messageId: "m-a", uuid: "dup", seq: 1, text: "collision payload one" }),
    );
    upsertMessage(
      db,
      msg({ messageId: "m-b", uuid: "dup", seq: 2, text: "collision payload two" }),
    );

    const hits = searchMemory(db, "collision");
    expect(hits).toHaveLength(2);
  });

  it("retrieves code identifiers and file paths under the code-aware tokenizer", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", text: "edited src/core/foo.bar.ts via getUserById" }));

    expect(searchMemory(db, "foo.bar.ts").map((h) => h.messageId)).toEqual(["m1"]);
    expect(searchMemory(db, "getUserById").map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("does not throw on FTS operator characters in the query", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", text: "the tool-use path and a colon thing" }));

    expect(() => searchMemory(db, "tool-use")).not.toThrow();
    expect(() => searchMemory(db, 'a "quote: and -minus +plus')).not.toThrow();
    expect(searchMemory(db, "tool-use").map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("respects the limit", () => {
    const db = freshStore();
    for (let i = 0; i < 5; i++) {
      upsertMessage(
        db,
        msg({ messageId: `m${i}`, uuid: `u${i}`, seq: i, text: `alamo number ${i}` }),
      );
    }
    expect(searchMemory(db, "alamo", { limit: 3 })).toHaveLength(3);
  });

  it("hard-caps an oversized limit at MAX_RESULTS so no caller can dump", () => {
    const db = freshStore();
    for (let i = 0; i < MAX_RESULTS + 10; i++) {
      upsertMessage(
        db,
        msg({ messageId: `m${i}`, uuid: `u${i}`, seq: i, text: `alamo number ${i}` }),
      );
    }
    expect(searchMemory(db, "alamo", { limit: 100_000 })).toHaveLength(MAX_RESULTS);
  });
});

describe("searchMemory — dimension filters", () => {
  function toolCall(
    over: Partial<ToolCallRecord> & Pick<ToolCallRecord, "toolCallId" | "messageId" | "toolName">,
  ): ToolCallRecord {
    return {
      sourceFileId: "sf-1",
      sessionId: "sess-1",
      toolUseId: "tu-1",
      input: "{}",
      result: null,
      isError: null,
      truncated: false,
      ...over,
    };
  }

  function sourceFile(
    over: Partial<SourceFileRecord> &
      Pick<SourceFileRecord, "sourceFileId" | "sessionId" | "source">,
  ): SourceFileRecord {
    return {
      kind: "primary",
      agentFile: null,
      path: `/transcripts/${over.sourceFileId}.jsonl`,
      byteOffset: 0,
      lineCount: 0,
      prefixSha256: null,
      mtime: null,
      indexedAt: "2026-05-10T00:00:00.000Z",
      ...over,
    };
  }

  it("narrows by source namespace via the file join", () => {
    const db = freshStore();
    upsertSourceFile(
      db,
      sourceFile({ sourceFileId: "sf-1", sessionId: "sess-1", source: "claude-code" }),
    );
    upsertSourceFile(
      db,
      sourceFile({ sourceFileId: "sf-2", sessionId: "sess-2", source: "codex" }),
    );
    upsertMessage(db, msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo here" }));
    upsertMessage(
      db,
      msg({
        messageId: "m2",
        uuid: "u2",
        seq: 0,
        text: "alamo there",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
      }),
    );
    expect(searchMemory(db, "alamo", { source: "codex" }).map((h) => h.messageId)).toEqual(["m2"]);
  });

  it("narrows by project", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", project: "/a" }));
    upsertMessage(db, msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo b", project: "/b" }));
    expect(searchMemory(db, "alamo", { project: "/a" }).map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("narrows by session", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", sessionId: "sess-1" }),
    );
    upsertMessage(
      db,
      msg({
        messageId: "m2",
        uuid: "u2",
        seq: 0,
        text: "alamo b",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
      }),
    );
    expect(searchMemory(db, "alamo", { session: "sess-2" }).map((h) => h.messageId)).toEqual([
      "m2",
    ]);
    expect(
      searchMemory(db, "alamo")
        .map((h) => h.messageId)
        .sort(),
    ).toEqual(["m1", "m2"]);
  });

  it("narrows by branch", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", branch: "main" }),
    );
    upsertMessage(db, msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo b", branch: "dev" }));
    expect(searchMemory(db, "alamo", { branch: "dev" }).map((h) => h.messageId)).toEqual(["m2"]);
  });

  it("narrows by agent", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", agent: "ag1" }));
    upsertMessage(db, msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo b", agent: null }));
    expect(searchMemory(db, "alamo", { agent: "ag1" }).map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("narrows by skill", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", skill: "to-prd" }),
    );
    upsertMessage(db, msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo b", skill: null }));
    expect(searchMemory(db, "alamo", { skill: "to-prd" }).map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("narrows by role", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", role: "user" }));
    upsertMessage(
      db,
      msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo b", role: "assistant" }),
    );
    expect(searchMemory(db, "alamo", { role: "assistant" }).map((h) => h.messageId)).toEqual([
      "m2",
    ]);
  });

  it("narrows by model", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", model: "claude-opus-4-8" }),
    );
    upsertMessage(
      db,
      msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo b", model: "claude-haiku-4-5" }),
    );
    expect(
      searchMemory(db, "alamo", { model: "claude-haiku-4-5" }).map((h) => h.messageId),
    ).toEqual(["m2"]);
  });

  it("narrows by since/until on timestamp", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({
        messageId: "m1",
        uuid: "u1",
        seq: 0,
        text: "alamo a",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    );
    upsertMessage(
      db,
      msg({
        messageId: "m2",
        uuid: "u2",
        seq: 1,
        text: "alamo b",
        timestamp: "2026-06-01T00:00:00.000Z",
      }),
    );
    expect(
      searchMemory(db, "alamo", { since: "2026-03-01T00:00:00.000Z" }).map((h) => h.messageId),
    ).toEqual(["m2"]);
    expect(
      searchMemory(db, "alamo", { until: "2026-03-01T00:00:00.000Z" }).map((h) => h.messageId),
    ).toEqual(["m1"]);
  });

  it("narrows by tool via the tool_calls join", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo bash run" }));
    upsertMessage(db, msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo read run" }));
    upsertToolCall(db, toolCall({ toolCallId: "tc1", messageId: "m1", toolName: "Bash" }));
    upsertToolCall(db, toolCall({ toolCallId: "tc2", messageId: "m2", toolName: "Read" }));
    expect(searchMemory(db, "alamo", { tool: "Bash" }).map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("combines filters (AND semantics)", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo a", project: "/a", role: "user" }),
    );
    upsertMessage(
      db,
      msg({
        messageId: "m2",
        uuid: "u2",
        seq: 1,
        text: "alamo b",
        project: "/a",
        role: "assistant",
      }),
    );
    expect(
      searchMemory(db, "alamo", { project: "/a", role: "assistant" }).map((h) => h.messageId),
    ).toEqual(["m2"]);
  });
});
