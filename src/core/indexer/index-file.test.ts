import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, type Store } from "../store/open-store.js";
import { indexFile } from "./index-file.js";
import { searchMemory } from "../search/search-memory.js";

let dir: string;
let db: Store;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "recall-idx-"));
  db = openStore(":memory:");
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

async function writeFixture(name: string, lines: string[]): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, lines.join("\n") + "\n", "utf8");
  return path;
}

const SESSION = "11111111-2222-3333-4444-555555555555";

function primaryLines(): string[] {
  return [
    line({ type: "summary", summary: "meta line, should be skipped" }),
    line({
      type: "user",
      uuid: "u-1",
      parentUuid: null,
      timestamp: "2026-05-10T00:00:01.000Z",
      sessionId: SESSION,
      cwd: "/Users/jordanhindo/claude-lives",
      gitBranch: "main",
      message: { role: "user", content: "index the alamo transcript please" },
    }),
    line({
      type: "assistant",
      uuid: "a-1",
      parentUuid: "u-1",
      timestamp: "2026-05-10T00:00:02.000Z",
      sessionId: SESSION,
      cwd: "/Users/jordanhindo/claude-lives",
      gitBranch: "main",
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        content: [
          { type: "text", text: "running a command" },
          { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls -la" } },
        ],
      },
    }),
  ];
}

