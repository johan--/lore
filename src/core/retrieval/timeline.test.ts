import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage, upsertSourceFile } from "../store/upsert.js";
import { timeline } from "./timeline.js";
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

describe("timeline", () => {
  it("buckets message activity by day in chronological order", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "a", seq: 0, timestamp: "2026-05-01T08:00:00.000Z" }));
    upsertMessage(db, msg({ messageId: "b", seq: 1, timestamp: "2026-05-01T20:00:00.000Z" }));
    upsertMessage(db, msg({ messageId: "c", seq: 2, timestamp: "2026-05-03T10:00:00.000Z" }));

    const buckets = timeline(db);
    expect(buckets).toEqual([
      { bucket: "2026-05-01", count: 2 },
      { bucket: "2026-05-03", count: 1 },
    ]);
  });

  it("buckets by hour when requested", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "a", seq: 0, timestamp: "2026-05-01T08:15:00.000Z" }));
    upsertMessage(db, msg({ messageId: "b", seq: 1, timestamp: "2026-05-01T08:45:00.000Z" }));
    upsertMessage(db, msg({ messageId: "c", seq: 2, timestamp: "2026-05-01T09:05:00.000Z" }));

    expect(timeline(db, { bucket: "hour" })).toEqual([
      { bucket: "2026-05-01 08", count: 2 },
      { bucket: "2026-05-01 09", count: 1 },
    ]);
  });

  it("narrows by project, source, and time window", () => {
    const db = freshStore();
    upsertSourceFile(
      db,
      sourceFile({ sourceFileId: "sf-1", sessionId: "sess-1", source: "claude-code" }),
    );
    upsertSourceFile(
      db,
      sourceFile({ sourceFileId: "sf-2", sessionId: "sess-2", source: "codex" }),
    );
    upsertMessage(db, msg({ messageId: "a", seq: 0, timestamp: "2026-05-01T08:00:00.000Z" }));
    upsertMessage(
      db,
      msg({
        messageId: "b",
        seq: 0,
        timestamp: "2026-05-02T08:00:00.000Z",
        sessionId: "sess-2",
        sourceFileId: "sf-2",
        project: "/other",
      }),
    );

    expect(timeline(db, { source: "codex" })).toEqual([{ bucket: "2026-05-02", count: 1 }]);
    expect(timeline(db, { project: "/repo" })).toEqual([{ bucket: "2026-05-01", count: 1 }]);
    expect(timeline(db, { since: "2026-05-02T00:00:00.000Z" })).toEqual([
      { bucket: "2026-05-02", count: 1 },
    ]);
  });
});
