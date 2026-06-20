#!/usr/bin/env node
import { chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const binPath = resolve("dist/cli/lore.js");
if (!existsSync(binPath)) {
  console.error(`Missing built CLI: ${binPath}`);
  process.exit(1);
}
chmodSync(binPath, 0o755);
