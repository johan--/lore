import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage } from "../store/upsert.js";
import { getSession, getSessionWindow } from "./get-session.js";
import { MAX_SESSION_PAGE } from "../limits.js";
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

  it("hard-caps an oversized page request so no caller can dump a whole session", () => {
    const db = freshStore();
    for (let i = 0; i < MAX_SESSION_PAGE + 5; i++) {
      const ts = `2026-05-10T00:00:${String(i).padStart(2, "0")}.000Z`;
      upsertMessage(db, msg({ messageId: `m${i}`, seq: i, timestamp: ts }));
    }
    const page = getSession(db, "sess-1", { limit: 1000 });
    expect(page.messages.length).toBe(MAX_SESSION_PAGE);
    // The remainder stays reachable via the cursor; capping must not strand it.
    expect(page.nextCursor).not.toBeNull();
  });
});

describe("getSessionWindow", () => {
  it("returns the neighbor window around an anchor, flagging the anchor", () => {
    const db = freshStore();
    for (let i = 0; i < 5; i++) {
      const ts = `2026-05-10T00:00:0${i}.000Z`;
      upsertMessage(db, msg({ messageId: `m${i}`, seq: i, timestamp: ts }));
    }
    const win = getSessionWindow(db, "sess-1", "m2", { before: 1, after: 1 });
    expect(win).not.toBeNull();
    expect(win!.messages.map((m) => m.messageId)).toEqual(["m1", "m2", "m3"]);
    expect(win!.messages.map((m) => m.isAnchor)).toEqual([false, true, false]);
  });

  it("folds subagent files into the window timeline", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "p0", seq: 0, timestamp: "2026-05-10T00:00:00.000Z" }));
    upsertMessage(db, msg({ messageId: "p1", seq: 1, timestamp: "2026-05-10T00:00:03.000Z" }));
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
    const win = getSessionWindow(db, "sess-1", "a0", { before: 1, after: 1 });
    expect(win!.messages.map((m) => m.messageId)).toEqual(["p0", "a0", "a1"]);
  });

  it("returns null when the anchor is not in the session", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "m0", seq: 0, timestamp: "2026-05-10T00:00:00.000Z" }));
    expect(getSessionWindow(db, "sess-1", "nope", { before: 1, after: 1 })).toBeNull();
  });

  it("hard-caps an oversized window request on each side", () => {
    const db = freshStore();
    for (let i = 0; i < MAX_SESSION_PAGE * 3; i++) {
      const ts = `2026-05-10T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`;
      upsertMessage(db, msg({ messageId: `m${i}`, seq: i, timestamp: ts }));
    }
    const anchorIdx = MAX_SESSION_PAGE + 10;
    const win = getSessionWindow(db, "sess-1", `m${anchorIdx}`, { before: 1000, after: 1000 });
    // Anchor + at most MAX_SESSION_PAGE on each side.
    expect(win!.messages.length).toBeLessThanOrEqual(MAX_SESSION_PAGE * 2 + 1);
    expect(win!.messages.filter((m) => m.isAnchor)).toHaveLength(1);
  });
});
