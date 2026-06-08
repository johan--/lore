import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAdapterConformance } from "./conformance.js";
import { claudeCodeAdapter } from "./claude-code/adapter.js";

const messageLine = JSON.stringify({
  type: "user",
  uuid: "u1",
  parentUuid: null,
  timestamp: "2026-05-10T00:00:00.000Z",
  sessionId: "sess-a",
  cwd: "/repo",
  gitBranch: "main",
  message: { role: "user", content: "conformance representative haystack" },
});

const metaLine = JSON.stringify({ type: "summary", summary: "not a message" });

describe("checkAdapterConformance", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-conformance-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes the reference Claude Code adapter end to end", async () => {
    await writeFile(join(dir, "sess-a.jsonl"), messageLine + "\n" + metaLine + "\n");
    const nested = join(dir, "sess-a", "subagents");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "agent-xyz.jsonl"), messageLine + "\n");

    const report = await checkAdapterConformance(claudeCodeAdapter, {
      sampleRoot: dir,
      searchQuery: "haystack",
      expectedText: "haystack",
    });
    expect(report.source).toBe("claude-code");
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails loudly when the expected record does not round-trip", async () => {
    await writeFile(join(dir, "sess-a.jsonl"), messageLine + "\n" + metaLine + "\n");

    const report = await checkAdapterConformance(claudeCodeAdapter, {
      sampleRoot: dir,
      searchQuery: "needle-not-present",
      expectedText: "needle-not-present",
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.name === "round-trip-search")?.passed).toBe(false);
  });

  it("fails when discovery finds nothing in an empty tree", async () => {
    const report = await checkAdapterConformance(claudeCodeAdapter, {
      sampleRoot: dir,
      searchQuery: "haystack",
      expectedText: "haystack",
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.name === "discovers-sample-tree")?.passed).toBe(false);
  });
});
