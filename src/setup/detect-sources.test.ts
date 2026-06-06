import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectSources } from "./detect-sources.js";

describe("detectSources", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "recall-detect-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("returns nothing for a home dir with no known transcript locations", async () => {
    const found = await detectSources(home);
    expect(found).toEqual([]);
  });

  it("detects claude-code transcripts under ~/.claude/projects with a file count", async () => {
    const dir = join(home, ".claude", "projects", "myproj");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "session-a.jsonl"), "{}\n");
    await writeFile(join(dir, "session-b.jsonl"), "{}\n");

    const found = await detectSources(home);

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe("claude-code");
    expect(found[0]?.dir).toBe(join(home, ".claude", "projects"));
    expect(found[0]?.fileCount).toBe(2);
  });

  it("detects codex rollout transcripts under ~/.codex/archived_sessions", async () => {
    const dir = join(home, ".codex", "archived_sessions");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "rollout-2026-a.jsonl"), "{}\n");

    const found = await detectSources(home);

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe("codex");
    expect(found[0]?.fileCount).toBe(1);
  });
});
