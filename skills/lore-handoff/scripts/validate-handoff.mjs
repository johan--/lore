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
const report = validateHandoffPacket(JSON.parse(readFileSync(path, "utf8")));
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("handoff validation passed");
