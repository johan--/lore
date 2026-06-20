import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

type WorkflowSkillValidationModule = {
  validateWorkflowSkillBundle: (skillDir: string) => Promise<ValidationReport> | ValidationReport;
  validateSkillTestReport: (reportPath: string) => Promise<ValidationReport> | ValidationReport;
  validateWorkflowSkillPackage: (
    skillsRoot: string,
    options: { requiredSkills: string[] },
  ) => Promise<ValidationReport> | ValidationReport;
};

async function loadValidationModule(): Promise<WorkflowSkillValidationModule> {
  const modulePath = "./workflow-skill-validation.js";
  try {
    return (await import(modulePath)) as unknown as WorkflowSkillValidationModule;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `UPD-000 is expected to provide src/skills/workflow-skill-validation.ts with deterministic workflow-skill validators. Import failed: ${detail}`,
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

async function writeCompleteWorkflowSkill(skillDir: string): Promise<void> {
  await mkdir(join(skillDir, "references"), { recursive: true });
  await mkdir(join(skillDir, "examples"), { recursive: true });
  await mkdir(join(skillDir, "evals"), { recursive: true });

  await writeFile(
    join(skillDir, "SKILL.md"),
    `---
name: lore-recall
description: Use when verifying a Lore workflow skill bundle in a synthetic fixture.
---

# Lore Recall

Use this fixture skill when tests need a complete workflow skill bundle shape.
`,
  );
  await writeFile(
    join(skillDir, "references", "verification.md"),
    "# Verification\n\nRun the workflow-skill validator before calling this fixture complete.\n",
  );
  await writeFile(
    join(skillDir, "examples", "retrieval-change.md"),
    "# Retrieval Change Example\n\nGood output cites synthetic message ids and reports bounded gaps.\n",
  );
  await writeFile(
    join(skillDir, "evals", "evals.json"),
    JSON.stringify(
      {
        evals: [
          {
            id: "recall-routes-retrieval-change",
            prompt: "Verify a synthetic Lore retrieval change.",
            expected_output: "Chooses targeted retrieval and CLI/MCP parity checks.",
            assertions: [
              { id: "chooses-targeted-tests", text: "Runs the targeted retrieval tests." },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(join(skillDir, "evals", "test-report.md"), completeTestReport());
}

function completeTestReport(): string {
  return `# Test Report - lore-recall fixture

## Eval IDs And Prompts

- recall-routes-retrieval-change: Verify a synthetic Lore retrieval change.

## Fixture Source

Synthetic fixture under a temporary directory. It contains no real transcripts, private memory, or credentials.

## Run Mode

Manual with-skill review against the fixture prompt plus deterministic validator checks.

## With-Skill Results

- recall-routes-retrieval-change: PASS. The response selected targeted retrieval tests and CLI/MCP parity checks.

## Baseline Or Old-Skill Results

Baseline was skipped because this fixture has no prior production skill; the skip is deliberate and local to this synthetic test.

## Assertion Grades

- chooses-targeted-tests: PASS. Evidence: targeted retrieval tests were named explicitly.

## Validator Output

- workflow-skill bundle checker: PASS
- test-report structure checker: PASS

## Trigger Checks

- should trigger: "verify a Lore retrieval change" -> PASS
- should not trigger: "summarize my grocery list" -> PASS

## Privacy Notes

All records are synthetic. No real Lore transcript excerpts, private project text, credentials, or personal memory are included.

## Changes Made After Testing

No changes were needed after the final fixture validation run.

## Remaining Risks

The fixture proves structure only; representative skill quality still needs real eval prompts in the production skill.
`;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lore-workflow-skill-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("workflow skill validation", () => {
  it("fails an incomplete workflow skill bundle with actionable missing-path issues", async () => {
    const { validateWorkflowSkillBundle } = await loadValidationModule();
    const skillDir = join(dir, "lore-recall");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: lore-recall\ndescription: incomplete fixture\n---\n\n# Lore Recall\n",
    );

    const report = await validateWorkflowSkillBundle(skillDir);

    expect(report.ok).toBe(false);
    expectIssue(report, "missing-required-path", "references");
    expectIssue(report, "missing-required-path", "examples");
    expectIssue(report, "missing-required-path", "evals/evals.json");
    expectIssue(report, "missing-required-path", "evals/test-report.md");
  });

  it("accepts a complete minimal workflow skill bundle with a non-placeholder test report", async () => {
    const { validateWorkflowSkillBundle } = await loadValidationModule();
    const skillDir = join(dir, "lore-recall");
    await writeCompleteWorkflowSkill(skillDir);

    const report = await validateWorkflowSkillBundle(skillDir);

    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity !== "warning")).toEqual([]);
  });

  it("requires skill frontmatter to start at the beginning of SKILL.md", async () => {
    const { validateWorkflowSkillBundle } = await loadValidationModule();
    const skillDir = join(dir, "lore-recall");
    await writeCompleteWorkflowSkill(skillDir);
    await writeFile(
      join(skillDir, "SKILL.md"),
      `# Lore Recall

---
name: lore-recall
description: This body block must not count as skill frontmatter.
---

Use this fixture skill when tests need to reject displaced frontmatter.
`,
    );

    const report = await validateWorkflowSkillBundle(skillDir);

    expect(report.ok).toBe(false);
    expectIssue(report, "missing-frontmatter", "YAML frontmatter");
  });

  it("does not accept a body description as frontmatter metadata", async () => {
    const { validateWorkflowSkillBundle } = await loadValidationModule();
    const skillDir = join(dir, "lore-recall");
    await writeCompleteWorkflowSkill(skillDir);
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: lore-recall
---

# Lore Recall

description: This body line must not satisfy the frontmatter description check.
`,
    );

    const report = await validateWorkflowSkillBundle(skillDir);

    expect(report.ok).toBe(false);
    expectIssue(report, "missing-description", "description");
  });

  it("fails a workflow skill bundle whose evals file has no eval cases", async () => {
    const { validateWorkflowSkillBundle } = await loadValidationModule();
    const skillDir = join(dir, "lore-recall");
    await writeCompleteWorkflowSkill(skillDir);
    await writeFile(join(skillDir, "evals", "evals.json"), "{}\n");

    const report = await validateWorkflowSkillBundle(skillDir);

    expect(report.ok).toBe(false);
    expectIssue(report, "invalid-evals-schema", "at least one eval");
  });

  it("fails a hollow placeholder test report even when the required headings exist", async () => {
    const { validateSkillTestReport } = await loadValidationModule();
    const reportPath = join(dir, "test-report.md");
    await writeFile(
      reportPath,
      `# Test Report

## Eval IDs And Prompts

TODO

## Fixture Source

TBD

## Run Mode

placeholder

## With-Skill Results

TODO

## Baseline Or Old-Skill Results

TODO

## Assertion Grades

TODO

## Validator Output

TODO

## Trigger Checks

TODO

## Privacy Notes

TODO

## Changes Made After Testing

TODO

## Remaining Risks

TODO
`,
    );

    const report = await validateSkillTestReport(reportPath);

    expect(report.ok).toBe(false);
    expectIssue(report, "placeholder-content", "TODO");
    expectIssue(report, "missing-evidence", "eval ids");
    expectIssue(report, "missing-evidence", "with-skill results");
    expectIssue(report, "missing-evidence", "assertion grades");
    expectIssue(report, "missing-evidence", "validator output");
    expectIssue(report, "missing-evidence", "privacy notes");
    expectIssue(report, "missing-evidence", "remaining risks");
  });

  it("accepts a complete test report with eval evidence, validator output, and privacy notes", async () => {
    const { validateSkillTestReport } = await loadValidationModule();
    const reportPath = join(dir, "test-report.md");
    await writeFile(reportPath, completeTestReport());

    const report = await validateSkillTestReport(reportPath);

    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity !== "warning")).toEqual([]);
  });

  it("fails package-level validation when a required workflow skill is missing", async () => {
    const { validateWorkflowSkillPackage } = await loadValidationModule();
    const skillsRoot = join(dir, "skills");
    await writeCompleteWorkflowSkill(join(skillsRoot, "lore-recall"));

    const report = await validateWorkflowSkillPackage(skillsRoot, {
      requiredSkills: ["lore-dev-verification", "lore-recall"],
    });

    expect(report.ok).toBe(false);
    expectIssue(report, "missing-skill", "lore-dev-verification");
    expect(issueText(report)).not.toContain("lore-recall missing");
  });
});
