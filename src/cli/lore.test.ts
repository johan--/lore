import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Readable } from "node:stream";
import { runCli } from "./lore.js";
import { openStore } from "../core/store/open-store.js";
import { upsertSourceFile } from "../core/store/upsert.js";
import { searchMemory } from "../core/search/search-memory.js";

/** Run `argv` with `input` piped on stdin, restoring the real stdin afterward. */
async function runWithStdin(argv: string[], input: string): Promise<{ code: number; out: string }> {
  const writes: string[] = [];
  const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  const orig = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", {
    value: Readable.from([Buffer.from(input)]),
    configurable: true,
  });
  try {
    const code = await runCli(argv);
    return { code, out: writes.join("") };
  } finally {
    out.mockRestore();
    if (orig) Object.defineProperty(process, "stdin", orig);
  }
}

const VALID_PUSH_BATCH = {
  sourceFile: {
    sourceFileId: "sf-push",
    source: "claude-code",
    sessionId: "sess-push",
    kind: "primary",
    agentFile: null,
    path: "/transcripts/push.jsonl",
    byteOffset: 0,
    lineCount: 1,
    prefixSha256: null,
    mtime: null,
    indexedAt: "2026-05-10T00:00:00.000Z",
  },
  messages: [
    {
      messageId: "mp1",
      sourceFileId: "sf-push",
      sessionId: "sess-push",
      uuid: "u1",
      parentUuid: null,
      seq: 0,
      role: "user",
      timestamp: "2026-05-10T00:00:00.000Z",
      project: "/repo",
      branch: "main",
      model: null,
      agent: null,
      skill: null,
      text: "pushed alamo content",
      textTruncated: false,
    },
  ],
  toolCalls: [],
};

let dir: string;
let dbPath: string;
let prevDb: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lore-cli-"));
  dbPath = join(dir, "lore.db");
  prevDb = process.env.LORE_DB;
  process.env.LORE_DB = dbPath;
});

afterEach(async () => {
  if (prevDb === undefined) delete process.env.LORE_DB;
  else process.env.LORE_DB = prevDb;
  await rm(dir, { recursive: true, force: true });
});

