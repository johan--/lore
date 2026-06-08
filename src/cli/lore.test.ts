import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { runCli } from "./lore.js";
import { openStore } from "../core/store/open-store.js";
import { upsertSourceFile } from "../core/store/upsert.js";
import { searchMemory } from "../core/search/search-memory.js";

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
