import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAdapterConformance } from "../conformance.js";
import { codexAdapter } from "./adapter.js";

const metaLine = JSON.stringify({
  timestamp: "2026-03-26T21:51:42.065Z",
  type: "session_meta",
  payload: { id: "abc", cwd: "/repo" },
});

const messageLine = JSON.stringify({
  timestamp: "2026-03-26T21:51:42.067Z",
  type: "response_item",
  payload: {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: "fix the routing haystack" }],
  },
});

describe("codex adapter conformance", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-codex-conf-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes the universal adapter contract end to end", async () => {
    await writeFile(
      join(dir, "rollout-2026-03-26-abc.jsonl"),
      metaLine + "\n" + messageLine + "\n",
    );

    const report = await checkAdapterConformance(codexAdapter, {
      sampleRoot: dir,
      searchQuery: "haystack",
      expectedText: "haystack",
    });
    expect(report.source).toBe("codex");
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });
});
