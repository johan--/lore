import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, type Store } from "../core/store/open-store.js";
import { searchMemory } from "../core/search/search-memory.js";
import { indexFromHookPayload } from "./index-current.js";

let dir: string;
let db: Store;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "recall-hook-"));
  db = openStore(":memory:");
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function userLine(text: string): string {
  return JSON.stringify({
    type: "user",
    uuid: "u1",
    parentUuid: null,
    timestamp: "2026-05-10T00:00:00.000Z",
    sessionId: SESSION,
    cwd: "/repo",
    gitBranch: "main",
    message: { role: "user", content: text },
  });
}

describe("indexFromHookPayload", () => {
  it("indexes the transcript named by a hook payload's transcript_path", async () => {
    const path = join(dir, `${SESSION}.jsonl`);
    await writeFile(path, userLine("compaction survival alamo") + "\n", "utf8");

    const result = await indexFromHookPayload(db, JSON.stringify({ transcript_path: path }));
    expect(result.indexed).toBe(true);
    expect(searchMemory(db, "alamo")).toHaveLength(1);
  });

  it("is a no-op (no throw) when the payload has no transcript_path", async () => {
    const result = await indexFromHookPayload(db, JSON.stringify({ session_id: SESSION }));
    expect(result.indexed).toBe(false);
  });

  it("is a no-op (no throw) on malformed JSON so it never crashes the harness", async () => {
    const result = await indexFromHookPayload(db, "{not valid json");
    expect(result.indexed).toBe(false);
  });
});
