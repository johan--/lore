import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage } from "../store/upsert.js";
import { findRelevant } from "./find-relevant.js";
import type { MessageRecord } from "../records.js";

function msg(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "seq" | "timestamp" | "text">,
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
    textTruncated: false,
    ...over,
  };
}

function freshStore(): Store {
  return openStore(":memory:");
}

const NOW = "2026-05-10T00:00:00.000Z";

describe("findRelevant", () => {
  it("ranks a more recent match above an equally-relevant older one", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({
        messageId: "old",
        uuid: "u1",
        seq: 0,
        timestamp: "2026-01-01T00:00:00.000Z",
        text: "alamo",
      }),
    );
    upsertMessage(
      db,
      msg({
        messageId: "recent",
        uuid: "u2",
        seq: 1,
        timestamp: "2026-05-09T00:00:00.000Z",
        text: "alamo",
      }),
    );

    const hits = findRelevant(db, "alamo", { now: NOW });
    expect(hits.map((h) => h.messageId)).toEqual(["recent", "old"]);
  });

  it("ranks a clearly stronger older match above a weak fresh one", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({
        messageId: "old-strong",
        uuid: "u1",
        seq: 0,
        timestamp: "2026-04-10T00:00:00.000Z",
        text: "alamo battle",
      }),
    );
    upsertMessage(
      db,
      msg({
        messageId: "fresh-weak",
        uuid: "u2",
        seq: 1,
        timestamp: NOW,
        text: "alamo " + "filler ".repeat(40),
      }),
    );

    const hits = findRelevant(db, "alamo", { now: NOW });
    expect(hits[0]?.messageId).toBe("old-strong");
  });

  it("still respects keyword relevance when recency is equal", () => {
    const db = freshStore();
    upsertMessage(
      db,
      msg({
        messageId: "strong",
        uuid: "u1",
        seq: 0,
        timestamp: NOW,
        text: "alamo alamo alamo battle",
      }),
    );
    upsertMessage(
      db,
      msg({ messageId: "weak", uuid: "u2", seq: 1, timestamp: NOW, text: "alamo and other words" }),
    );

    const hits = findRelevant(db, "alamo", { now: NOW });
    expect(hits[0]?.messageId).toBe("strong");
  });

  it("carries a blended score and respects the limit", () => {
    const db = freshStore();
    for (let i = 0; i < 5; i++) {
      upsertMessage(
        db,
        msg({
          messageId: `m${i}`,
          uuid: `u${i}`,
          seq: i,
          timestamp: `2026-05-0${i + 1}T00:00:00.000Z`,
          text: `alamo number ${i}`,
        }),
      );
    }
    const hits = findRelevant(db, "alamo", { now: NOW, limit: 2 });
    expect(hits).toHaveLength(2);
    expect(typeof hits[0]?.score).toBe("number");
  });

  it("honors dimension filters (source) like search_memory", () => {
    const db = freshStore();
    upsertMessage(db, msg({ messageId: "a", uuid: "u1", seq: 0, timestamp: NOW, text: "alamo a" }));
    upsertMessage(
      db,
      msg({
        messageId: "b",
        uuid: "u2",
        seq: 0,
        timestamp: NOW,
        text: "alamo b",
        project: "/other",
      }),
    );
    expect(
      findRelevant(db, "alamo", { now: NOW, project: "/other" }).map((h) => h.messageId),
    ).toEqual(["b"]);
  });
});
