import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage } from "../store/upsert.js";
import { getContext } from "./get-context.js";
import type { MessageRecord } from "../records.js";

function msg(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "text" | "seq">,
): MessageRecord {
  return {
    sourceFileId: "sf-1",
    sessionId: "sess-1",
    uuid: over.messageId,
    parentUuid: null,
    role: "user",
    timestamp: "2026-05-10T00:00:00.000Z",
    project: "/repo",
    branch: "main",
    model: null,
    agent: null,
    skill: null,
    textTruncated: false,
    ...over,
  };
}

function freshStore(): Store {
  return openStore(":memory:");
}

describe("getContext", () => {
  it("returns the neighbor window around an anchor in seq order, flagging the anchor", () => {
    const db = freshStore();
    for (let i = 0; i < 6; i++) {
      upsertMessage(db, msg({ messageId: `m${i}`, uuid: `u${i}`, seq: i, text: `line ${i}` }));
    }
    const ctx = getContext(db, "m3", { before: 2, after: 1 });
    expect(ctx?.messages.map((m) => m.messageId)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(ctx?.messages.find((m) => m.isAnchor)?.messageId).toBe("m3");
  });

  it("never crosses source_file_id or session_id boundaries", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "a", uuid: "a", seq: 0, text: "file one line 0" }));
    upsertMessage(db, msg({ messageId: "b", uuid: "b", seq: 1, text: "file one line 1" }));
    // Different file/session, overlapping seq numbers.
    upsertMessage(
      db,
      msg({
        messageId: "c",
        uuid: "c",
        seq: 0,
        text: "file two line 0",
        sourceFileId: "sf-2",
        sessionId: "sess-2",
      }),
    );
    const ctx = getContext(db, "b", { before: 5, after: 5 });
    expect(ctx?.messages.map((m) => m.messageId)).toEqual(["a", "b"]);
  });

  it("returns null for an unknown anchor", () => {
    const db = freshStore();
    expect(getContext(db, "nope")).toBeNull();
  });

  it("elides oversized neighbor text", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "big", uuid: "big", seq: 0, text: "z".repeat(10_000) }));
    const ctx = getContext(db, "big", { before: 0, after: 0 });
    expect(ctx?.messages[0]?.text).toContain("chars elided");
  });
});
