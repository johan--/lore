import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { checkAdapterConformance } from "../conformance.js";
import { hermesAdapter } from "./adapter.js";

const sessionId = "20260422_095147_9cf84c";

/** Build a minimal Hermes `state.db` shaped like the real one. */
function writeFixtureDb(path: string): void {
  const db = new Database(path);
  db.exec(
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, model TEXT, cwd TEXT, started_at REAL)",
  );
  db.exec(
    "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL)",
  );
  db.prepare("INSERT INTO sessions (id, source, model, cwd, started_at) VALUES (?,?,?,?,?)").run(
    sessionId,
    "cli",
    "minimax/minimax-m2.7",
    "/home/jordan/proj",
    1776879366,
  );
  const insert = db.prepare(
    "INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)",
  );
  // A meta row the conformance harness requires the adapter to skip.
  insert.run(sessionId, "session_meta", "", null, null, null, 1776879366);
  insert.run(sessionId, "user", "find the routing haystack", null, null, null, 1776879366);
  insert.run(
    sessionId,
    "assistant",
    "the haystack is in the router",
    null,
    JSON.stringify([
      {
        id: "call_1",
        call_id: "call_1",
        type: "function",
        function: { name: "grep", arguments: '{"q":"haystack"}' },
      },
    ]),
    null,
    1776879366,
  );
  insert.run(
    sessionId,
    "tool",
    '{"success": true, "output": "found"}',
    "call_1",
    null,
    null,
    1776879366,
  );
  db.close();
}

describe("hermes adapter conformance", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-hermes-conf-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes the universal adapter contract end to end", async () => {
    writeFixtureDb(join(dir, "state.db"));

    const report = await checkAdapterConformance(hermesAdapter, {
      sampleRoot: dir,
      searchQuery: "haystack",
      expectedText: "haystack",
    });
    expect(report.source).toBe("hermes");
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });
});
