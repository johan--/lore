import { access, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  code: string;
  message: string;
  path?: string;
  severity: ValidationSeverity;
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type WorkflowSkillPackageOptions = {
  requiredSkills: string[];
};

const REQUIRED_BUNDLE_PATHS = [
  "SKILL.md",
  "references",
  "examples",
  "evals/evals.json",
  "evals/test-report.md",
];

const REQUIRED_REPORT_SECTIONS = [
  { heading: "Eval IDs And Prompts", evidence: "eval ids" },
  { heading: "Fixture Source", evidence: "fixture source" },
  { heading: "Run Mode", evidence: "run mode" },
  { heading: "With-Skill Results", evidence: "with-skill results" },
  { heading: "Baseline Or Old-Skill Results", evidence: "baseline results" },
  { heading: "Assertion Grades", evidence: "assertion grades" },
  { heading: "Validator Output", evidence: "validator output" },
  { heading: "Trigger Checks", evidence: "trigger checks" },
  { heading: "Privacy Notes", evidence: "privacy notes" },
  { heading: "Changes Made After Testing", evidence: "changes made" },
  { heading: "Remaining Risks", evidence: "remaining risks" },
];

const PLACEHOLDER_PATTERN = /\b(TODO|TBD|placeholder|lorem ipsum|n\/a)\b/i;

function issue(
  code: string,
  message: string,
  path?: string,
  severity: ValidationSeverity = "error",
): ValidationIssue {
  return { code, message, path, severity };
}

function report(issues: ValidationIssue[]): ValidationReport {
  return {
    ok: !issues.some((item) => item.severity === "error"),
    issues,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasDirectoryEntries(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path);
    return entries.some((entry) => !entry.startsWith("."));
  } catch {
    return false;
  }
}

async function validateJsonFile(path: string): Promise<ValidationIssue[]> {
  try {
    JSON.parse(await readFile(path, "utf8"));
    return [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [issue("invalid-json", `Expected valid JSON: ${detail}`, path)];
  }
}

function sectionPattern(heading: string): RegExp {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
}

function extractSection(markdown: string, heading: string): string | null {
  const pattern = sectionPattern(heading);
  const match = pattern.exec(markdown);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function hasConcreteEvidence(section: string): boolean {
  if (PLACEHOLDER_PATTERN.test(section)) return false;
  const compact = section.replace(/[`*_\-:>\s]/g, "").trim();
  return compact.length >= 20;
}

export async function validateSkillTestReport(reportPath: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  let markdown = "";

  try {
    markdown = await readFile(reportPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return report([
      issue("missing-test-report", `Could not read test report: ${detail}`, reportPath),
    ]);
  }

  const placeholder = markdown.match(PLACEHOLDER_PATTERN);
  if (placeholder) {
    issues.push(
      issue(
        "placeholder-content",
        `Test report still contains placeholder content: ${placeholder[0]}`,
        reportPath,
      ),
    );
  }

  for (const section of REQUIRED_REPORT_SECTIONS) {
    const body = extractSection(markdown, section.heading);
    if (body === null) {
      issues.push(
        issue(
          "missing-section",
          `Missing required test-report section: ${section.heading}`,
          reportPath,
        ),
      );
      continue;
    }
    if (!hasConcreteEvidence(body)) {
      issues.push(
        issue(
          "missing-evidence",
          `Section lacks concrete evidence for ${section.evidence}`,
          reportPath,
        ),
      );
    }
  }

  return report(issues);
}

export async function validateWorkflowSkillBundle(skillDir: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];

  if (!(await pathExists(skillDir))) {
    return report([issue("missing-skill", `Skill directory is missing: ${skillDir}`, skillDir)]);
  }

  for (const relPath of REQUIRED_BUNDLE_PATHS) {
    const absPath = join(skillDir, relPath);
    if (!(await pathExists(absPath))) {
      issues.push(issue("missing-required-path", `Missing required path: ${relPath}`, relPath));
    }
  }

  for (const dirPath of ["references", "examples"]) {
    const absPath = join(skillDir, dirPath);
    if ((await pathExists(absPath)) && !(await hasDirectoryEntries(absPath))) {
      issues.push(issue("empty-directory", `Required directory has no files: ${dirPath}`, dirPath));
    }
  }

  const skillPath = join(skillDir, "SKILL.md");
  if (await pathExists(skillPath)) {
    const skillText = await readFile(skillPath, "utf8");
    if (!/^---\s*\n[\s\S]*?\n---/m.test(skillText)) {
      issues.push(
        issue("missing-frontmatter", "SKILL.md must include YAML frontmatter", "SKILL.md"),
      );
    }
    if (!/^description:\s*.+/m.test(skillText)) {
      issues.push(
        issue("missing-description", "SKILL.md frontmatter must include description", "SKILL.md"),
      );
    }
  }

  const evalsPath = join(skillDir, "evals", "evals.json");
  if (await pathExists(evalsPath)) {
    issues.push(...(await validateJsonFile(evalsPath)));
  }

  const reportPath = join(skillDir, "evals", "test-report.md");
  if (await pathExists(reportPath)) {
    const testReport = await validateSkillTestReport(reportPath);
    issues.push(...testReport.issues);
  }

  const scriptsPath = join(skillDir, "scripts");
  if (await pathExists(scriptsPath)) {
    const scriptsStat = await stat(scriptsPath);
    if (!scriptsStat.isDirectory()) {
      issues.push(issue("invalid-scripts-path", "scripts must be a directory", "scripts"));
    }
  }

  return report(issues);
}

export async function validateWorkflowSkillPackage(
  skillsRoot: string,
  options: WorkflowSkillPackageOptions,
): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];

  for (const skillName of options.requiredSkills) {
    const skillDir = join(skillsRoot, skillName);
    if (!(await pathExists(skillDir))) {
      issues.push(
        issue("missing-skill", `Required workflow skill is missing: ${skillName}`, skillName),
      );
      continue;
    }
    const bundleReport = await validateWorkflowSkillBundle(skillDir);
    issues.push(
      ...bundleReport.issues.map((item) => ({
        ...item,
        path: item.path ? join(skillName, item.path) : skillName,
      })),
    );
  }

  return report(issues);
}

export function renderValidationReport(validationReport: ValidationReport): string {
  if (validationReport.ok) return "workflow skill validation passed";
  return validationReport.issues
    .map(
      (item) => `${item.severity.toUpperCase()} ${item.code}: ${item.path ?? ""} ${item.message}`,
    )
    .join("\n");
}
