import { describe, it, expect } from "vitest";
import { parseCodexLine } from "./parse-line.js";
import type { ParseContext } from "../contract.js";

const ctx: ParseContext = {
  sourceFileId: "rollout-x.jsonl",
  sessionId: "rollout-x",
  seq: 3,
  source: "codex",
};

describe("parseCodexLine", () => {
  it("parses a user message response_item into a normalized message", () => {
    const line = JSON.stringify({
      timestamp: "2026-03-26T21:51:42.067Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "fix the routing bug" }],
      },
    });
    const out = parseCodexLine(line, ctx);
    expect(out.kind).toBe("parsed");
    if (out.kind !== "parsed") return;
    expect(out.parsed.message.role).toBe("user");
    expect(out.parsed.message.text).toBe("fix the routing bug");
    expect(out.parsed.message.timestamp).toBe("2026-03-26T21:51:42.067Z");
    expect(out.parsed.toolCalls).toHaveLength(0);
  });

  it("maps the developer role to system", () => {
    const line = JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "system policy" }],
      },
    });
    const out = parseCodexLine(line, ctx);
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.role).toBe("system");
  });

  it("turns a function_call into an assistant message plus a tool call", () => {
    const line = JSON.stringify({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: '{"cmd":"ls"}',
        call_id: "call_abc",
      },
    });
    const out = parseCodexLine(line, ctx);
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.role).toBe("assistant");
    expect(out.parsed.message.text).toContain("exec_command");
    expect(out.parsed.toolCalls).toHaveLength(1);
    expect(out.parsed.toolCalls[0]?.toolName).toBe("exec_command");
    expect(out.parsed.toolCalls[0]?.toolUseId).toBe("call_abc");
    expect(out.parsed.toolCalls[0]?.input).toBe('{"cmd":"ls"}');
    expect(out.parsed.toolCalls[0]?.result).toBeNull();
  });

  it("turns a function_call_output into a tool result paired by call_id", () => {
    const line = JSON.stringify({
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_abc",
        output: "total 0\nfile.txt",
      },
    });
    const out = parseCodexLine(line, ctx);
    if (out.kind !== "parsed") throw new Error("expected parsed");
    expect(out.parsed.message.text).toContain("file.txt");
    expect(out.parsed.toolCalls).toHaveLength(1);
    expect(out.parsed.toolCalls[0]?.toolUseId).toBe("call_abc");
    expect(out.parsed.toolCalls[0]?.result).toContain("file.txt");
  });

  it("skips session_meta, turn_context, event_msg, and encrypted reasoning", () => {
    for (const payloadType of ["session_meta", "turn_context", "event_msg"]) {
      const line = JSON.stringify({ type: payloadType, payload: {} });
      expect(parseCodexLine(line, ctx).kind).toBe("skipped");
    }
    const reasoning = JSON.stringify({
      type: "response_item",
      payload: { type: "reasoning", summary: [], content: null, encrypted_content: "gAAA" },
    });
    expect(parseCodexLine(reasoning, ctx).kind).toBe("skipped");
  });

  it("skips malformed JSON without throwing", () => {
    expect(parseCodexLine("{not json", ctx).kind).toBe("skipped");
  });
});
