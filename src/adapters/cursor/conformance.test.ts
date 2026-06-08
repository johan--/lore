import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { checkAdapterConformance } from "../conformance.js";
import { cursorAdapter } from "./adapter.js";

const composerId = "6694b02b-1dc8-4553-a76e-8e0d5200d98c";

/** Build a minimal Cursor `state.vscdb` shaped like the real globalStorage DB. */
function writeFixtureDb(path: string): void {
  const db = new Database(path);
  db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)");
  const bubble = (id: string, type: number, text: string) =>
    JSON.stringify({ type, text, bubbleId: id, createdAt: 1773850995788 });
  insert.run(`composerData:${composerId}`, JSON.stringify({ composerId, createdAt: 1 }));
  insert.run(`bubbleId:${composerId}:b1`, bubble("b1", 1, "find the routing haystack"));
  insert.run(`bubbleId:${composerId}:b2`, bubble("b2", 2, "the haystack is in the router"));
  // An empty-text bubble: a tool-only assistant turn Cursor stored no text for.
  // Exercises the skip path the conformance harness requires.
  insert.run(`bubbleId:${composerId}:b3`, bubble("b3", 2, ""));
  db.close();
}

describe("cursor adapter conformance", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-cursor-conf-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes the universal adapter contract end to end", async () => {
    writeFixtureDb(join(dir, "state.vscdb"));

    const report = await checkAdapterConformance(cursorAdapter, {
      sampleRoot: dir,
      searchQuery: "haystack",
      expectedText: "haystack",
    });
    expect(report.source).toBe("cursor");
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });
});
