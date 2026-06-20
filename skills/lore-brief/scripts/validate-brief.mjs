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
  if (!existsSync(tsxBin)) {
    console.error(
      "Build repo first ('npm run build') or install dependencies so local tsx can load TypeScript source.",
    );
    process.exit(2);
  }
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
let briefJson;
try {
  briefJson = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`brief proposal validation failed: ${detail}`);
  process.exit(1);
}
const report = validateBriefProposalOnly(briefJson);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("brief proposal validation passed");
