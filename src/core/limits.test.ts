import { describe, it, expect } from "vitest";
import { clampLimit, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE, MAX_RESULTS } from "./limits.js";

describe("clampLimit", () => {
  it("falls back to the default when no limit is requested", () => {
    expect(clampLimit(undefined, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE)).toBe(
      DEFAULT_SESSION_PAGE,
    );
  });

  it("clamps an oversized request down to the ceiling", () => {
    expect(clampLimit(10_000, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE)).toBe(MAX_SESSION_PAGE);
    expect(clampLimit(10_000, 20, MAX_RESULTS)).toBe(MAX_RESULTS);
  });

  it("honors a valid in-range request", () => {
    expect(clampLimit(10, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE)).toBe(10);
  });

  it("rejects zero, negatives, and non-finite values by using the default", () => {
    expect(clampLimit(0, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE)).toBe(DEFAULT_SESSION_PAGE);
    expect(clampLimit(-5, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE)).toBe(DEFAULT_SESSION_PAGE);
    expect(clampLimit(Number.NaN, DEFAULT_SESSION_PAGE, MAX_SESSION_PAGE)).toBe(
      DEFAULT_SESSION_PAGE,
    );
  });

  it("never lets the default exceed the ceiling", () => {
    expect(clampLimit(undefined, 1000, MAX_SESSION_PAGE)).toBe(MAX_SESSION_PAGE);
  });
});
