import { describe, it, expect } from "vitest";
import { renderSearchResults, renderSessions } from "./render-results.js";
import type { SearchHit } from "../core/search/search-memory.js";
import type { SessionSummary } from "../core/retrieval/list-sessions.js";

function hit(over: Partial<SearchHit> = {}): SearchHit {
  return {
    messageId: "m-abc",
    sessionId: "sess-1",
    sourceFileId: "sf-1",
    source: "codex",
    role: "assistant",
    timestamp: "2026-06-05T18:22:41.103Z",
    project: "/repo",
    branch: "main",
    model: "claude-opus-4-8",
    agent: null,
    text: "switched the fts tokenizer to unicode61",
    textTruncated: false,
    score: 11.27,
    ...over,
  };
}

function session(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "sess-1",
    source: "claude-code",
    project: "/repo",
    branch: "main",
    firstTimestamp: "2026-06-01T00:00:00.000Z",
    lastTimestamp: "2026-06-05T18:22:41.103Z",
    messageCount: 42,
    ...over,
  };
}

describe("renderSearchResults", () => {
  it("renders JSON as a {count, hits} envelope", () => {
    const hits = [hit({ messageId: "m1" }), hit({ messageId: "m2" })];
    const out = renderSearchResults(hits, true);
    const parsed = JSON.parse(out);
    expect(parsed.count).toBe(2);
    expect(parsed.hits.map((h: SearchHit) => h.messageId)).toEqual(["m1", "m2"]);
  });

  it("renders an empty JSON envelope when there are no hits", () => {
    const parsed = JSON.parse(renderSearchResults([], true));
    expect(parsed).toEqual({ count: 0, hits: [] });
  });

  it("includes the message id and text in human output so an agent can fetch more", () => {
    const out = renderSearchResults([hit({ messageId: "m-xyz" })], false);
    expect(out).toContain("m-xyz");
    expect(out).toContain("source codex");
    expect(out).toContain("switched the fts tokenizer to unicode61");
  });

  it("shows a clear no-matches line in human output", () => {
    expect(renderSearchResults([], false).toLowerCase()).toContain("no matches");
  });
});

describe("renderSessions", () => {
  it("renders JSON as a {count, sessions} envelope", () => {
    const parsed = JSON.parse(renderSessions([session({ sessionId: "s1" })], true));
    expect(parsed.count).toBe(1);
    expect(parsed.sessions[0].sessionId).toBe("s1");
  });

  it("includes the session id and message count in human output", () => {
    const out = renderSessions([session({ sessionId: "sess-9", messageCount: 7 })], false);
    expect(out).toContain("sess-9");
    expect(out).toContain("7");
  });

  it("shows a clear no-sessions line in human output", () => {
    expect(renderSessions([], false).toLowerCase()).toContain("no sessions");
  });
});
