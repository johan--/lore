import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./recall.js";
import { openStore } from "../core/store/open-store.js";
import { searchMemory } from "../core/search/search-memory.js";

let dir: string;
let dbPath: string;
let prevDb: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "recall-cli-"));
  dbPath = join(dir, "recall.db");
  prevDb = process.env.RECALL_DB;
  process.env.RECALL_DB = dbPath;
});

afterEach(async () => {
  if (prevDb === undefined) delete process.env.RECALL_DB;
  else process.env.RECALL_DB = prevDb;
  await rm(dir, { recursive: true, force: true });
});

describe("recall CLI", () => {
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
});