describe("lore CLI", () => {
  it("`index <dir>` backfills transcripts into the store", async () => {
    const transcript =
      JSON.stringify({
        type: "user",
        uuid: "u1",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:00.000Z",
        sessionId: "sess-cli",
        cwd: "/repo",
        gitBranch: "main",
        message: { role: "user", content: "cli alamo keyword" },
      }) + "\n";
    await writeFile(join(dir, "sess-cli.jsonl"), transcript);

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["index", dir]);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(writes.join("")).toContain("Indexed 1 files");

    const db = openStore(dbPath);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
    db.close();
  });

  it("returns non-zero and usage when `index` has no dir", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["index"]);
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("`search <query>` finds indexed content without the MCP server", async () => {
    const db = openStore(dbPath);
    upsertSourceFile(db, {
      sourceFileId: "sf-1",
      source: "codex",
      sessionId: "sess-search",
      kind: "primary",
      agentFile: null,
      path: "/transcripts/sess-search.jsonl",
      byteOffset: 0,
      lineCount: 1,
      prefixSha256: null,
      mtime: null,
      resumeToken: null,
      indexedAt: "2026-05-10T00:00:00.000Z",
    });
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('m1', 'sf-1', 'sess-search', 'u1', 0, 'user', '2026-05-10T00:00:00.000Z', '/repo', 'main', 'cli alamo keyword', 0)`,
    ).run();
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["search", "alamo", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(1);
    expect(parsed.hits[0].messageId).toBe("m1");
    expect(parsed.hits[0].source).toBe("codex");
  });

  it("`search <query> --session` narrows results through the CLI", async () => {
    const db = openStore(dbPath);
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES
       ('m1', 'sf-1', 'sess-a', 'u1', 0, 'user', '2026-05-10T00:00:00.000Z', '/repo', 'main', 'cli alamo keyword a', 0),
       ('m2', 'sf-2', 'sess-b', 'u2', 0, 'user', '2026-05-10T00:01:00.000Z', '/repo', 'main', 'cli alamo keyword b', 0)`,
    ).run();
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["search", "alamo", "--session", "sess-b", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(1);
    expect(parsed.hits.map((h: { messageId: string }) => h.messageId)).toEqual(["m2"]);
  });

  it("`search` returns non-zero when no query is given", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["search"]);
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("`search` returns non-zero when the store does not exist", async () => {
    process.env.LORE_DB = join(dir, "absent.db");
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["search", "alamo"]);
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("`search` returns a friendly error when the store exists but lacks FTS schema", async () => {
    const stale = new Database(dbPath);
    stale.exec("CREATE TABLE messages (message_id TEXT PRIMARY KEY, text TEXT)");
    stale.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["search", "alamo"]);
    spy.mockRestore();

    const stderr = writes.join("");
    expect(code).toBe(1);
    expect(stderr).toContain("Run `lore setup` or `lore index <dir>` first");
    expect(stderr).not.toContain("messages_fts");
    expect(stderr.toLowerCase()).not.toContain("sqlite");
  });

  it("`sessions` returns a friendly error when the store exists but lacks schema", async () => {
    const stale = new Database(dbPath);
    stale.exec("CREATE TABLE unrelated (id TEXT PRIMARY KEY)");
    stale.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["sessions"]);
    spy.mockRestore();

    const stderr = writes.join("");
    expect(code).toBe(1);
    expect(stderr).toContain("Run `lore setup` or `lore index <dir>` first");
    expect(stderr).not.toContain("messages");
    expect(stderr.toLowerCase()).not.toContain("sqlite");
  });

  it("`sessions` lists session rollups from the store", async () => {
    const db = openStore(dbPath);
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('m1', 'sf-1', 'sess-roll', 'u1', 0, 'user', '2026-05-10T00:00:00.000Z', '/repo', 'main', 'hello', 0)`,
    ).run();
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["sessions", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].sessionId).toBe("sess-roll");
  });

  it("`sessions --project --limit` filters and limits through the CLI", async () => {
    const db = openStore(dbPath);
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES
       ('m1', 'sf-1', 'sess-a', 'u1', 0, 'user', '2026-05-10T00:00:00.000Z', '/repo-a', 'main', 'hello', 0),
       ('m2', 'sf-2', 'sess-b', 'u2', 0, 'user', '2026-05-10T00:01:00.000Z', '/repo-a', 'main', 'hello', 0),
       ('m3', 'sf-3', 'sess-c', 'u3', 0, 'user', '2026-05-10T00:02:00.000Z', '/repo-b', 'main', 'hello', 0)`,
    ).run();
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["sessions", "--project", "/repo-a", "--limit", "1", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].sessionId).toBe("sess-b");
    expect(parsed.sessions[0].project).toBe("/repo-a");
  });

  it("`sample <dir>` prints a format summary an onboarding agent can act on", async () => {
    const lines = [
      JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "summary", summary: "meta" }),
    ];
    await writeFile(join(dir, "roll.jsonl"), lines.join("\n") + "\n");

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["sample", dir]);
    spy.mockRestore();

    expect(code).toBe(0);
    const out = writes.join("");
    expect(out).toContain("roll.jsonl");
    expect(out).toContain("user");
    expect(out).toContain("summary");
  });

  it("`index --source <name>` rejects an unknown source without writing", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["index", dir, "--source", "nope"]);
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("`get <id>` returns an elided snippet by default and full text with --full", async () => {
    const longText = "needle " + "filler ".repeat(400) + "tailmarker";
    const db = openStore(dbPath);
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('m1', 'sf-1', 'sess-get', 'u1', 0, 'assistant', '2026-05-10T00:00:00.000Z', '/repo', 'main', ?, 0)`,
    ).run(longText);
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const elidedCode = await runCli(["get", "m1", "--json"]);
    const elided = JSON.parse(writes.join(""));
    writes.length = 0;
    const fullCode = await runCli(["get", "m1", "--full", "--json"]);
    const full = JSON.parse(writes.join(""));
    spy.mockRestore();

    expect(elidedCode).toBe(0);
    expect(fullCode).toBe(0);
    expect(elided.messageId).toBe("m1");
    expect(full.text).toContain("tailmarker");
    expect(elided.text.length).toBeLessThan(full.text.length);
  });

  it("`get <id>` returns a not_found envelope and non-zero for an unknown id", async () => {
    openStore(dbPath).close();
    const writes: string[] = [];
    const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["get", "nope", "--json"]);
    out.mockRestore();
    err.mockRestore();
    expect(code).toBe(1);
    expect(JSON.parse(writes.join("")).error).toBe("not_found");
  });

  it("`get` returns non-zero when the store does not exist", async () => {
    process.env.LORE_DB = join(dir, "absent.db");
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["get", "m1"]);
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("`context <id>` returns a bounded ordered window with the anchor flagged", async () => {
    const db = openStore(dbPath);
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
         VALUES (?, 'sf-1', 'sess-ctx', ?, ?, 'user', '2026-05-10T00:00:00.000Z', '/repo', 'main', ?, 0)`,
      ).run(`c${i}`, `u${i}`, i, `body ${i}`);
    }
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["context", "c2", "--before", "1", "--after", "1", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages.map((m: { messageId: string }) => m.messageId)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(parsed.messages[1].isAnchor).toBe(true);
  });

  it("`context <id>` returns a not_found envelope and non-zero for an unknown id", async () => {
    openStore(dbPath).close();
    const writes: string[] = [];
    const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["context", "nope", "--json"]);
    out.mockRestore();
    err.mockRestore();
    expect(code).toBe(1);
    expect(JSON.parse(writes.join("")).error).toBe("not_found");
  });

  it("`session <id>` walks a bounded page and hands back a cursor to continue", async () => {
    const db = openStore(dbPath);
    for (let i = 0; i < 5; i++) {
      const ts = `2026-05-10T00:00:0${i}.000Z`;
      db.prepare(
        `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
         VALUES (?, 'sf-1', 'sess-walk', ?, ?, 'user', ?, '/repo', 'main', ?, 0)`,
      ).run(`s${i}`, `u${i}`, i, ts, `body ${i}`);
    }
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code1 = await runCli(["session", "sess-walk", "--limit", "2", "--json"]);
    const page1 = JSON.parse(writes.join(""));
    writes.length = 0;
    const code2 = await runCli([
      "session",
      "sess-walk",
      "--limit",
      "2",
      "--cursor",
      page1.nextCursor,
      "--json",
    ]);
    const page2 = JSON.parse(writes.join(""));
    spy.mockRestore();

    expect(code1).toBe(0);
    expect(code2).toBe(0);
    expect(page1.messages.map((m: { messageId: string }) => m.messageId)).toEqual(["s0", "s1"]);
    expect(page1.nextCursor).not.toBeNull();
    expect(page2.messages.map((m: { messageId: string }) => m.messageId)).toEqual(["s2", "s3"]);
  });

  it("`session <id> --around <msg>` returns the folded window with the anchor flagged", async () => {
    const db = openStore(dbPath);
    for (let i = 0; i < 5; i++) {
      const ts = `2026-05-10T00:00:0${i}.000Z`;
      db.prepare(
        `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
         VALUES (?, 'sf-1', 'sess-around', ?, ?, 'user', ?, '/repo', 'main', ?, 0)`,
      ).run(`a${i}`, `u${i}`, i, ts, `body ${i}`);
    }
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli([
      "session",
      "sess-around",
      "--around",
      "a2",
      "--before",
      "1",
      "--after",
      "1",
      "--json",
    ]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.messages.map((m: { messageId: string }) => m.messageId)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
    expect(parsed.messages[1].isAnchor).toBe(true);
  });

  it("`session --around <unknown>` returns a not_found envelope and non-zero", async () => {
    const db = openStore(dbPath);
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('only', 'sf-1', 'sess-x', 'u0', 0, 'user', '2026-05-10T00:00:00.000Z', '/repo', 'main', 'hi', 0)`,
    ).run();
    db.close();

    const writes: string[] = [];
    const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["session", "sess-x", "--around", "nope", "--json"]);
    out.mockRestore();
    err.mockRestore();
    expect(code).toBe(1);
    expect(JSON.parse(writes.join("")).error).toBe("not_found");
  });

  it("`search --relevant` reranks so a fresh memory beats an older equal-keyword one", async () => {
    const db = openStore(dbPath);
    const recent = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('old', 'sf-1', 'sess-rel', 'u0', 0, 'user', '2020-01-01T00:00:00.000Z', '/repo', 'main', 'alamo battle history', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('new', 'sf-1', 'sess-rel', 'u1', 1, 'user', ?, '/repo', 'main', 'alamo recent note', 0)`,
    ).run(recent);
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["search", "alamo", "--relevant", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(2);
    // Same envelope as plain search ({count, hits}); recency lifts "new" to the top.
    expect(parsed.hits[0].messageId).toBe("new");
  });

  it("`timeline --json` returns bucketed activity in the MCP envelope shape", async () => {
    const db = openStore(dbPath);
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('t0', 'sf-1', 'sess-tl', 'u0', 0, 'user', '2026-05-10T00:00:00.000Z', '/repo', 'main', 'a', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO messages (message_id, source_file_id, session_id, uuid, seq, role, timestamp, project, branch, text, text_truncated)
       VALUES ('t1', 'sf-1', 'sess-tl', 'u1', 1, 'user', '2026-05-11T00:00:00.000Z', '/repo', 'main', 'b', 0)`,
    ).run();
    db.close();

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["timeline", "--json"]);
    spy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.buckets.map((b: { bucket: string }) => b.bucket)).toEqual([
      "2026-05-10",
      "2026-05-11",
    ]);
    expect(parsed.buckets.every((b: { count: number }) => b.count === 1)).toBe(true);
  });

  it("`push` ingests a valid stdin batch and makes it searchable without the MCP server", async () => {
    const { code, out } = await runWithStdin(["push"], JSON.stringify(VALID_PUSH_BATCH));
    expect(code).toBe(0);
    const result = JSON.parse(out);
    expect(result.messages).toBe(1);

    const db = openStore(dbPath);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
    db.close();
  });

  it("`push` is idempotent — re-pushing the same batch keeps one message", async () => {
    await runWithStdin(["push"], JSON.stringify(VALID_PUSH_BATCH));
    const { code } = await runWithStdin(["push"], JSON.stringify(VALID_PUSH_BATCH));
    expect(code).toBe(0);

    const db = openStore(dbPath);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
    db.close();
  });

  it("`push` reports an invalid_batch envelope and non-zero for malformed JSON", async () => {
    const { code, out } = await runWithStdin(["push"], "not json {");
    expect(code).toBe(1);
    expect(JSON.parse(out).error).toBe("invalid_batch");
  });

  it("`push` reports an invalid_batch envelope and non-zero for a schema-invalid batch", async () => {
    const { code, out } = await runWithStdin(["push"], "{}");
    expect(code).toBe(1);
    expect(JSON.parse(out).error).toBe("invalid_batch");
  });

  it("`setup --home <dir>` indexes detected sources and prints the registration guide", async () => {
    const projDir = join(dir, ".claude", "projects", "proj");
    await mkdir(projDir, { recursive: true });
    const transcript =
      JSON.stringify({
        type: "user",
        uuid: "u1",
        parentUuid: null,
        timestamp: "2026-05-10T00:00:00.000Z",
        sessionId: "sess-setup",
        cwd: "/repo",
        gitBranch: "main",
        message: { role: "user", content: "setup verification keyword" },
      }) + "\n";
    await writeFile(join(projDir, "sess.jsonl"), transcript);

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await runCli(["setup", "--home", dir]);
    spy.mockRestore();

    expect(code).toBe(0);
    const out = writes.join("");
    expect(out).toContain("claude-code");
    expect(out).toContain("claude mcp add lore");

    const db = openStore(dbPath);
    expect(searchMemory(db, "keyword").length).toBeGreaterThan(0);
    db.close();
  });
});
