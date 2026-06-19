#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error(
    "Usage: node skills/lore-recall/scripts/validate-evidence-packet.mjs <packet.json>",
  );
  process.exit(2);
}

const packet = JSON.parse(readFileSync(path, "utf8"));
const issues = [];

function requireField(obj, field, where) {
  if (!(field in obj)) issues.push(`${where} missing ${field}`);
}

for (const field of [
  "question",
  "status",
  "plan",
  "selectedEvidence",
  "answer",
  "gaps",
  "nextQueries",
]) {
  requireField(packet, field, "packet");
}
if (!Array.isArray(packet.plan) || packet.plan.length === 0)
  issues.push("packet plan must be non-empty");
if (!Array.isArray(packet.selectedEvidence)) issues.push("selectedEvidence must be an array");
if (!Array.isArray(packet.gaps)) issues.push("gaps must be an array");

const labels = new Set(["current", "recent", "stale", "unknown"]);
const syncStatuses = new Set(["fresh", "possibly_stale", "unknown"]);
for (const [index, evidence] of (packet.selectedEvidence ?? []).entries()) {
  for (const field of [
    "claim",
    "messageId",
    "sessionId",
    "sourceFileId",
    "source",
    "messageTimestamp",
    "indexedAt",
    "ageFromMessage",
    "ageFromIndex",
    "syncStatus",
    "staleReason",
    "freshness",
    "excerpt",
  ]) {
    requireField(evidence, field, `selectedEvidence[${index}]`);
  }
  if (!labels.has(evidence.freshness)) {
    issues.push(`selectedEvidence[${index}] freshness must be current/recent/stale/unknown`);
  }
  if (!syncStatuses.has(evidence.syncStatus)) {
    issues.push(`selectedEvidence[${index}] syncStatus must be fresh/possibly_stale/unknown`);
  }
  if (evidence.syncStatus !== "fresh" && !evidence.staleReason) {
    issues.push(`selectedEvidence[${index}] staleReason required unless syncStatus is fresh`);
  }
}

if (issues.length > 0) {
  console.error(`evidence packet invalid:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  process.exit(1);
}
console.log("evidence packet validation passed");
