import { describe, it, expect } from "vitest";
import { openStore, type Store } from "../store/open-store.js";
import { upsertMessage } from "../store/upsert.js";
import { searchMemory } from "./search-memory.js";
import type { MessageRecord } from "../records.js";

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
});
