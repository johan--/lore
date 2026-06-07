import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAdapterConformance } from "./conformance.js";
import { claudeCodeAdapter } from "./claude-code/adapter.js";

const representativeLine = JSON.stringify({
  type: "user",
  uuid: "u1",
  parentUuid: null,
  timestamp: "2026-05-10T00:00:00.000Z",
  sessionId: "sess-a",
  cwd: "/repo",
  gitBranch: "main",
  message: { role: "user", content: "conformance representative line" },
});

const metaLine = JSON.stringify({ type: "summary", summary: "not a message" });

describe("checkAdapterConformance", () => {
  it("passes the reference Claude Code adapter on parse checks", async () => {
    const report = await checkAdapterConformance(claudeCodeAdapter, {
      representativeLine,
      metaLine,
    });
    expect(report.source).toBe("claude-code");
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });
});

describe("checkAdapterConformance — discovery", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-conformance-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("verifies discovery finds and tags files under a sample tree", async () => {
    await writeFile(join(dir, "sess-a.jsonl"), representativeLine + "\n");
    const nested = join(dir, "sess-a", "subagents");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "agent-xyz.jsonl"), representativeLine + "\n");

    const report = await checkAdapterConformance(claudeCodeAdapter, {
      representativeLine,
      metaLine,
      sampleRoot: dir,
    });
    expect(report.passed).toBe(true);
    const discovery = report.checks.find((c) => c.name === "discovers-sample-tree");
    expect(discovery?.passed).toBe(true);
  });
});

describe("checkAdapterConformance — failure reporting", () => {
  it("fails a check when a representative line does not parse", async () => {
    const report = await checkAdapterConformance(claudeCodeAdapter, {
      representativeLine: metaLine, // a meta line cannot be a representative message
      metaLine,
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.name === "parses-representative-line")?.passed).toBe(false);
  });
});
