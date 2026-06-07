import { describe, it, expect } from "vitest";
import { sanitizeFtsQuery } from "./sanitize-fts.js";

describe("sanitizeFtsQuery", () => {
  it("quotes a plain word so it matches normally", () => {
    expect(sanitizeFtsQuery("alamo")).toBe('"alamo"');
  });

  it("keeps a hyphenated identifier whole instead of parsing it as NOT", () => {
    // bareword `trust-metadata` would parse as `trust NOT metadata` and throw;
    // quoting makes the hyphen literal.
    expect(sanitizeFtsQuery("trust-metadata")).toBe('"trust-metadata"');
  });

  it("keeps a dotted path as a single token", () => {
    expect(sanitizeFtsQuery("foo.bar.ts")).toBe('"foo.bar.ts"');
  });

  it("joins multiple terms with spaces (implicit AND), each quoted", () => {
    expect(sanitizeFtsQuery("getUserById foo.bar.ts")).toBe('"getUserById" "foo.bar.ts"');
  });

  it("collapses arbitrary whitespace between terms", () => {
    expect(sanitizeFtsQuery("  alpha   beta\tgamma\n delta ")).toBe(
      '"alpha" "beta" "gamma" "delta"',
    );
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(sanitizeFtsQuery("")).toBe("");
    expect(sanitizeFtsQuery("   \t\n  ")).toBe("");
  });

  it("strips embedded double-quotes so a crafted term cannot break out of the phrase", () => {
    // A naive implementation would let the embedded quote close the phrase and
    // inject FTS5 operators. Quotes are stripped before re-wrapping.
    expect(sanitizeFtsQuery('a"b')).toBe('"ab"');
  });

  it("neutralizes an injection attempt that mixes quotes and operators", () => {
    const out = sanitizeFtsQuery('" OR x:y NEAR(a b)');
    // No bare/unbalanced quote survives: every double-quote in the output is a
    // phrase delimiter, so the count is even.
    const quoteCount = (out.match(/"/g) ?? []).length;
    expect(quoteCount % 2).toBe(0);
    // The reserved chars survive only inside quoted phrases, where FTS5 treats
    // them literally rather than as operators.
    expect(out).toContain('"OR"');
    expect(out).toContain('"x:y"');
  });

  it("treats a lone reserved-char term as a literal quoted phrase", () => {
    expect(sanitizeFtsQuery("*")).toBe('"*"');
    expect(sanitizeFtsQuery("-")).toBe('"-"');
  });

  it("preserves unicode word characters", () => {
    expect(sanitizeFtsQuery("café déjà")).toBe('"café" "déjà"');
  });
});