describe("indexFile", () => {
  it("populates sessions, messages, tool_calls and FTS from a primary transcript", async () => {
    const path = await writeFixture(`${SESSION}.jsonl`, primaryLines());
    const result = await indexFile(db, { path });

    expect(result.messages).toBe(2);
    expect(result.toolCalls).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.sessionId).toBe(SESSION);

    const sessionRow = db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(SESSION) as
      | { message_count: number; project: string; branch: string }
      | undefined;
    expect(sessionRow?.message_count).toBe(2);
    expect(sessionRow?.project).toBe("/Users/jordanhindo/claude-lives");
    expect(sessionRow?.branch).toBe("main");

    const toolRow = db.prepare("SELECT tool_name FROM tool_calls").get() as
      | { tool_name: string }
      | undefined;
    expect(toolRow?.tool_name).toBe("Bash");

    const hits = searchMemory(db, "alamo");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.sessionId).toBe(SESSION);
    expect(hits[0]?.model).toBeNull(); // the user line has no model; assistant does
  });

  it("is idempotent — re-indexing the same file does not duplicate rows", async () => {
    const path = await writeFixture(`${SESSION}.jsonl`, primaryLines());
    await indexFile(db, { path });
    await indexFile(db, { path });

    const count = db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number };
    expect(count.n).toBe(2);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
  });

  it("rolls subagent messages under the parent session but keeps them attributable", async () => {
    const parent = SESSION;
    const agentHash = "agent-a555e804c9bf7ebe7";
    const subLines = [
      line({
        type: "user",
        uuid: "su-1",
        parentUuid: null,
        timestamp: "2026-05-10T00:05:00.000Z",
        sessionId: parent,
        agentId: "a555e804c9bf7ebe7",
        isSidechain: true,
        cwd: "/repo",
        gitBranch: "main",
        message: { role: "user", content: "subagent indexing alamo work" },
      }),
    ];
    const path = await writeFixture(`${agentHash}.jsonl`, subLines);
    const result = await indexFile(db, {
      path,
      kind: "subagent",
      agentFile: agentHash,
      sessionId: parent,
    });

    expect(result.sessionId).toBe(parent);
    const row = db.prepare("SELECT session_id, agent, source_file_id FROM messages").get() as {
      session_id: string;
      agent: string;
      source_file_id: string;
    };
    expect(row.session_id).toBe(parent);
    expect(row.agent).toBe("a555e804c9bf7ebe7");
    expect(row.source_file_id).toBe(path);
  });

  it("treats an explicit sessionId as authoritative over a divergent payload", async () => {
    const parent = SESSION;
    const subLines = [
      line({
        type: "user",
        uuid: "su-1",
        parentUuid: null,
        timestamp: "2026-05-10T00:05:00.000Z",
        // Payload claims a different (wrong) session; the structural parent wins.
        sessionId: "stale-or-wrong-session",
        agentId: "a555e804c9bf7ebe7",
        isSidechain: true,
        message: { role: "user", content: "subagent alamo work" },
      }),
    ];
    const path = await writeFixture("agent-a555e804c9bf7ebe7.jsonl", subLines);
    const result = await indexFile(db, {
      path,
      kind: "subagent",
      agentFile: "agent-a555e804c9bf7ebe7",
      sessionId: parent,
    });

    expect(result.sessionId).toBe(parent);
    const row = db.prepare("SELECT session_id FROM messages").get() as { session_id: string };
    expect(row.session_id).toBe(parent);
  });

  it("keeps same-uuid lines of differing content as distinct rows", async () => {
    const lines = [
      line({
        type: "user",
        uuid: "dup",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:01.000Z",
        sessionId: SESSION,
        message: { role: "user", content: "alamo collision payload one" },
      }),
      line({
        type: "user",
        uuid: "dup",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:02.000Z",
        sessionId: SESSION,
        message: { role: "user", content: "alamo collision payload two" },
      }),
    ];
    const path = await writeFixture(`${SESSION}.jsonl`, lines);
    const result = await indexFile(db, { path });

    expect(result.messages).toBe(2);
    const count = db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number };
    expect(count.n).toBe(2);
    expect(searchMemory(db, "collision")).toHaveLength(2);
  });

  it("skips an unchanged file on re-index instead of redoing work", async () => {
    const path = await writeFixture(`${SESSION}.jsonl`, primaryLines());
    const first = await indexFile(db, { path });
    expect(first.mode).toBe("full");

    const second = await indexFile(db, { path });
    expect(second.mode).toBe("skip");
    expect(second.messages).toBe(0);

    const count = db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number };
    expect(count.n).toBe(2);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
  });

  it("appends only the new tail when a file grows", async () => {
    const path = await writeFixture(`${SESSION}.jsonl`, primaryLines());
    const first = await indexFile(db, { path });
    expect(first.messages).toBe(2);

    // Append one more user line to the existing transcript.
    const appended =
      primaryLines().join("\n") +
      "\n" +
      line({
        type: "user",
        uuid: "u-2",
        parentUuid: "a-1",
        timestamp: "2026-05-10T00:00:09.000Z",
        sessionId: SESSION,
        cwd: "/Users/jordanhindo/claude-lives",
        gitBranch: "main",
        message: { role: "user", content: "follow-up about the masada siege" },
      }) +
      "\n";
    await writeFile(path, appended, "utf8");

    const second = await indexFile(db, { path });
    expect(second.mode).toBe("append");
    expect(second.messages).toBe(1); // only the appended line

    const count = db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number };
    expect(count.n).toBe(3);
    expect(searchMemory(db, "masada")).toHaveLength(1);
    expect(searchMemory(db, "alamo")).toHaveLength(1);

    const sessionRow = db
      .prepare("SELECT message_count FROM sessions WHERE session_id = ?")
      .get(SESSION) as { message_count: number };
    expect(sessionRow.message_count).toBe(3);
  });

  it("fully re-indexes a rewritten file and drops the old rows", async () => {
    const path = await writeFixture(`${SESSION}.jsonl`, primaryLines());
    await indexFile(db, { path });
    expect(searchMemory(db, "alamo")).toHaveLength(1);

    // Rewrite the file in place with entirely different content (prefix changes).
    const rewritten = [
      line({
        type: "user",
        uuid: "r-1",
        parentUuid: null,
        timestamp: "2026-05-11T00:00:01.000Z",
        sessionId: SESSION,
        cwd: "/Users/jordanhindo/claude-lives",
        gitBranch: "main",
        message: { role: "user", content: "completely new thermopylae content" },
      }),
    ];
    await writeFile(path, rewritten.join("\n") + "\n", "utf8");

    const result = await indexFile(db, { path });
    expect(result.mode).toBe("full");

    expect(searchMemory(db, "alamo")).toHaveLength(0); // old rows gone
    expect(searchMemory(db, "thermopylae")).toHaveLength(1);

    const count = db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("rolls a session up across primary and subagent files, not just the last indexed", async () => {
    const primaryPath = await writeFixture(`${SESSION}.jsonl`, primaryLines());
    await indexFile(db, { path: primaryPath });

    const agentHash = "agent-bbbb1111";
    const subPath = await writeFixture(`${agentHash}.jsonl`, [
      line({
        type: "user",
        uuid: "su-1",
        parentUuid: null,
        timestamp: "2026-05-10T00:10:00.000Z",
        sessionId: SESSION,
        agentId: "bbbb1111",
        isSidechain: true,
        message: { role: "user", content: "subagent did extra alamo work" },
      }),
    ]);
    await indexFile(db, {
      path: subPath,
      kind: "subagent",
      agentFile: agentHash,
      sessionId: SESSION,
    });

    const sessionRow = db
      .prepare("SELECT message_count, last_timestamp FROM sessions WHERE session_id = ?")
      .get(SESSION) as { message_count: number; last_timestamp: string };
    // 2 primary + 1 subagent — the subagent index must not clobber the rollup.
    expect(sessionRow.message_count).toBe(3);
    expect(sessionRow.last_timestamp).toBe("2026-05-10T00:10:00.000Z");
  });

  it("redacts secrets from message text when redaction is opted in", async () => {
    const secret = "sk-abcdEFGH1234abcdEFGH5678abcdEFGH90";
    const lines = [
      line({
        type: "user",
        uuid: "u-secret",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:01.000Z",
        sessionId: SESSION,
        message: { role: "user", content: `my alamo api key is ${secret} keep it safe` },
      }),
    ];
    const path = await writeFixture(`${SESSION}.jsonl`, lines);
    await indexFile(db, { path, redact: true });

    const row = db.prepare("SELECT text FROM messages").get() as { text: string };
    expect(row.text).not.toContain(secret);
    expect(row.text).toContain("[REDACTED]");
    expect(searchMemory(db, "alamo")).toHaveLength(1);
  });

  it("keeps secrets verbatim by default (redaction off)", async () => {
    const secret = "sk-abcdEFGH1234abcdEFGH5678abcdEFGH90";
    const lines = [
      line({
        type: "user",
        uuid: "u-secret",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:01.000Z",
        sessionId: SESSION,
        message: { role: "user", content: `alamo key ${secret}` },
      }),
    ];
    const path = await writeFixture(`${SESSION}.jsonl`, lines);
    await indexFile(db, { path });

    const row = db.prepare("SELECT text FROM messages").get() as { text: string };
    expect(row.text).toContain(secret);
  });

  it("truncates and flags a multi-MB line instead of crashing or returning it raw", async () => {
    const huge = "alamo " + "z".repeat(3_000_000);
    const lines = [
      line({
        type: "user",
        uuid: "u-big",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:03.000Z",
        sessionId: SESSION,
        message: { role: "user", content: huge },
      }),
    ];
    const path = await writeFixture(`${SESSION}.jsonl`, lines);
    await indexFile(db, { path, maxTextChars: 5000 });

    const row = db.prepare("SELECT text, text_truncated FROM messages").get() as {
      text: string;
      text_truncated: number;
    };
    expect(row.text.length).toBe(5000);
    expect(row.text_truncated).toBe(1);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
  });
});
