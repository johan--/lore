import { describe, it, expect } from "vitest";
import { scoreRelevance } from "./score-relevance.js";

describe("scoreRelevance", () => {
  it("scores a clearly stronger older match above a weak fresh one", () => {
    const olderStronger = scoreRelevance({ bm25: 12, ageHours: 24 * 60 });
    const fresherWeaker = scoreRelevance({ bm25: 5, ageHours: 0 });
    expect(olderStronger).toBeGreaterThan(fresherWeaker);
  });

  it("breaks a bm25 tie toward the fresher memory", () => {
    const fresh = scoreRelevance({ bm25: 10, ageHours: 0 });
    const stale = scoreRelevance({ bm25: 10, ageHours: 24 * 30 });
    expect(fresh).toBeGreaterThan(stale);
  });

  it("never lets recency override a more-than-2x bm25 advantage at any age", () => {
    const ancientStrong = scoreRelevance({ bm25: 10, ageHours: 1e9 });
    const brandNewWeak = scoreRelevance({ bm25: 4.9, ageHours: 0 });
    expect(ancientStrong).toBeGreaterThan(brandNewWeak);
  });

  it("lets importance lift a score above an equal-relevance, equal-age peer", () => {
    const plain = scoreRelevance({ bm25: 10, ageHours: 0 });
    const important = scoreRelevance({ bm25: 10, ageHours: 0, importanceBoost: 0.2 });
    expect(important).toBeGreaterThan(plain);
  });

  it("treats importance as a gentle prior, not a relevance override", () => {
    const weakButImportant = scoreRelevance({ bm25: 5, ageHours: 0, importanceBoost: 0.2 });
    const strongPlain = scoreRelevance({ bm25: 10, ageHours: 0 });
    expect(strongPlain).toBeGreaterThan(weakButImportant);
  });
});
