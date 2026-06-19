import { describe, expect, it } from "vitest";

type ValidationIssue = {
  code: string;
  message: string;
  path?: string;
  severity?: "error" | "warning";
};

type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

type BriefWindow = {
  fromIso: string;
  toIso: string;
  localDateLabel: string;
  timeZone: string;
};

type BriefProposalValidationModule = {
  validateBriefProposalOnly: (brief: unknown) => ValidationReport;
  getDefaultBriefWindow: (options: { now: Date; timeZone: string }) => BriefWindow;
};

async function loadBriefProposalValidationModule(): Promise<BriefProposalValidationModule> {
  const modulePath = "./brief-proposal-validation.js";
  try {
    return (await import(modulePath)) as unknown as BriefProposalValidationModule;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `UPD-002 is expected to provide src/skills/brief-proposal-validation.ts with deterministic brief/proposal validators. Import failed: ${detail}`,
    );
  }
}

function issueText(report: ValidationReport): string {
  return report.issues
    .map((issue) => `${issue.code} ${issue.path ?? ""} ${issue.message}`)
    .join("\n");
}

function expectIssue(report: ValidationReport, code: string, fragment: string): void {
  const text = issueText(report);
  expect(text).toContain(code);
  expect(text).toContain(fragment);
}

function goodBrief(): unknown {
  return {
    sideEffects: false,
    generatedAtIso: "2026-06-18T19:30:00.000Z",
    window: {
      fromIso: "2026-06-17T19:30:00.000Z",
      toIso: "2026-06-18T19:30:00.000Z",
      localDateLabel: "June 18, 2026",
      timeZone: "America/Los_Angeles",
    },
    completedActivity: [
      {
        title: "Recall status contract was merged into the integration branch",
        evidenceIds: ["msg_recall_001", "msg_recall_002"],
      },
    ],
    openWork: [
      {
        title: "Brief workflow still needs proposal-only validation",
        evidenceIds: ["msg_brief_001"],
      },
    ],
    changes: [
      {
        title: "UPD-002 now owns the shared proposal vocabulary",
        evidenceIds: ["issue_upd_002"],
        sideEffects: false,
      },
    ],
    learnedSignals: [
      {
        title: "Scheduled brief usage must be read-only synthesis",
        evidenceIds: ["issue_upd_002"],
        sideEffects: false,
      },
    ],
    staleOrUncertainEvidence: [
      {
        title: "No live transcript evidence was found for one optional follow-up",
        evidenceIds: [],
        evidenceStatus: "not_found",
      },
    ],
    proposals: [
      {
        kind: "skill",
        title: "Add lore-brief eval coverage for stale evidence",
        why: "The issue requires stale-evidence behavior to be proven deterministically.",
        evidenceIds: ["issue_upd_002", "msg_brief_001"],
        sideEffects: false,
      },
      {
        kind: "wiki_update",
        title: "Capture the proposal-only brief contract",
        why: "Future handoff and brief workflows should reuse one proposal vocabulary.",
        evidenceIds: ["issue_upd_002"],
        sideEffects: false,
      },
    ],
    memoryCardCandidates: [
      {
        kind: "decision",
        title: "Briefs are proposal-only",
        why: "Scheduled/no-side-effect usage must not create jobs, issues, wiki pages, skills, tasks, memory cards, or code.",
        evidenceIds: ["issue_upd_002"],
      },
      {
        kind: "claim",
        title: "Default brief window is rolling last 24 hours",
        why: "The issue makes this the deterministic default unless the user provides a window.",
        evidenceIds: ["issue_upd_002"],
      },
      {
        kind: "commitment",
        title: "Run brief checker before calling the skill complete",
        why: "The issue requires structured checker output in the committed test report.",
        evidenceIds: ["issue_upd_002"],
      },
      {
        kind: "artifact",
        title: "skills/lore-brief/evals/test-report.md",
        why: "The test report is part of the required brief skill bundle.",
        evidenceIds: ["issue_upd_002"],
      },
      {
        kind: "contradiction",
        title:
          "One source says the task is complete while another says the skill bundle is missing",
        why: "Contradictions must preserve both sides with evidence rather than averaging them.",
        evidenceIds: ["msg_status_done", "issue_upd_002"],
      },
      {
        kind: "open_question",
        title: "Which proposals should be promoted after the user approves follow-up?",
        why: "The brief may propose follow-up objects but cannot perform those actions itself.",
        evidenceIds: ["issue_upd_002"],
      },
    ],
    contradictionCandidates: [
      {
        title: "Brief status conflict",
        sideA: {
          claim: "A prior status note says the brief workflow was complete.",
          evidenceIds: ["msg_status_done"],
        },
        sideB: {
          claim: "The issue still lists the brief skill and checker as incomplete.",
          evidenceIds: ["issue_upd_002"],
        },
        resolution: "unresolved",
      },
    ],
  };
}

