#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workflowSkills = [
  {
    folder: "skills/lore-dev-verification",
    script: "scripts/validate-workflow-skill.mjs",
  },
  {
    folder: "skills/lore-recall",
    script: "scripts/validate-evidence-packet.mjs",
  },
  {
    folder: "skills/lore-brief",
    script: "scripts/validate-brief.mjs",
  },
  {
    folder: "skills/lore-handoff",
    script: "scripts/validate-handoff.mjs",
  },
];
const requiredBundlePaths = [
  "SKILL.md",
  "references",
  "examples",
  "evals/evals.json",
  "evals/test-report.md",
];
const requiredReportHeadings = [
  "## Eval IDs And Prompts",
  "## Fixture Source",
  "## Run Mode",
  "## With-Skill Results",
  "## Baseline Or Old-Skill Results",
  "## Assertion Grades",
  "## Validator Output",
  "## Trigger Checks",
  "## Privacy Notes",
  "## Changes Made After Testing",
  "## Remaining Risks",
];

const repoRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "lore-package-smoke-"));
let tarball;
try {
  const dryRun = run("npm", ["pack", "--dry-run", "--json"], repoRoot);
  const dryRunMeta = parsePackJson(dryRun.stdout, "dry-run");
  validatePackMetadata(dryRunMeta, "dry-run");

  const packed = run("npm", ["pack", "--json", "--pack-destination", tempDir], repoRoot);
  const packMeta = parsePackJson(packed.stdout, "pack");
  validatePackMetadata(packMeta, "pack");
  tarball = join(tempDir, packMeta.filename);

  run("tar", ["-xzf", tarball, "-C", tempDir], repoRoot);
  const packageRoot = join(tempDir, "package");
  symlinkSync(resolve(repoRoot, "node_modules"), join(packageRoot, "node_modules"), "dir");
  validatePackagedTree(packageRoot);

  const help = run("node", [join(packageRoot, "dist/cli/lore.js"), "help"], repoRoot).stdout;
  assert(help.includes("lore status"), "packaged CLI help must include status command");

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRunEntries: dryRunMeta.entryCount,
        packEntries: packMeta.entryCount,
        workflowSkills: workflowSkills.map((skill) => skill.folder),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function validatePackMetadata(meta, label) {
  const files = new Map(meta.files.map((file) => [file.path, file]));
  const bin = files.get("dist/cli/lore.js");
  assert(bin !== undefined, `${label}: dist/cli/lore.js missing from package`);
  assert(bin.mode === 0o755, `${label}: dist/cli/lore.js must be executable mode 755`);

  for (const skill of workflowSkills) {
    for (const required of requiredBundlePaths) {
      const prefix = `${skill.folder}/${required}`;
      const present = required.includes(".")
        ? files.has(prefix)
        : [...files.keys()].some((path) => path.startsWith(`${prefix}/`));
      assert(present, `${label}: ${prefix} missing from package`);
    }
    assert(files.has(`${skill.folder}/${skill.script}`), `${label}: ${skill.script} missing`);
  }
}

function validatePackagedTree(packageRoot) {
  for (const skill of workflowSkills) {
    const skillRoot = join(packageRoot, skill.folder);
    for (const required of requiredBundlePaths) {
      validateRequiredPath(join(skillRoot, required), `${skill.folder}/${required}`);
    }
    const report = readRequired(
      join(skillRoot, "evals/test-report.md"),
      `${skill.folder}/evals/test-report.md`,
    );
    for (const heading of requiredReportHeadings) {
      assert(report.includes(heading), `${skill.folder} test report missing heading: ${heading}`);
    }
    const skillMarkdown = readRequired(join(skillRoot, "SKILL.md"), `${skill.folder}/SKILL.md`);
    assert(skillMarkdown.includes("description:"), `${skill.folder}/SKILL.md missing description`);
  }
}

function readRequired(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Packaged tree cannot read ${label}`);
  }
}

function validateRequiredPath(path, label) {
  if (!existsSync(path)) throw new Error(`Packaged tree cannot read ${label}`);
  const stats = statSync(path);
  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error(`Packaged tree has unsupported path type for ${label}`);
  }
}

function parsePackJson(stdout, label) {
  const parsed = JSON.parse(stdout);
  assert(Array.isArray(parsed) && parsed.length === 1, `${label}: unexpected npm pack JSON`);
  return parsed[0];
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: join(tempDir, "npm-cache") },
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
