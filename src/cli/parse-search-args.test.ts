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

  it("ignores an unknown flag and its value rather than treating either as the query", () => {
    const { query, opts } = parseSearchArgs(["--bogus", "alamo"]);
    expect(query).toBeUndefined();
    expect(opts).not.toHaveProperty("bogus");
  });

  it("does not consume another flag as a missing search flag value", () => {
    const { query, opts } = parseSearchArgs(["alamo", "--project", "--branch", "main"]);
    expect(query).toBe("alamo");
    expect(opts.project).toBeUndefined();
    expect(opts.branch).toBe("main");
  });

  it("does not consume another flag as a missing search limit value", () => {
    const { opts, json } = parseSearchArgs(["alamo", "--limit", "--json"]);
    expect(opts.limit).toBeUndefined();
    expect(json).toBe(true);
  });

  it("parses --relevant as a boolean and keeps it out of the query", () => {
    const { query, relevant } = parseSearchArgs(["alamo", "--relevant"]);
    expect(relevant).toBe(true);
    expect(query).toBe("alamo");
  });

  it("defaults relevant to false when the flag is absent", () => {
    expect(parseSearchArgs(["alamo"]).relevant).toBe(false);
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

  it("does not consume another flag as a missing sessions flag value", () => {
    const { opts } = parseSessionsArgs(["--project", "--source", "codex"]);
    expect(opts.project).toBeUndefined();
    expect(opts.source).toBe("codex");
  });

  it("does not consume another flag as a missing sessions limit value", () => {
    const { opts, json } = parseSessionsArgs(["--limit", "--json"]);
    expect(opts.limit).toBeUndefined();
    expect(json).toBe(true);
  });
});
