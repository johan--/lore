import { describe, it, expect } from "vitest";
import { parseLine } from "./parse-line.js";

const baseCtx = {
  sourceFileId: "sf-1",
  sessionId: "sess-1",
  source: "claude-code" as const,
};

function userLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "user",
    uuid: "u-1",
    parentUuid: null,
    timestamp: "2026-05-10T03:53:45.638Z",
    sessionId: "sess-1",
    cwd: "/Users/jordanhindo/claude-lives",
    gitBranch: "main",
    message: { role: "user", content: "remember the alamo" },
    ...overrides,
  });
}

describe("parseLine — user message", () => {
  it("parses a user line into a typed message record with provenance", () => {
    const outcome = parseLine(userLine(), { ...baseCtx, seq: 0 });
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    const { message } = outcome.parsed;
    expect(message.role).toBe("user");
    expect(message.text).toContain("remember the alamo");
    expect(message.sessionId).toBe("sess-1");
    expect(message.uuid).toBe("u-1");
    expect(message.parentUuid).toBeNull();
    expect(message.seq).toBe(0);
    expect(message.project).toBe("/Users/jordanhindo/claude-lives");
    expect(message.branch).toBe("main");
    expect(message.textTruncated).toBe(false);
  });

  it("derives a deterministic messageId from sourceFileId + uuid + seq", () => {
    const a = parseLine(userLine(), { ...baseCtx, seq: 5 });
    const b = parseLine(userLine(), { ...baseCtx, seq: 5 });
    const c = parseLine(userLine(), { ...baseCtx, seq: 6 });
    if (a.kind !== "parsed" || b.kind !== "parsed" || c.kind !== "parsed") {
      throw new Error("expected parsed");
    }
    expect(a.parsed.message.messageId).toBe(b.parsed.message.messageId);
    expect(a.parsed.message.messageId).not.toBe(c.parsed.message.messageId);
  });

  it("truncates and flags an oversized line instead of crashing", () => {
    const huge = "x".repeat(5_000_000);
    const outcome = parseLine(userLine({ message: { role: "user", content: huge } }), {
      ...baseCtx,
      seq: 0,
      maxTextChars: 1000,
    });
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    expect(outcome.parsed.message.text.length).toBe(1000);
    expect(outcome.parsed.message.textTruncated).toBe(true);
  });
});

describe("parseLine — assistant message", () => {
  function assistantLine(content: unknown, model = "claude-opus-4-8"): string {
    return JSON.stringify({
      type: "assistant",
      uuid: "a-1",
      parentUuid: "u-1",
      timestamp: "2026-05-10T03:53:51.433Z",
      sessionId: "sess-1",
      cwd: "/repo",
      gitBranch: "main",
      message: { role: "assistant", model, content },
    });
  }

  it("extracts text and thinking blocks and the model", () => {
    const outcome = parseLine(
      assistantLine([
        { type: "thinking", thinking: "let me think" },
        { type: "text", text: "the answer is 42" },
      ]),
      { ...baseCtx, seq: 1 },
    );
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    expect(outcome.parsed.message.text).toContain("let me think");
    expect(outcome.parsed.message.text).toContain("the answer is 42");
    expect(outcome.parsed.message.model).toBe("claude-opus-4-8");
  });

  it("extracts tool_use blocks into tool calls", () => {
    const outcome = parseLine(
      assistantLine([{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } }]),
      { ...baseCtx, seq: 1 },
    );
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    expect(outcome.parsed.toolCalls).toHaveLength(1);
    const call = outcome.parsed.toolCalls[0];
    expect(call?.toolName).toBe("Bash");
    expect(call?.toolUseId).toBe("toolu_1");
    expect(call?.input).toContain("ls");
  });
});

describe("parseLine — tool_result and meta", () => {
  it("extracts tool_result content from a user line", () => {
    const line = JSON.stringify({
      type: "user",
      uuid: "u-2",
      parentUuid: "a-1",
      timestamp: "2026-05-10T03:54:00.000Z",
      sessionId: "sess-1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "file1.txt" }],
      },
    });
    const outcome = parseLine(line, { ...baseCtx, seq: 2 });
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    expect(outcome.parsed.toolCalls).toHaveLength(1);
    expect(outcome.parsed.toolCalls[0]?.result).toContain("file1.txt");
    expect(outcome.parsed.toolCalls[0]?.toolUseId).toBe("toolu_1");
  });

  it("parses a system line via top-level content", () => {
    const line = JSON.stringify({
      type: "system",
      uuid: "s-1",
      parentUuid: null,
      timestamp: "2026-05-10T04:01:11.610Z",
      sessionId: "sess-1",
      content: "hook fired",
    });
    const outcome = parseLine(line, { ...baseCtx, seq: 3 });
    if (outcome.kind !== "parsed") throw new Error("expected parsed");
    expect(outcome.parsed.message.role).toBe("system");
    expect(outcome.parsed.message.text).toContain("hook fired");
  });

  it("skips unknown/meta line types with a reason", () => {
    const line = JSON.stringify({ type: "queue-operation", operation: "enqueue" });
    const outcome = parseLine(line, { ...baseCtx, seq: 4 });
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind !== "skipped") return;
    expect(outcome.reason).toContain("queue-operation");
  });

  it("skips malformed JSON with a reason instead of throwing", () => {
    const outcome = parseLine("{not json", { ...baseCtx, seq: 0 });
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind !== "skipped") return;
    expect(outcome.reason).toBe("json-parse-error");
  });
});
