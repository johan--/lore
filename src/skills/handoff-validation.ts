export type ValidationIssue = {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
};
export type ValidationReport = { ok: boolean; issues: ValidationIssue[] };

const REQUIRED_SECTIONS = [
  "verified",
  "open",
  "stale",
  "risky",
  "artifacts",
  "proposals",
  "nextActions",
];
const PRIVATE_PROPOSAL_SHAPES = ["todoList", "actionsCreated", "mutations"];

export function validateHandoffPacket(packet: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isRecord(packet)) return report([issue("invalid-handoff", "Handoff must be object")]);

  for (const section of REQUIRED_SECTIONS) {
    if (!Array.isArray(packet[section])) {
      issues.push(issue("missing-section", `Handoff missing ${section} array`, section));
    }
  }
  for (const section of ["verified", "open", "stale", "risky"]) {
    validateClaimList(packet[section], section, issues);
  }
  validateProposals(packet.proposals, issues);
  validateTranscriptDump(packet, issues);
  for (const shape of PRIVATE_PROPOSAL_SHAPES) {
    if (shape in packet)
      issues.push(
        issue("private-proposal-shape", `Use shared proposal vocabulary, not ${shape}`, shape),
      );
  }

  return report(issues);
}

function validateClaimList(value: unknown, section: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => {
    const path = `${section}[${index}]`;
    if (!isRecord(item)) {
      issues.push(issue("invalid-claim", "Claim must be object", path));
      return;
    }
    if (typeof item.text !== "string" || item.text.trim().length === 0) {
      issues.push(issue("invalid-claim", "Claim must include text", path));
    }
    const evidenceIds = item.evidenceIds;
    const uncited = item.uncited === true;
    if ((!Array.isArray(evidenceIds) || evidenceIds.length === 0) && !uncited) {
      issues.push(issue("missing-evidence", "Claims need evidenceIds or uncited:true", path));
    }
  });
}

function validateProposals(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((proposal, index) => {
    const path = `proposals[${index}]`;
    if (!isRecord(proposal)) {
      issues.push(issue("invalid-proposal", "Proposal must be object", path));
      return;
    }
    for (const field of ["kind", "title", "rationale", "risk", "nextAction", "evidenceIds"]) {
      if (!(field in proposal))
        issues.push(issue("invalid-proposal", `Proposal missing ${field}`, path));
    }
  });
}

function validateTranscriptDump(value: unknown, issues: ValidationIssue[], path = "handoff"): void {
  if (typeof value === "string") {
    if (
      value.length > 1500 ||
      value.includes("BEGIN TRANSCRIPT") ||
      value.includes("role: assistant\n")
    ) {
      issues.push(issue("transcript-dump", "Handoff must not dump large transcript blocks", path));
    }
    return;
  }
  if (Array.isArray(value))
    value.forEach((item, index) => validateTranscriptDump(item, issues, `${path}[${index}]`));
  else if (isRecord(value))
    for (const [key, nested] of Object.entries(value))
      validateTranscriptDump(nested, issues, `${path}.${key}`);
}

function report(issues: ValidationIssue[]): ValidationReport {
  return { ok: issues.every((item) => item.severity !== "error"), issues };
}
function issue(
  code: string,
  message: string,
  path?: string,
  severity: "error" | "warning" = "error",
): ValidationIssue {
  return { code, message, path, severity };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
