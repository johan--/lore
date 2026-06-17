import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openStore, openStoreReadonly, optimizeFts } from "./open-store.js";
import { SCHEMA_VERSION, StoreSchemaTooNewError } from "./migrate.js";
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

  it("can read a compatible store from a newer Lore version", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-ro-"));
    const path = join(dir, "lore.db");
    try {
      const writer = openStore(path);
      upsertMessage(writer, msg({ messageId: "m1", text: "remember alamo" }));
      writer.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
      writer.close();

      const reader = openStoreReadonly(path);
      expect(searchMemory(reader, "alamo").map((h) => h.messageId)).toEqual(["m1"]);
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

  it("applies the large-store read pragmas (mmap + cache)", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-ro-"));
    const path = join(dir, "lore.db");
    try {
      openStore(path).close();
      const reader = openStoreReadonly(path);
      // mmap_size lets the OS map the 2.5GB store instead of read()-ing it page
      // by page; cache_size (negative = KiB) holds hot index/leaf pages in RAM.
      expect(reader.pragma("mmap_size", { simple: true })).toBe(1073741824);
      expect(reader.pragma("cache_size", { simple: true })).toBe(-65536);
      reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("openStore", () => {
  it("refuses to write to a store from a newer Lore version before mutating it", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-newer-"));
    const path = join(dir, "lore.db");
    try {
      const writer = openStore(path);
      writer.close();

      const raw = new Database(path);
      raw.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
      raw.close();

      expect(() => openStore(path)).toThrow(StoreSchemaTooNewError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("optimizeFts", () => {
  it("is idempotent and leaves the index searchable", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-opt-"));
    const path = join(dir, "lore.db");
    try {
      const db = openStore(path);
      upsertMessage(db, msg({ messageId: "m1", text: "remember the alamo" }));
      // Merging FTS b-tree segments must never change query results, and running
      // it repeatedly (every backfill) must stay safe.
      optimizeFts(db);
      optimizeFts(db);
      expect(searchMemory(db, "alamo").map((h) => h.messageId)).toEqual(["m1"]);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("idx_messages_project", () => {
  it("exists after schema init (drives project-filtered rollups)", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-idx-"));
    const path = join(dir, "lore.db");
    try {
      const db = openStore(path);
      const row = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_project'",
        )
        .get();
      expect(row).toBeTruthy();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
