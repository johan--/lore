import { describe, it, expect } from "vitest";
import { importanceBoost, IMPORTANCE_CAP } from "./derive-importance.js";

describe("importanceBoost", () => {
  it("gives no boost to content seen in only one session", () => {
    expect(importanceBoost(1)).toBe(0);
  });

  it("gives no boost for zero or nonsensical counts", () => {
    expect(importanceBoost(0)).toBe(0);
  });

  it("boosts more the more sessions the content recurs across", () => {
    expect(importanceBoost(5)).toBeGreaterThan(importanceBoost(2));
  });

  it("saturates: never exceeds the cap no matter how often it recurs", () => {
    expect(importanceBoost(10_000)).toBeLessThanOrEqual(IMPORTANCE_CAP);
    expect(importanceBoost(10_000)).toBeGreaterThan(IMPORTANCE_CAP * 0.9);
  });

  it("has diminishing returns (a near-tie prior, not a runaway)", () => {
    const firstStep = importanceBoost(2) - importanceBoost(1);
    const laterStep = importanceBoost(9) - importanceBoost(8);
    expect(firstStep).toBeGreaterThan(laterStep);
  });
});
