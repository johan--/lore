import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, openStoreReadonly } from "./open-store.js";
import { upsertMessage } from "./upsert.js";
import { searchMemory } from "../search/search-memory.js";
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
    skill: null,
    textTruncated: false,
    ...over,
  };
}

describe("openStoreReadonly", () => {
  it("opens an existing store and can search it", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-ro-"));
    const path = join(dir, "lore.db");
    try {
      const writer = openStore(path);
      upsertMessage(writer, msg({ messageId: "m1", text: "remember the alamo" }));
      writer.close();

      const reader = openStoreReadonly(path);
      const hits = searchMemory(reader, "alamo");
      expect(hits.map((h) => h.messageId)).toEqual(["m1"]);
      reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when the store file does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-ro-"));
    const path = join(dir, "missing.db");
    try {
      expect(() => openStoreReadonly(path)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not write to the store (rejects an insert)", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-ro-"));
    const path = join(dir, "lore.db");
    try {
      const writer = openStore(path);
      upsertMessage(writer, msg({ messageId: "m1", text: "alamo here" }));
      writer.close();

      const reader = openStoreReadonly(path);
      expect(() =>
        reader.prepare("INSERT INTO messages (message_id) VALUES ('x')").run(),
      ).toThrow();
      reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
