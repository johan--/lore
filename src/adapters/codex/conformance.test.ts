import { describe, it, expect } from "vitest";
import { checkAdapterConformance } from "../conformance.js";
import { codexAdapter } from "./adapter.js";

describe("codex adapter conformance", () => {
  it("passes the universal adapter contract checks", async () => {
    const report = await checkAdapterConformance(codexAdapter, {
      representativeLine: JSON.stringify({
        timestamp: "2026-03-26T21:51:42.067Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "fix the routing bug" }],
        },
      }),
      metaLine: JSON.stringify({
        timestamp: "2026-03-26T21:51:42.065Z",
        type: "session_meta",
        payload: { id: "abc", cwd: "/repo" },
      }),
    });
    expect(report.passed).toBe(true);
    expect(report.source).toBe("codex");
  });
});
