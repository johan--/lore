import { describe, it, expect } from "vitest";
import { canonicalContent, contentHash, isRecurrenceEligible } from "./content-hash.js";

describe("canonicalContent", () => {
  it("strips injected control blocks and keeps authored text", () => {
    const text =
      "Run the release smoke before opening the PR.\n<system-reminder>noise</system-reminder>";
    expect(canonicalContent(text)).toBe("Run the release smoke before opening the PR.");
  });

  it("normalizes equivalent authored content to the same text", () => {
    const a = "Always run npm run check before committing on this repo.";
    const b = "Always   run npm run check before committing on this repo.\n<skill>ignored</skill>";
    expect(canonicalContent(a)).toBe(canonicalContent(b));
  });

  it("treats nullish legacy text as empty content", () => {
    expect(canonicalContent(null)).toBe("");
    expect(canonicalContent(undefined)).toBe("");
    expect(isRecurrenceEligible(null)).toBe(false);
    expect(contentHash(undefined)).toBeNull();
  });
});

describe("contentHash", () => {
  it("is null for short or injected-only messages", () => {
    expect(isRecurrenceEligible("ok")).toBe(false);
    expect(contentHash("ok")).toBeNull();
    expect(contentHash("<turn_aborted>interrupted</turn_aborted>")).toBeNull();
  });

  it("matches across the same organic content with different injected blocks", () => {
    const a = "Always run npm run check before committing on this repo.";
    const b =
      "Always run npm run check before committing on this repo.\n<system-reminder>x</system-reminder>";
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).not.toBeNull();
  });
});
