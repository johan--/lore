import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAdapterConformance } from "../conformance.js";
import { openclawAdapter } from "./adapter.js";

// Trimmed from a real openclaw session (encrypted thinking content elided):
// a session meta line, a model_change meta line, a user message, an assistant
// message with an embedded toolCall, and a standalone toolResult line.
const sessionLine = JSON.stringify({
  type: "session",
  version: 3,
  id: "f0c5dce0",
  timestamp: "2026-03-19T08:17:14.994Z",
  cwd: "/Users/dev/.openclaw/workspace",
});
const modelChangeLine = JSON.stringify({
  type: "model_change",
  id: "386eaf56",
  parentId: null,
  timestamp: "2026-03-19T08:17:14.997Z",
  provider: "openai-codex",
  modelId: "gpt-5.3-codex",
});
const userLine = JSON.stringify({
  type: "message",
  id: "6ad08fac",
  parentId: "08ff2097",
  timestamp: "2026-03-19T08:17:15.004Z",
  message: { role: "user", content: [{ type: "text", text: "find the routing haystack" }] },
});
const assistantLine = JSON.stringify({
  type: "message",
  id: "f6c63ef7",
  parentId: "6ad08fac",
  timestamp: "2026-03-19T08:20:08.587Z",
  message: {
    role: "assistant",
    content: [
      { type: "text", text: "logging in" },
      { type: "toolCall", id: "call_z1", name: "whatsapp_login", arguments: { action: "start" } },
    ],
  },
});
const toolResultLine = JSON.stringify({
  type: "message",
  id: "420558f6",
  parentId: "f6c63ef7",
  timestamp: "2026-03-19T08:20:38.686Z",
  message: {
    role: "toolResult",
    toolCallId: "call_z1",
    toolName: "whatsapp_login",
    content: [{ type: "text", text: "Failed to get QR" }],
    isError: false,
  },
});

describe("openclaw adapter conformance", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-openclaw-conf-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes the universal adapter contract end to end", async () => {
    const sessions = join(dir, "agents", "main", "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(
      join(sessions, "f0c5dce0-89f3-42ce-b3d8-71c17a11ba9e.jsonl"),
      [sessionLine, modelChangeLine, userLine, assistantLine, toolResultLine].join("\n") + "\n",
    );

    const report = await checkAdapterConformance(openclawAdapter, {
      sampleRoot: dir,
      searchQuery: "haystack",
      expectedText: "haystack",
    });
    expect(report.source).toBe("openclaw");
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });
});
