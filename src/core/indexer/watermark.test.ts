import { describe, it, expect } from "vitest";
import { planByteReindex, planHashReindex, planReindex, planRowidReindex } from "./watermark.js";
import type { ByteResumeToken, HashResumeToken, RowidResumeToken } from "../records.js";

const byteToken = (over: Partial<ByteResumeToken> = {}): ByteResumeToken => ({
  kind: "byte",
  byteOffset: 100,
  lineCount: 10,
  prefixSha256: "headhash",
  mtime: "2026-05-10T00:00:00.000Z",
  ...over,
});

describe("planByteReindex", () => {
  it("full re-index when the file was never seen", () => {
    expect(planByteReindex(null, { size: 100, mtime: "t" }, "h")).toEqual({ mode: "full" });
  });

  it("skips when size and mtime are unchanged", () => {
    const prior = byteToken();
    const plan = planByteReindex(prior, { size: 100, mtime: prior.mtime! }, "headhash");
    expect(plan).toEqual({ mode: "skip" });
  });

  it("appends from the prior token when the file grew with a matching head", () => {
    const prior = byteToken();
    const plan = planByteReindex(
      prior,
      { size: 250, mtime: "2026-05-11T00:00:00.000Z" },
      "headhash",
    );
    expect(plan).toEqual({ mode: "append", from: prior });
  });

  it("full re-index when the file shrank below the watermark (truncated/rotated)", () => {
    const prior = byteToken({ byteOffset: 500 });
    expect(planByteReindex(prior, { size: 100, mtime: "t" }, "headhash")).toEqual({ mode: "full" });
  });

  it("full re-index when the head hash changed (in-place rewrite)", () => {
    const prior = byteToken();
    const plan = planByteReindex(prior, { size: 300, mtime: "t" }, "differenthash");
    expect(plan).toEqual({ mode: "full" });
  });

  it("full re-indexes when the head hash cannot be verified", () => {
    const prior = byteToken();
    const plan = planByteReindex(prior, { size: 300, mtime: "t" }, null);
    expect(plan).toEqual({ mode: "full" });
  });
});

describe("planRowidReindex", () => {
  const prior: RowidResumeToken = { kind: "rowid", value: 42 };

  it("full re-index when never seen", () => {
    expect(planRowidReindex(null, 42)).toEqual({ mode: "full" });
  });

  it("skips when the max row id is unchanged", () => {
    expect(planRowidReindex(prior, 42)).toEqual({ mode: "skip" });
  });

  it("full re-index when the already-indexed prefix fingerprint changed", () => {
    const token: RowidResumeToken = { kind: "rowid", value: 42, fingerprint: "old" };
    expect(planRowidReindex(token, 42, "new")).toEqual({ mode: "full" });
  });

  it("appends when new rows exist and the already-indexed prefix is unchanged", () => {
    const token: RowidResumeToken = { kind: "rowid", value: 42, fingerprint: "same" };
    expect(planRowidReindex(token, 50, "same")).toEqual({ mode: "append", from: token });
  });

  it("appends from the prior token when new rows exist", () => {
    expect(planRowidReindex(prior, 99)).toEqual({ mode: "append", from: prior });
  });

  it("full re-index when rows were deleted below the watermark", () => {
    expect(planRowidReindex(prior, 10)).toEqual({ mode: "full" });
  });

  it("full re-index when the max row id is unreadable", () => {
    expect(planRowidReindex(prior, null)).toEqual({ mode: "full" });
  });
});

describe("planHashReindex", () => {
  const prior: HashResumeToken = { kind: "hash", value: "abc123" };

  it("full re-index when never seen", () => {
    expect(planHashReindex(null, "abc123")).toEqual({ mode: "full" });
  });

  it("skips when the content hash is unchanged", () => {
    expect(planHashReindex(prior, "abc123")).toEqual({ mode: "skip" });
  });

  it("full re-index when the content hash changed", () => {
    expect(planHashReindex(prior, "def456")).toEqual({ mode: "full" });
  });
});

describe("planReindex dispatch", () => {
  it("routes byte sources to the byte planner", () => {
    const prior = byteToken();
    const plan = planReindex(prior, {
      kind: "byte",
      stats: { size: 100, mtime: prior.mtime! },
      prefixHash: "headhash",
    });
    expect(plan).toEqual({ mode: "skip" });
  });

  it("routes rowid sources to the rowid planner", () => {
    const prior: RowidResumeToken = { kind: "rowid", value: 5 };
    expect(planReindex(prior, { kind: "rowid", maxRowId: 5 })).toEqual({ mode: "skip" });
  });

  it("routes hash sources to the hash planner", () => {
    const prior: HashResumeToken = { kind: "hash", value: "h" };
    expect(planReindex(prior, { kind: "hash", hash: "h" })).toEqual({ mode: "skip" });
  });

  it("treats a prior token of a different kind as never-seen (full)", () => {
    const prior: RowidResumeToken = { kind: "rowid", value: 5 };
    const plan = planReindex(prior, {
      kind: "byte",
      stats: { size: 100, mtime: "t" },
      prefixHash: "h",
    });
    expect(plan).toEqual({ mode: "full" });
  });
});
