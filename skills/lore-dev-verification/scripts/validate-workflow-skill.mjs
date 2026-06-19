#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const builtModule = resolve(repoRoot, "dist/skills/workflow-skill-validation.js");
const sourceModule = resolve(repoRoot, "src/skills/workflow-skill-validation.ts");
const tsxBin = resolve(repoRoot, "node_modules/.bin/tsx");

if (!existsSync(builtModule) && !process.env.LORE_WORKFLOW_VALIDATOR_TSX) {
  if (!existsSync(tsxBin)) {
    console.error(
      "Build repo first (`npm run build`) or install dependencies so local tsx can load TypeScript source.",
    );
    process.exit(2);
  }

  const child = spawnSync(tsxBin, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, LORE_WORKFLOW_VALIDATOR_TSX: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const modulePath = existsSync(builtModule) ? builtModule : sourceModule;
if (!existsSync(modulePath)) {
  console.error(
    "Could not find workflow skill validation module. Run `npm run build` or restore src/skills/workflow-skill-validation.ts.",
  );
  process.exit(2);
}

const { renderValidationReport, validateWorkflowSkillBundle } = await import(
  pathToFileURL(modulePath).href
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
