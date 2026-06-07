import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTranscripts } from "./discover.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "lore-disc-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const SESSION = "11111111-2222-3333-4444-555555555555";

describe("discoverTranscripts", () => {
  it("finds both primary and nested subagent files with correct kind", async () => {
    await writeFile(join(root, `${SESSION}.jsonl`), "{}\n", "utf8");
    const subDir = join(root, SESSION, "subagents");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "agent-a555e804c9bf7ebe7.jsonl"), "{}\n", "utf8");

    const found = await discoverTranscripts(root);
    const primary = found.filter((f) => f.kind === "primary");
    const subagent = found.filter((f) => f.kind === "subagent");

    expect(primary).toHaveLength(1);
    expect(subagent).toHaveLength(1);
    expect(primary[0]?.path).toContain(`${SESSION}.jsonl`);
  });

  it("derives the parent session id for a subagent file from its path", async () => {
    const subDir = join(root, SESSION, "subagents");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "agent-a555e804c9bf7ebe7.jsonl"), "{}\n", "utf8");

    const found = await discoverTranscripts(root);
    const sub = found.find((f) => f.kind === "subagent");
    expect(sub?.sessionId).toBe(SESSION);
    expect(sub?.agentFile).toBe("agent-a555e804c9bf7ebe7");
  });

  it("leaves session id null for a primary file (inferred at index time)", async () => {
    await writeFile(join(root, `${SESSION}.jsonl`), "{}\n", "utf8");
    const found = await discoverTranscripts(root);
    const primary = found.find((f) => f.kind === "primary");
    expect(primary?.sessionId).toBeNull();
  });
});
