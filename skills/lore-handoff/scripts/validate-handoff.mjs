#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const builtModule = resolve(repoRoot, "dist/skills/handoff-validation.js");
const sourceModule = resolve(repoRoot, "src/skills/handoff-validation.ts");
const tsxBin = resolve(repoRoot, "node_modules/.bin/tsx");
if (!existsSync(builtModule) && !process.env.LORE_HANDOFF_VALIDATOR_TSX) {
  if (!existsSync(tsxBin)) {
    console.error(
      "Build repo first ('npm run build') or install dependencies so local tsx can load TypeScript source.",
    );
    process.exit(2);
  }
  const child = spawnSync(tsxBin, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, LORE_HANDOFF_VALIDATOR_TSX: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}
const { validateHandoffPacket } = await import(
  pathToFileURL(existsSync(builtModule) ? builtModule : sourceModule).href
);
const path = process.argv[2];
if (!path) {
  console.error("Usage: node skills/lore-handoff/scripts/validate-handoff.mjs <handoff.json>");
  process.exit(2);
}
let handoffJson;
try {
  handoffJson = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`handoff validation failed: ${detail}`);
  process.exit(1);
}
const report = validateHandoffPacket(handoffJson);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("handoff validation passed");
