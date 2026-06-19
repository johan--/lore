#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error(
    "Usage: node skills/lore-recall/scripts/validate-evidence-packet.mjs <packet.json>",
  );
  process.exit(2);
}

let packet;
try {
  packet = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`evidence packet invalid:\n- ${detail}`);
  process.exit(1);
}
const issues = [];

function requireField(obj, field, where) {
  if (!(field in obj)) issues.push(`${where} missing ${field}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

if (!isRecord(packet)) {
  issues.push("packet must be an object");
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
  if (isRecord(packet)) requireField(packet, field, "packet");
}
if (!Array.isArray(packet?.plan) || packet.plan.length === 0)
  issues.push("packet plan must be non-empty");
if (!Array.isArray(packet?.selectedEvidence)) issues.push("selectedEvidence must be an array");
if (!Array.isArray(packet?.gaps)) issues.push("gaps must be an array");

const labels = new Set(["current", "recent", "stale", "unknown"]);
const syncStatuses = new Set(["fresh", "possibly_stale", "unknown"]);
for (const [index, evidence] of (packet.selectedEvidence ?? []).entries()) {
  if (!isRecord(evidence)) {
    issues.push(`selectedEvidence[${index}] must be an object`);
    continue;
  }
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
  if (evidence.syncStatus === "fresh" && evidence.staleReason != null) {
    issues.push(`selectedEvidence[${index}] staleReason must be null when syncStatus is fresh`);
  }
}

if (issues.length > 0) {
  console.error(`evidence packet invalid:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  process.exit(1);
}
console.log("evidence packet validation passed");
