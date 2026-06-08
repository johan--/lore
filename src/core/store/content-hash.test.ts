import { describe, it, expect } from "vitest";
import { canonicalContent, isRecurrenceEligible, contentHash } from "./content-hash.js";

describe("canonicalContent", () => {
  it("strips an injected system-reminder block, keeping the organic remainder", () => {
    const text =
      "Please run the deploy script for staging.\n<system-reminder>You have 3 pending signals.</system-reminder>";
    expect(canonicalContent(text)).toBe("Please run the deploy script for staging.");
  });

  it("yields the same canonical content for messages differing only by an injected block", () => {
    const a = "Migrate the orders table to the new schema before Friday.";
    const b =
      "Migrate the orders table to the new schema before Friday.\n<system-reminder>tdy is 2026-06-08</system-reminder>";
    expect(canonicalContent(a)).toBe(canonicalContent(b));
  });
});

describe("isRecurrenceEligible", () => {
  it("counts a substantive authored message", () => {
    expect(isRecurrenceEligible("Always run npm run check before committing on this repo.")).toBe(
      true,
    );
  });

  it("rejects a message that is nothing but an injected block", () => {
    expect(
      isRecurrenceEligible(
        "<system-reminder>You have 5 pending signals to review.</system-reminder>",
      ),
    ).toBe(false);
  });

  it("rejects a short acknowledgement", () => {
    expect(isRecurrenceEligible("ok thanks")).toBe(false);
  });

  it("rejects empty / whitespace text", () => {
    expect(isRecurrenceEligible("   \n  ")).toBe(false);
  });
});

describe("contentHash", () => {
  it("is null for content too thin to count as recurring", () => {
    expect(contentHash("ok thanks")).toBeNull();
    expect(contentHash("<system-reminder>noise</system-reminder>")).toBeNull();
  });

  it("matches across messages with the same organic content but different injected blocks", () => {
    const a = "Always run npm run check before committing on this repo.";
    const b =
      "Always run npm run check before committing on this repo.\n<system-reminder>x</system-reminder>";
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).not.toBeNull();
  });

  it("differs for genuinely different organic content", () => {
    expect(contentHash("Always run npm run check before committing on this repo.")).not.toBe(
      contentHash("Never force-push to main without asking the team lead first please."),
    );
  });
});
