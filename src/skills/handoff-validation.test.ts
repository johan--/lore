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
        why: "UPD-004 needs docs",
        evidenceIds: ["m-6"],
        sideEffects: false,
      },
    ],
    memoryCardCandidates: [
      { kind: "decision", title: "Use compact evidence", evidenceIds: ["m-8"] },
      { kind: "claim", title: "UPD-003 review is pending", evidenceIds: ["m-9"] },
      { kind: "commitment", title: "Run handoff validator", evidenceIds: ["m-10"] },
      { kind: "artifact", title: "skills/lore-handoff/SKILL.md", evidenceIds: ["m-11"] },
      { kind: "contradiction", title: "Merged but blocked", evidenceIds: ["m-12", "m-13"] },
      { kind: "open_question", title: "What should run next?", evidenceIds: ["m-14"] },
    ],
    contradictionCandidates: [
      {
        kind: "contradiction",
        sideA: { claim: "UPD-003 was merged", evidenceIds: ["m-12"] },
        sideB: { claim: "Review found blockers", evidenceIds: ["m-13"] },
        status: "unresolved",
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

  it("rejects artifacts and next actions without evidence or uncited marker", () => {
    const packet = {
      ...(goodPacket() as Record<string, unknown>),
      artifacts: [{ path: "skills/lore-handoff/SKILL.md" }],
      nextActions: [{ text: "Run packaging smoke" }],
    };
    const report = validateHandoffPacket(packet);
    expect(report.ok).toBe(false);
    expect(report.issues.filter((i) => i.code === "missing-evidence")).toHaveLength(2);
  });

  it("rejects many small transcript-like chunks", () => {
    const packet = {
      ...(goodPacket() as Record<string, unknown>),
      open: [
        { text: "User: first small copied chunk", evidenceIds: ["m-15"] },
        { text: "Assistant: second small copied chunk", evidenceIds: ["m-16"] },
        { text: "role: assistant\nthird small copied chunk", evidenceIds: ["m-17"] },
      ],
    };
    const report = validateHandoffPacket(packet);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain("transcript-dump");
  });

  it("rejects malformed evidenceIds elements", () => {
    const packet = {
      ...(goodPacket() as Record<string, unknown>),
      open: [
        { text: "Null evidence id", evidenceIds: [null] },
        { text: "Empty evidence id", evidenceIds: [""] },
      ],
    };

    const report = validateHandoffPacket(packet);

    expect(report.ok).toBe(false);
    expect(report.issues.filter((i) => i.code === "missing-evidence")).toHaveLength(2);
  });

  it("rejects unknown memory-card candidate kinds", () => {
    const packet = {
      ...(goodPacket() as Record<string, unknown>),
      memoryCardCandidates: [
        ...((goodPacket() as { memoryCardCandidates: unknown[] }).memoryCardCandidates ?? []),
        { kind: "private_shape", title: "Do not allow private kinds", evidenceIds: ["m-15"] },
      ],
    };

    const report = validateHandoffPacket(packet);

    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain("invalid-memory-card-candidate");
  });
});
