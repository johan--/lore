import { describe, it, expect } from "vitest";
import { getOpenclawFileMetadata, parseOpenclawLine } from "./parse-line.js";
import type { ParseContext } from "../contract.js";

const ctx: ParseContext = {
  sourceFileId: "session-x.jsonl",
  sessionId: "session-x",
  seq: 3,
  source: "openclaw",
};

describe("parseOpenclawLine", () => {
  it("parses a user message into a normalized message", () => {
    const line = JSON.stringify({
      type: "message",
      id: "6ad08fac",
      parentId: "08ff2097",
      timestamp: "2026-03-19T08:17:15.004Z",
      message: { role: "user", content: [{ type: "text", text: "how do i message you" }] },
    });
    const out = parseOpenclawLine(line, ctx);
    expect(out.kind).toBe("parsed");
    if (out.kind !== "parsed") return;
    expect(out.parsed.message.role).toBe("user");
    expect(out.parsed.message.text).toBe("how do i message you");
    expect(out.parsed.message.uuid).toBe("6ad08fac");
    expect(out.parsed.message.parentUuid).toBe("08ff2097");
    expect(out.parsed.message.timestamp).toBe("2026-03-19T08:17:15.004Z");
    expect(out.parsed.toolCalls).toHaveLength(0);
  });

  it("joins text and thinking blocks into searchable text", () => {
    const line = JSON.stringify({
      type: "message",
      id: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "let me reason" },
          { type: "text", text: "here is the answer" },
        ],
      },
    });
    const out = parseOpenclawLine(line, ctx);
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.role).toBe("assistant");
    expect(out.parsed.message.text).toBe("let me reason\nhere is the answer");
  });

  it("extracts an embedded toolCall block as a tool call record", () => {
    const line = JSON.stringify({
      type: "message",
      id: "f6c63ef7",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "logging in" },
          {
            type: "toolCall",
            id: "call_zIbx",
            name: "whatsapp_login",
            arguments: { action: "start", force: true },
          },
        ],
      },
    });
    const out = parseOpenclawLine(line, ctx);
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.role).toBe("assistant");
    expect(out.parsed.toolCalls).toHaveLength(1);
    expect(out.parsed.toolCalls[0]?.toolName).toBe("whatsapp_login");
    expect(out.parsed.toolCalls[0]?.toolUseId).toBe("call_zIbx");
    expect(out.parsed.toolCalls[0]?.input).toBe('{"action":"start","force":true}');
    expect(out.parsed.toolCalls[0]?.result).toBeNull();
  });

  it("turns a toolResult message into a system message paired by toolCallId", () => {
    const line = JSON.stringify({
      type: "message",
      id: "420558f6",
      message: {
        role: "toolResult",
        toolCallId: "call_zIbx",
        toolName: "whatsapp_login",
        content: [{ type: "text", text: "Failed to get QR" }],
        isError: false,
      },
    });
    const out = parseOpenclawLine(line, ctx);
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.role).toBe("system");
    expect(out.parsed.message.text).toContain("Failed to get QR");
    expect(out.parsed.toolCalls).toHaveLength(1);
    expect(out.parsed.toolCalls[0]?.toolUseId).toBe("call_zIbx");
    expect(out.parsed.toolCalls[0]?.toolName).toBe("whatsapp_login");
    expect(out.parsed.toolCalls[0]?.result).toContain("Failed to get QR");
    expect(out.parsed.toolCalls[0]?.isError).toBe(false);
  });

  it("attaches file-level metadata to parsed messages", () => {
    const line = JSON.stringify({
      type: "message",
      id: "a2",
      message: { role: "assistant", content: [{ type: "text", text: "with metadata" }] },
    });
    const out = parseOpenclawLine(line, {
      ...ctx,
      fileMetadata: { project: "/work", branch: null, model: "gpt-5.3-codex", agent: null },
    });
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.project).toBe("/work");
    expect(out.parsed.message.model).toBe("gpt-5.3-codex");
  });

  it("extracts file metadata from session and model_change lines", () => {
    const metadata = getOpenclawFileMetadata([
      JSON.stringify({ type: "session", id: "s", cwd: "/work", timestamp: "t" }),
      JSON.stringify({ type: "model_change", provider: "openai-codex", modelId: "gpt-5.3-codex" }),
    ]);
    expect(metadata).toEqual({
      project: "/work",
      branch: null,
      model: "gpt-5.3-codex",
      agent: null,
    });
  });

  it("skips session, model_change, thinking_level_change, and custom meta lines", () => {
    for (const type of ["session", "model_change", "thinking_level_change", "custom"]) {
      expect(parseOpenclawLine(JSON.stringify({ type }), ctx).kind).toBe("skipped");
    }
  });

  it("skips malformed JSON without throwing", () => {
    expect(parseOpenclawLine("{not json", ctx).kind).toBe("skipped");
  });
});
