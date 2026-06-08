import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ingestHermesConversation } from "./ingest.js";
import { makeDbRef } from "../sqlite/db-ref.js";
import type { DiscoveredFile, IngestContext } from "../contract.js";
import type { ResumeToken } from "../../core/records.js";

const sessionId = "20260422_095147_9cf84c";

let dir: string;
let dbPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lore-hermes-ingest-"));
  dbPath = join(dir, "state.db");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface SeedRow {
  role: string;
  content?: string | null;
  toolCallId?: string | null;
  toolCalls?: unknown;
  toolName?: string | null;
}

function seed(rows: SeedRow[], session?: { model?: string; cwd?: string }): void {
  const db = new Database(dbPath);
  db.exec(
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, source TEXT, model TEXT, cwd TEXT, started_at REAL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL)",
  );
  db.prepare(
    "INSERT OR REPLACE INTO sessions (id, source, model, cwd, started_at) VALUES (?,?,?,?,?)",
  ).run(sessionId, "cli", session?.model ?? null, session?.cwd ?? null, 1776879366);
  const insert = db.prepare(
    "INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)",
  );
  for (const r of rows) {
    insert.run(
      sessionId,
      r.role,
      r.content ?? null,
      r.toolCallId ?? null,
      r.toolCalls === undefined ? null : JSON.stringify(r.toolCalls),
      r.toolName ?? null,
      1776879366,
    );
  }
  db.close();
}

function ctxFor(priorToken: ResumeToken | null): { file: DiscoveredFile; ctx: IngestContext } {
  const ref = makeDbRef(dbPath, sessionId);
  return {
    file: { path: ref, kind: "primary", agentFile: null, sessionId },
    ctx: { sourceFileId: ref, sessionId, source: "hermes", priorToken },
  };
}

const toolCall = (callId: string, name: string, args: string) => [
  { id: callId, call_id: callId, type: "function", function: { name, arguments: args } },
];

describe("ingestHermesConversation", () => {
  it("maps roles, skips session_meta, and carries session model/project", async () => {
    seed(
      [
        { role: "session_meta", content: "" },
        { role: "user", content: "find the routing haystack" },
        { role: "assistant", content: "the haystack is in the router" },
      ],
      { model: "minimax/minimax-m2.7", cwd: "/home/jordan/proj" },
    );
    const { file, ctx } = ctxFor(null);
    const result = await ingestHermesConversation(file, ctx);

    expect(result.mode).toBe("full");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[1]?.role).toBe("assistant");
    expect(result.messages[1]?.model).toBe("minimax/minimax-m2.7");
    expect(result.messages[1]?.project).toBe("/home/jordan/proj");
    expect(result.skipped).toBe(1);
    expect(result.resumeToken.kind).toBe("rowid");
  });

  it("pairs a tool result back onto the assistant's tool call", async () => {
    seed([
      { role: "user", content: "list the dir" },
      { role: "assistant", content: "", toolCalls: toolCall("call_1", "list_dir", '{"path":"."}') },
      { role: "tool", content: '{"success": true, "output": "AGENTS.md"}', toolCallId: "call_1" },
    ]);
    const { file, ctx } = ctxFor(null);
    const result = await ingestHermesConversation(file, ctx);

    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0]!;
    expect(call.toolName).toBe("list_dir");
    expect(call.toolUseId).toBe("call_1");
    expect(call.input).toBe('{"path":"."}');
    expect(call.result).toContain("AGENTS.md");
    expect(call.isError).toBe(false);
  });

  it("marks a failed tool result as an error", async () => {
    seed([
      { role: "assistant", content: "", toolCalls: toolCall("call_x", "run", "{}") },
      { role: "tool", content: '{"success": false, "error": "boom"}', toolCallId: "call_x" },
    ]);
    const { file, ctx } = ctxFor(null);
    const result = await ingestHermesConversation(file, ctx);
    expect(result.toolCalls[0]?.isError).toBe(true);
  });

  it("mints stable message ids across an identical re-ingest", async () => {
    seed([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ]);
    const run1 = ctxFor(null);
    const run2 = ctxFor(null);
    const a = await ingestHermesConversation(run1.file, run1.ctx);
    const b = await ingestHermesConversation(run2.file, run2.ctx);
    expect(a.messages.map((m) => m.messageId)).toEqual(b.messages.map((m) => m.messageId));
  });

  it("appends only rows past the prior rowid watermark", async () => {
    seed([
      { role: "user", content: "older" },
      { role: "assistant", content: "older reply" },
    ]);
    const run1 = ctxFor(null);
    const first = await ingestHermesConversation(run1.file, run1.ctx);
    expect(first.messages).toHaveLength(2);

    seed([{ role: "user", content: "newer question" }]);
    const run2 = ctxFor(first.resumeToken);
    const second = await ingestHermesConversation(run2.file, run2.ctx);
    expect(second.mode).toBe("append");
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]?.text).toBe("newer question");
  });

  it("skips when no new rows arrived since the watermark", async () => {
    seed([{ role: "user", content: "only message" }]);
    const run1 = ctxFor(null);
    const first = await ingestHermesConversation(run1.file, run1.ctx);
    const run2 = ctxFor(first.resumeToken);
    const second = await ingestHermesConversation(run2.file, run2.ctx);
    expect(second.mode).toBe("skip");
    expect(second.messages).toHaveLength(0);
  });
});
