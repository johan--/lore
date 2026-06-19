#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const builtModule = resolve(repoRoot, "dist/skills/workflow-skill-validation.js");

if (!existsSync(builtModule)) {
  console.error(
    "Build the repo first so dist/skills/workflow-skill-validation.js exists: npm run build",
  );
  process.exit(2);
}

const { renderValidationReport, validateWorkflowSkillBundle } = await import(
  pathToFileURL(builtModule).href
);
const skillDir = process.argv[2];
if (!skillDir) {
  console.error(
    "Usage: node skills/lore-dev-verification/scripts/validate-workflow-skill.mjs <skill-dir>",
  );
  process.exit(2);
}

const report = await validateWorkflowSkillBundle(resolve(process.cwd(), skillDir));
console.log(renderValidationReport(report));
process.exit(report.ok ? 0 : 1);
