import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ingestCursorConversation } from "./ingest.js";
import { makeDbRef } from "../sqlite/db-ref.js";
import type { DiscoveredFile, IngestContext } from "../contract.js";
import type { ResumeToken } from "../../core/records.js";

const composerId = "11111111-2222-3333-4444-555555555555";

let dir: string;
let dbPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lore-cursor-ingest-"));
  dbPath = join(dir, "state.vscdb");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function seed(bubbles: { id: string; type: number; text: string }[]): void {
  const db = new Database(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)");
  for (const b of bubbles) {
    insert.run(
      `bubbleId:${composerId}:${b.id}`,
      JSON.stringify({ type: b.type, text: b.text, bubbleId: b.id, createdAt: 1773850995788 }),
    );
  }
  db.close();
}

function ctxFor(priorToken: ResumeToken | null): {
  file: DiscoveredFile;
  ctx: IngestContext;
} {
  const ref = makeDbRef(dbPath, composerId);
  return {
    file: { path: ref, kind: "primary", agentFile: null, sessionId: composerId },
    ctx: { sourceFileId: ref, sessionId: composerId, source: "cursor", priorToken },
  };
}

describe("ingestCursorConversation", () => {
  it("maps bubble types to roles and skips empty-text bubbles", async () => {
    seed([
      { id: "b1", type: 1, text: "hello there" },
      { id: "b2", type: 2, text: "hi back" },
      { id: "b3", type: 2, text: "   " },
    ]);
    const { file, ctx } = ctxFor(null);
    const result = await ingestCursorConversation(file, ctx);

    expect(result.mode).toBe("full");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[1]?.role).toBe("assistant");
    expect(result.skipped).toBe(1);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.resumeToken.kind).toBe("rowid");
  });

  it("mints stable message ids across an identical re-ingest", async () => {
    seed([
      { id: "b1", type: 1, text: "first" },
      { id: "b2", type: 2, text: "second" },
    ]);
    const run1 = ctxFor(null);
    const run2 = ctxFor(null);
    const a = await ingestCursorConversation(run1.file, run1.ctx);
    const b = await ingestCursorConversation(run2.file, run2.ctx);
    expect(a.messages.map((m) => m.messageId)).toEqual(b.messages.map((m) => m.messageId));
  });

  it("appends only bubbles past the prior rowid watermark", async () => {
    seed([
      { id: "b1", type: 1, text: "older" },
      { id: "b2", type: 2, text: "older reply" },
    ]);
    const run1 = ctxFor(null);
    const first = await ingestCursorConversation(run1.file, run1.ctx);
    expect(first.messages).toHaveLength(2);

    // New turn arrives after the first index.
    seed([{ id: "b3", type: 1, text: "newer question" }]);
    const run2 = ctxFor(first.resumeToken);
    const second = await ingestCursorConversation(run2.file, run2.ctx);
    expect(second.mode).toBe("append");
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]?.text).toBe("newer question");
  });

  it("skips when no new bubbles arrived since the watermark", async () => {
    seed([{ id: "b1", type: 1, text: "only message" }]);
    const run1 = ctxFor(null);
    const first = await ingestCursorConversation(run1.file, run1.ctx);
    const run2 = ctxFor(first.resumeToken);
    const second = await ingestCursorConversation(run2.file, run2.ctx);
    expect(second.mode).toBe("skip");
    expect(second.messages).toHaveLength(0);
  });
});
