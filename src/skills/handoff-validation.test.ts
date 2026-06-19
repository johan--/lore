import { describe, expect, it } from "vitest";
import { validateHandoffPacket } from "./handoff-validation.js";

function goodPacket(): unknown {
  return {
    verified: [{ text: "UPD-002 landed", evidenceIds: ["m-1"] }],
    open: [{ text: "UPD-003 review pending", evidenceIds: ["m-2"] }],
    stale: [{ text: "Old branch note may be outdated", evidenceIds: ["m-3"] }],
    risky: [{ text: "Packaging has not been dry-run yet", evidenceIds: ["m-4"] }],
    artifacts: [{ path: "skills/lore-brief/SKILL.md", evidenceIds: ["m-5"] }],
    proposals: [
      {
        kind: "issue",
        title: "Package docs",
        rationale: "UPD-004 needs docs",
        risk: "Low",
        nextAction: "Open UPD-004",
        evidenceIds: ["m-6"],
      },
    ],
    nextActions: [{ text: "Run packaging smoke", evidenceIds: ["m-7"] }],
  };
}

describe("handoff validation", () => {
  it("accepts compact handoff packet with shared proposal vocabulary", () => {
    expect(validateHandoffPacket(goodPacket()).ok).toBe(true);
  });

  it("rejects claims without evidence or uncited marker", () => {
    const packet = { ...(goodPacket() as Record<string, unknown>), open: [{ text: "Maybe done" }] };
    const report = validateHandoffPacket(packet);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain("missing-evidence");
  });

  it("rejects private proposal shapes and transcript dumps", () => {
    const packet = {
      ...(goodPacket() as Record<string, unknown>),
      todoList: [],
      risky: [{ text: "BEGIN TRANSCRIPT\nrole: assistant\n".repeat(80), evidenceIds: ["m-8"] }],
    };
    const report = validateHandoffPacket(packet);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["private-proposal-shape", "transcript-dump"]),
    );
  });
});
