import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { sampleFormat, renderSample } from "./sample-format.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lore-sample-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sampleFormat", () => {
  it("summarizes a JSONL transcript directory's on-disk shape", async () => {
    const lines = [
      JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "summary", summary: "meta line" }),
    ];
    await writeFile(join(dir, "sess-a.jsonl"), lines.join("\n") + "\n");

    const sample = await sampleFormat(dir, { maxLines: 10 });
    expect(sample.kind).toBe("jsonl");
    expect(sample.fileCount).toBe(1);
    expect(sample.sampleFile).toContain("sess-a.jsonl");
    expect(sample.sampleLines).toHaveLength(2);
    expect(sample.lineTypes.sort()).toEqual(["summary", "user"]);
    expect(sample.topLevelKeys).toEqual(expect.arrayContaining(["type", "uuid", "message"]));
  });

  it("detects a SQLite database by header and reports its tables and columns", async () => {
    const dbPath = join(dir, "state.vscdb");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)").run("bubbleId:x:1", "{}");
    db.close();

    const sample = await sampleFormat(dir);
    expect(sample.kind).toBe("sqlite");
    expect(sample.fileCount).toBe(1);
    const table = sample.tables.find((t) => t.name === "cursorDiskKV");
    expect(table).toBeDefined();
    expect(table?.columns).toEqual(["key", "value"]);
    expect(table?.rowCount).toBe(1);
  });

  it("quotes SQLite table names when reporting table shape", async () => {
    const dbPath = join(dir, "state.db");
    const db = new Database(dbPath);
    db.exec('CREATE TABLE "odd""table" (id INTEGER PRIMARY KEY, value TEXT)');
    db.prepare('INSERT INTO "odd""table" (value) VALUES (?)').run("ok");
    db.close();

    const sample = await sampleFormat(dir);
    expect(sample.kind).toBe("sqlite");
    const table = sample.tables.find((t) => t.name === 'odd"table');
    expect(table?.columns).toEqual(["id", "value"]);
    expect(table?.rowCount).toBe(1);
  });

  it("detects a whole-file JSON array and reports element keys", async () => {
    const records = [
      { id: "a", role: "user", text: "hi" },
      { id: "b", role: "assistant", text: "yo", model: "gpt" },
    ];
    await writeFile(join(dir, "conversation.json"), JSON.stringify(records));

    const sample = await sampleFormat(dir);
    expect(sample.kind).toBe("json-array");
    expect(sample.elementCount).toBe(2);
    expect(sample.elementKeys.sort()).toEqual(["id", "model", "role", "text"]);
  });

  it("reports a top-level JSON object's keys without treating it as an array", async () => {
    await writeFile(join(dir, "meta.json"), JSON.stringify({ sessionId: "s1", messages: [] }));
    const sample = await sampleFormat(dir);
    expect(sample.kind).toBe("json-object");
    expect(sample.topLevelKeys.sort()).toEqual(["messages", "sessionId"]);
  });

  it("reports an empty directory without throwing", async () => {
    const sample = await sampleFormat(dir);
    expect(sample.kind).toBe("empty");
    expect(sample.fileCount).toBe(0);
    expect(sample.sampleFile).toBeNull();
    expect(sample.sampleLines).toEqual([]);
  });

  it("renders the detected shape per kind", async () => {
    const dbPath = join(dir, "state.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, role TEXT)");
    db.close();
    const sample = await sampleFormat(dir);
    const text = renderSample(sample);
    expect(text).toContain("kind:         sqlite");
    expect(text).toContain("messages");
    expect(text).toContain("role");
  });
});
