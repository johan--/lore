import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage, upsertSourceFile } from "../store/upsert.js";
import { listSessions } from "./list-sessions.js";
import type { MessageRecord, SourceFileRecord } from "../records.js";

function msg(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "seq" | "timestamp">,
): MessageRecord {
  return {
    sourceFileId: "sf-1",
    sessionId: "sess-1",
    uuid: over.messageId,
    parentUuid: null,
    role: "user",
    project: "/repo",
    branch: "main",
    model: null,
    agent: null,
    skill: null,
    text: `text for ${over.messageId}`,
    textTruncated: false,
    ...over,
  };
}

function sourceFile(
  over: Partial<SourceFileRecord> & Pick<SourceFileRecord, "sourceFileId" | "sessionId" | "source">,
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

function freshStore(): Store {
  return openStore(":memory:");
}

describe("listSessions", () => {
  it("rolls up one row per session with counts and timestamp bounds, most-recent first", () => {
    const db = freshStore();
    // Session A: two messages, older.
    upsertMessage(db, msg({ messageId: "a0", seq: 0, timestamp: "2026-05-01T00:00:00.000Z" }));
    upsertMessage(db, msg({ messageId: "a1", seq: 1, timestamp: "2026-05-01T00:05:00.000Z" }));
    // Session B: one message, newer.
    upsertMessage(
      db,
      msg({
        messageId: "b0",
        seq: 0,
        timestamp: "2026-05-02T00:00:00.000Z",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
        project: "/other",
      }),
    );

    const rows = listSessions(db);
    expect(rows.map((r) => r.sessionId)).toEqual(["sess-2", "sess-1"]);
    const a = rows.find((r) => r.sessionId === "sess-1");
    expect(a?.messageCount).toBe(2);
    expect(a?.firstTimestamp).toBe("2026-05-01T00:00:00.000Z");
    expect(a?.lastTimestamp).toBe("2026-05-01T00:05:00.000Z");
    expect(a?.project).toBe("/repo");
  });

  it("filters by project", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "a0", seq: 0, timestamp: "2026-05-01T00:00:00.000Z" }));
    upsertMessage(
      db,
      msg({
        messageId: "b0",
        seq: 0,
        timestamp: "2026-05-02T00:00:00.000Z",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
        project: "/other",
      }),
    );
    expect(listSessions(db, { project: "/other" }).map((r) => r.sessionId)).toEqual(["sess-2"]);
  });

  it("filters by source namespace via the file join", () => {
    const db = freshStore();
    upsertSourceFile(
      db,
      sourceFile({ sourceFileId: "sf-1", sessionId: "sess-1", source: "claude-code" }),
    );
    upsertSourceFile(
      db,
      sourceFile({ sourceFileId: "sf-2", sessionId: "sess-2", source: "codex" }),
    );
    upsertMessage(db, msg({ messageId: "a0", seq: 0, timestamp: "2026-05-01T00:00:00.000Z" }));
    upsertMessage(
      db,
      msg({
        messageId: "b0",
        seq: 0,
        timestamp: "2026-05-02T00:00:00.000Z",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
      }),
    );

    const codex = listSessions(db, { source: "codex" });
    expect(codex.map((r) => r.sessionId)).toEqual(["sess-2"]);
    expect(codex[0]?.source).toBe("codex");
  });

  it("filters by since/until on a session's last activity", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "a0", seq: 0, timestamp: "2026-05-01T00:00:00.000Z" }));
    upsertMessage(
      db,
      msg({
        messageId: "b0",
        seq: 0,
        timestamp: "2026-06-01T00:00:00.000Z",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
      }),
    );
    expect(listSessions(db, { since: "2026-05-15T00:00:00.000Z" }).map((r) => r.sessionId)).toEqual(
      ["sess-2"],
    );
    expect(listSessions(db, { until: "2026-05-15T00:00:00.000Z" }).map((r) => r.sessionId)).toEqual(
      ["sess-1"],
    );
  });
});
