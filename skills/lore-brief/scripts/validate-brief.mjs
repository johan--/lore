#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const builtModule = resolve(repoRoot, "dist/skills/brief-proposal-validation.js");
const sourceModule = resolve(repoRoot, "src/skills/brief-proposal-validation.ts");
const tsxBin = resolve(repoRoot, "node_modules/.bin/tsx");

if (!existsSync(builtModule) && !process.env.LORE_BRIEF_VALIDATOR_TSX) {
  const child = spawnSync(tsxBin, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, LORE_BRIEF_VALIDATOR_TSX: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const modulePath = existsSync(builtModule) ? builtModule : sourceModule;
const { validateBriefProposalOnly } = await import(pathToFileURL(modulePath).href);
const path = process.argv[2];
if (!path) {
  console.error("Usage: node skills/lore-brief/scripts/validate-brief.mjs <brief.json>");
  process.exit(2);
}
const report = validateBriefProposalOnly(JSON.parse(readFileSync(path, "utf8")));
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("brief proposal validation passed");
