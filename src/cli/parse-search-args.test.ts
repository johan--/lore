import { describe, it, expect } from "vitest";
import { parseSearchArgs, parseSessionsArgs } from "./parse-search-args.js";

describe("parseSearchArgs", () => {
  it("takes the first non-flag token as the query", () => {
    const { query } = parseSearchArgs(["fts tokenizer"]);
    expect(query).toBe("fts tokenizer");
  });

  it("maps value flags onto SearchOptions", () => {
    const { opts } = parseSearchArgs([
      "alamo",
      "--project",
      "/repo",
      "--session",
      "sess-2",
      "--source",
      "codex",
      "--role",
      "assistant",
      "--limit",
      "5",
    ]);
    expect(opts.project).toBe("/repo");
    expect(opts.session).toBe("sess-2");
    expect(opts.source).toBe("codex");
    expect(opts.role).toBe("assistant");
    expect(opts.limit).toBe(5);
  });

  it("parses --json as a boolean and keeps it out of the query", () => {
    const { query, json } = parseSearchArgs(["alamo", "--json"]);
    expect(json).toBe(true);
    expect(query).toBe("alamo");
  });

  it("leaves query undefined when only flags are given", () => {
    const { query } = parseSearchArgs(["--source", "codex"]);
    expect(query).toBeUndefined();
  });

  it("ignores an unknown flag rather than treating it as the query", () => {
    const { query, opts } = parseSearchArgs(["--bogus", "alamo"]);
    expect(query).toBe("alamo");
    expect(opts).not.toHaveProperty("bogus");
  });
});

describe("parseSessionsArgs", () => {
  it("maps the session-scoped value flags", () => {
    const { opts, json } = parseSessionsArgs([
      "--project",
      "/repo",
      "--source",
      "codex",
      "--limit",
      "10",
      "--json",
    ]);
    expect(opts.project).toBe("/repo");
    expect(opts.source).toBe("codex");
    expect(opts.limit).toBe(10);
    expect(json).toBe(true);
  });
});
