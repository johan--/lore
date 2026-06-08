import { describe, it, expect } from "vitest";
import { getAdapter, adapterSources, makeRegistry } from "./registry.js";
import type { SourceAdapter } from "./contract.js";
import { lineIngest } from "../core/indexer/line-ingest.js";

describe("adapter registry", () => {
  it("resolves the built-in Claude Code adapter by source name", () => {
    const adapter = getAdapter("claude-code");
    expect(adapter?.source).toBe("claude-code");
  });

  it("returns undefined for an unknown source", () => {
    expect(getAdapter("nope")).toBeUndefined();
  });

  it("lists the registered source names", () => {
    expect(adapterSources()).toContain("claude-code");
  });

  it("registers an additional adapter into an isolated registry", () => {
    const stub: SourceAdapter = {
      source: "codex",
      discover: async () => [],
      ingest: lineIngest({
        source: "codex",
        parseLine: () => ({ kind: "skipped", reason: "stub" }),
      }),
    };
    const registry = makeRegistry([stub]);
    expect(registry.get("codex")?.source).toBe("codex");
    expect(registry.sources()).toEqual(["codex"]);
    expect(registry.get("claude-code")).toBeUndefined();
  });
});
