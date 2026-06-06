import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage } from "../store/upsert.js";
import { getSession } from "./get-session.js";
import type { MessageRecord } from "../records.js";

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

function freshStore(): Store {
  return openStore(":memory:");
}

describe("getSession", () => {
  it("folds primary and subagent files into one chronological timeline", () => {
    const db = freshStore();
    // Primary thread.
    upsertMessage(db, msg({ messageId: "p0", seq: 0, timestamp: "2026-05-10T00:00:00.000Z" }));
    upsertMessage(db, msg({ messageId: "p1", seq: 1, timestamp: "2026-05-10T00:00:03.000Z" }));
    // Subagent file, same logical session, interleaved in time.
    upsertMessage(
      db,
      msg({
        messageId: "a0",
        seq: 0,
        timestamp: "2026-05-10T00:00:01.000Z",
        sourceFileId: "sf-2",
        agent: "agent-x",
      }),
    );
    upsertMessage(
      db,
      msg({
        messageId: "a1",
        seq: 1,
        timestamp: "2026-05-10T00:00:02.000Z",
        sourceFileId: "sf-2",
        agent: "agent-x",
      }),
    );

    const page = getSession(db, "sess-1");
    expect(page.messages.map((m) => m.messageId)).toEqual(["p0", "a0", "a1", "p1"]);
  });

  it("paginates with a cursor that continues where the prior page stopped", () => {
    const db = freshStore();
    for (let i = 0; i < 5; i++) {
      const ts = `2026-05-10T00:00:0${i}.000Z`;
      upsertMessage(db, msg({ messageId: `m${i}`, seq: i, timestamp: ts }));
    }

    const page1 = getSession(db, "sess-1", { limit: 2 });
    expect(page1.messages.map((m) => m.messageId)).toEqual(["m0", "m1"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = getSession(db, "sess-1", { limit: 2, cursor: page1.nextCursor! });
    expect(page2.messages.map((m) => m.messageId)).toEqual(["m2", "m3"]);

    const page3 = getSession(db, "sess-1", { limit: 2, cursor: page2.nextCursor! });
    expect(page3.messages.map((m) => m.messageId)).toEqual(["m4"]);
    expect(page3.nextCursor).toBeNull();
  });

  it("returns an empty page for an unknown session", () => {
    const db = freshStore();
    const page = getSession(db, "nope");
    expect(page.messages).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("elides oversized message text", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({
        messageId: "big",
        seq: 0,
        timestamp: "2026-05-10T00:00:00.000Z",
        text: "z".repeat(10_000),
      }),
    );
    const page = getSession(db, "sess-1");
    expect(page.messages[0]?.text).toContain("chars elided");
  });
});