describe("brief proposal validation", () => {
  it("accepts a proposal-only brief with explicit window, local label, evidence-backed proposals, memory cards, and contradictions", async () => {
    const { validateBriefProposalOnly } = await loadBriefProposalValidationModule();

    const report = validateBriefProposalOnly(goodBrief());

    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity !== "warning")).toEqual([]);
  });

  it.each([
    {
      name: "sideEffects true",
      brief: { ...(goodBrief() as Record<string, unknown>), sideEffects: true },
      expectedFragment: "sideEffects",
    },
    {
      name: "action-created wording",
      brief: {
        ...(goodBrief() as Record<string, unknown>),
        proposals: [
          {
            kind: "issue",
            title: "Created issue for the brief checker",
            why: "Created GitHub issue #123 from the brief output.",
            sideEffects: false,
            evidenceIds: ["issue_upd_002"],
          },
        ],
      },
      expectedFragment: "created",
    },
  ])(
    "rejects a brief that violates proposal-only behavior: $name",
    async ({ brief, expectedFragment }) => {
      const { validateBriefProposalOnly } = await loadBriefProposalValidationModule();

      const report = validateBriefProposalOnly(brief);

      expect(report.ok).toBe(false);
      expectIssue(report, "proposal-only-violation", expectedFragment);
    },
  );

  it("rejects proposal objects missing required fields", async () => {
    const { validateBriefProposalOnly } = await loadBriefProposalValidationModule();
    const brief = {
      ...(goodBrief() as Record<string, unknown>),
      proposals: [{ kind: "skill", evidenceIds: ["issue_upd_002"] }],
    };

    const report = validateBriefProposalOnly(brief);

    expect(report.ok).toBe(false);
    expectIssue(report, "invalid-proposal", "title");
    expectIssue(report, "invalid-proposal", "why");
    expectIssue(report, "invalid-proposal", "sideEffects");
  });

  it("rejects a contradiction candidate that is missing evidence for one side", async () => {
    const { validateBriefProposalOnly } = await loadBriefProposalValidationModule();
    const brief = {
      ...(goodBrief() as Record<string, unknown>),
      contradictionCandidates: [
        {
          title: "Brief status conflict",
          sideA: {
            claim: "A prior status note says the brief workflow was complete.",
            evidenceIds: ["msg_status_done"],
          },
          sideB: {
            claim: "The issue still lists the brief skill and checker as incomplete.",
            evidenceIds: [],
          },
          resolution: "unresolved",
        },
      ],
    };

    const report = validateBriefProposalOnly(brief);

    expect(report.ok).toBe(false);
    expectIssue(report, "missing-contradiction-evidence", "sideB");
  });

  it("returns the rolling last-24-hours ISO bounds for the default brief window with a pinned clock", async () => {
    const { getDefaultBriefWindow } = await loadBriefProposalValidationModule();

    const window = getDefaultBriefWindow({
      now: new Date("2026-06-18T19:30:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(window).toEqual({
      fromIso: "2026-06-17T19:30:00.000Z",
      toIso: "2026-06-18T19:30:00.000Z",
      localDateLabel: "June 18, 2026",
      timeZone: "America/Los_Angeles",
    });
  });
});
