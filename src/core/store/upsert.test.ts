import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "./open-store.js";
import {
  upsertSourceFile,
  upsertMessage,
  upsertToolCall,
  upsertSession,
  deleteFileRows,
  deleteSessionRows,
  deleteProjectRows,
} from "./upsert.js";
import { searchMemory } from "../search/search-memory.js";
import type { MessageRecord, SourceFileRecord, ToolCallRecord } from "../records.js";

let db: Store;

beforeEach(() => {
  db = openStore(":memory:");
});

function sourceFile(over: Partial<SourceFileRecord> = {}): SourceFileRecord {
  return {
    sourceFileId: "file-1",
    source: "claude-code",
    sessionId: "sess-1",
    kind: "primary",
    agentFile: null,
    path: "/project/file.jsonl",
    byteOffset: 0,
    lineCount: 0,
    prefixSha256: null,
    mtime: null,
    indexedAt: "2026-06-08T00:00:00.000Z",
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
    timestamp: "2026-06-08T00:00:00.000Z",
    project: "/project",
    branch: "main",
    model: null,
    agent: null,
    skill: null,
    textTruncated: false,
    ...over,
  };
}

function seedSession(
  sessionId: string,
  sourceFileId: string,
  project: string,
  msgs: { id: string; text: string }[],
): void {
  upsertSourceFile(db, sourceFile({ sourceFileId, sessionId }));
  upsertSession(db, {
    sessionId,
    source: "claude-code",
    project,
    branch: "main",
    firstTimestamp: "2026-06-08T00:00:00.000Z",
    lastTimestamp: "2026-06-08T00:00:00.000Z",
    messageCount: msgs.length,
  });
  msgs.forEach(({ id, text }, seq) => {
    upsertMessage(
      db,
      message({ messageId: id, uuid: id, seq, text, sourceFileId, sessionId, project }),
    );
    upsertToolCall(db, {
      toolCallId: `tc-${id}`,
      sourceFileId,
      sessionId,
      messageId: id,
      toolUseId: `tu-${id}`,
      toolName: "Bash",
      input: "{}",
      result: null,
      isError: null,
      truncated: false,
    });
  });
}

// ─── deleteSessionRows ────────────────────────────────────────────────────────

describe("deleteSessionRows", () => {
  it("removes all messages and tool_calls for the targeted session", () => {
    seedSession("sess-1", "file-1", "/proj-a", [
      { id: "m1", text: "hello session one" },
      { id: "m2", text: "goodbye session one" },
    ]);

    deleteSessionRows(db, "sess-1");

    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = 'sess-1'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE session_id = 'sess-1'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });

  it("leaves other sessions intact", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "session one content" }]);
    seedSession("sess-2", "file-2", "/proj-a", [{ id: "m2", text: "session two content" }]);

    deleteSessionRows(db, "sess-1");

    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = 'sess-2'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });

  it("keeps FTS index in sync: deleted content no longer searchable", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "unique xylophone keyword" }]);

    expect(searchMemory(db, "xylophone")).toHaveLength(1);
    deleteSessionRows(db, "sess-1");
    expect(searchMemory(db, "xylophone")).toHaveLength(0);
  });

  it("recomputes sessions rollup so message_count reflects deletion", () => {
    seedSession("sess-1", "file-1", "/proj-a", [
      { id: "m1", text: "alpha" },
      { id: "m2", text: "beta" },
    ]);

    deleteSessionRows(db, "sess-1");

    const sess = db
      .prepare("SELECT message_count FROM sessions WHERE session_id = 'sess-1'")
      .get() as { message_count: number } | undefined;
    // After full deletion, message_count should be 0
    expect(sess?.message_count ?? 0).toBe(0);
  });

  it("does not throw when the session does not exist", () => {
    expect(() => deleteSessionRows(db, "nonexistent-session")).not.toThrow();
  });
});

// ─── deleteProjectRows ────────────────────────────────────────────────────────

describe("deleteProjectRows", () => {
  it("removes all messages whose project matches exactly", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "project alpha content" }]);

    deleteProjectRows(db, "/proj-a");

    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE project = '/proj-a'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });

  it("leaves messages from other projects intact", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "project alpha msg" }]);
    seedSession("sess-2", "file-2", "/proj-b", [{ id: "m2", text: "project beta msg" }]);

    deleteProjectRows(db, "/proj-a");

    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE project = '/proj-b'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });

  it("is an exact-string match — does not delete subpaths", () => {
    seedSession("sess-1", "file-1", "/proj", [{ id: "m1", text: "root project msg" }]);
    seedSession("sess-2", "file-2", "/proj/sub", [{ id: "m2", text: "subproject msg" }]);

    deleteProjectRows(db, "/proj");

    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE project = '/proj/sub'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });

  it("keeps FTS index in sync: deleted content no longer searchable", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "unique kazoo keyword" }]);

    expect(searchMemory(db, "kazoo")).toHaveLength(1);
    deleteProjectRows(db, "/proj-a");
    expect(searchMemory(db, "kazoo")).toHaveLength(0);
  });

  it("recomputes all affected sessions rollups after deletion", () => {
    seedSession("sess-1", "file-1", "/proj-a", [
      { id: "m1", text: "msg one" },
      { id: "m2", text: "msg two" },
    ]);

    deleteProjectRows(db, "/proj-a");

    const sess = db
      .prepare("SELECT message_count FROM sessions WHERE session_id = 'sess-1'")
      .get() as { message_count: number } | undefined;
    expect(sess?.message_count ?? 0).toBe(0);
  });

  it("does not throw when no rows match the project", () => {
    expect(() => deleteProjectRows(db, "/no/such/project")).not.toThrow();
  });

  it("removes tool_calls for deleted messages", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "something" }]);

    deleteProjectRows(db, "/proj-a");

    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE session_id = 'sess-1'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });

  it("spares tool_calls of a sibling project's messages in the same session", () => {
    // A single session whose messages span two projects (a mid-session cwd
    // change). Deleting one project must not wipe the other project's tool calls
    // just because they share a session_id — deletion is by owning message.
    upsertSourceFile(db, sourceFile({ sourceFileId: "file-x", sessionId: "sess-x" }));
    upsertSession(db, {
      sessionId: "sess-x",
      source: "claude-code",
      project: "/proj-b",
      branch: "main",
      firstTimestamp: "2026-06-08T00:00:00.000Z",
      lastTimestamp: "2026-06-08T00:00:00.000Z",
      messageCount: 2,
    });
    const rows: [string, string][] = [
      ["m-a", "/proj-a"],
      ["m-b", "/proj-b"],
    ];
    for (const [seq, [id, project]] of rows.entries()) {
      upsertMessage(
        db,
        message({
          messageId: id,
          uuid: id,
          seq,
          text: `${project} content`,
          sourceFileId: "file-x",
          sessionId: "sess-x",
          project,
        }),
      );
      upsertToolCall(db, {
        toolCallId: `tc-${id}`,
        sourceFileId: "file-x",
        sessionId: "sess-x",
        messageId: id,
        toolUseId: `tu-${id}`,
        toolName: "Bash",
        input: "{}",
        result: null,
        isError: null,
        truncated: false,
      });
    }

    deleteProjectRows(db, "/proj-a");

    // proj-b message and ITS tool call survive; proj-a's are gone.
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE project = '/proj-b'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE message_id = 'm-b'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE message_id = 'm-a'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });
});
