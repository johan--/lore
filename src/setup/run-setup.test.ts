import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../core/store/open-store.js";
import { runSetup } from "./run-setup.js";

function userLine(text: string): string {
  return JSON.stringify({
    type: "user",
    uuid: "u-1",
    parentUuid: null,
    timestamp: "2026-05-10T03:53:45.638Z",
    sessionId: "sess-1",
    cwd: "/repo",
    gitBranch: "main",
    message: { role: "user", content: text },
  });
}

describe("runSetup", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "recall-setup-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("reports no sources and stays unverified when nothing is on disk", async () => {
    const db = openStore(":memory:");
    const result = await runSetup(db, home);
    expect(result.indexed).toEqual([]);
    expect(result.verified).toBe(false);
    db.close();
  });

  it("detects, indexes, and verifies a claude-code transcript end to end", async () => {
    const dir = join(home, ".claude", "projects", "proj");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "sess.jsonl"), userLine("remember the alamo") + "\n");

    const db = openStore(":memory:");
    const result = await runSetup(db, home);

    expect(result.indexed).toHaveLength(1);
    expect(result.indexed[0]?.source).toBe("claude-code");
    expect(result.indexed[0]?.messages).toBeGreaterThan(0);
    expect(result.verified).toBe(true);
    db.close();
  });
});
