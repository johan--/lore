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
  "memoryCardCandidates",
  "contradictionCandidates",
  "nextActions",
];
const PRIVATE_PROPOSAL_SHAPES = ["todoList", "actionsCreated", "mutations"];
const REQUIRED_MEMORY_KINDS = [
  "decision",
  "claim",
  "commitment",
  "artifact",
  "contradiction",
  "open_question",
];
const TRANSCRIPT_MARKER_PATTERN =
  /(\brole:\s*(user|assistant|system)\b|BEGIN TRANSCRIPT|END TRANSCRIPT|<\|user\|>|<\|assistant\|>|User:|Assistant:)/i;

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
  validateClaimList(packet.artifacts, "artifacts", issues);
  validateClaimList(packet.nextActions, "nextActions", issues);
  validateProposals(packet.proposals, issues);
  validateMemoryCardCandidates(packet.memoryCardCandidates, issues);
  validateContradictions(packet.contradictionCandidates, issues);
  validateTranscriptDump(packet, issues);

  for (const shape of PRIVATE_PROPOSAL_SHAPES) {
    if (shape in packet) {
      issues.push(
        issue("private-proposal-shape", `Use shared proposal vocabulary, not ${shape}`, shape),
      );
    }
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

    const hasText = typeof item.text === "string" && item.text.trim().length > 0;
    const hasPath = typeof item.path === "string" && item.path.trim().length > 0;
    if (!hasText && !hasPath) {
      issues.push(issue("invalid-claim", "Claim must include text or path", path));
    }

    const uncited = item.uncited === true;
    if (!uncited) {
      validateEvidenceIds(item.evidenceIds, path, issues, "missing-evidence");
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

    for (const field of ["kind", "title", "why"]) {
      if (typeof proposal[field] !== "string" || proposal[field].trim().length === 0) {
        issues.push(issue("invalid-proposal", `Proposal missing ${field}`, path));
      }
    }
    if (proposal.sideEffects !== false) {
      issues.push(
        issue("invalid-proposal", "Proposal must declare sideEffects:false", `${path}.sideEffects`),
      );
    }
    validateEvidenceIds(proposal.evidenceIds, path, issues, "missing-proposal-evidence");
  });
}

function validateMemoryCardCandidates(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  const allowedKinds = new Set(REQUIRED_MEMORY_KINDS);
  const kinds = new Set<string>();
  value.forEach((candidate, index) => {
    const path = `memoryCardCandidates[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("invalid-memory-card-candidate", "Candidate must be object", path));
      return;
    }
    if (typeof candidate.kind === "string") {
      kinds.add(candidate.kind);
      if (!allowedKinds.has(candidate.kind)) {
        issues.push(
          issue(
            "invalid-memory-card-candidate",
            `Unknown memory card kind ${candidate.kind}`,
            `${path}.kind`,
          ),
        );
      }
    } else {
      issues.push(issue("invalid-memory-card-candidate", "Candidate missing kind", `${path}.kind`));
    }
    validateEvidenceIds(candidate.evidenceIds, path, issues, "missing-memory-card-evidence");
  });

  for (const kind of REQUIRED_MEMORY_KINDS) {
    if (!kinds.has(kind)) {
      issues.push(
        issue("missing-memory-card-kind", `memoryCardCandidates missing required kind ${kind}`),
      );
    }
  }
}

function validateContradictions(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((candidate, index) => {
    const path = `contradictionCandidates[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("invalid-contradiction", "Contradiction candidate must be object", path));
      return;
    }
    if (candidate.status !== "unresolved") {
      issues.push(issue("invalid-contradiction", "Contradiction status must be unresolved", path));
    }

    for (const side of ["sideA", "sideB"]) {
      const sideValue = candidate[side];
      if (!isRecord(sideValue)) {
        issues.push(issue("missing-contradiction-evidence", `${side} missing`, `${path}.${side}`));
        continue;
      }
      if (typeof sideValue.claim !== "string" || sideValue.claim.trim().length === 0) {
        issues.push(issue("invalid-contradiction", `${side} missing claim`, `${path}.${side}`));
      }
      validateEvidenceIds(
        sideValue.evidenceIds,
        `${path}.${side}`,
        issues,
        "missing-contradiction-evidence",
      );
    }
  });
}

function validateEvidenceIds(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  code: string,
): void {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((id) => typeof id !== "string" || id.trim().length === 0)
  ) {
    issues.push(issue(code, `${path} must include evidenceIds`, path));
  }
}

function validateTranscriptDump(value: unknown, issues: ValidationIssue[]): void {
  const stats = collectTranscriptStats(value);
  if (stats.longStringPath !== null) {
    issues.push(
      issue(
        "transcript-dump",
        "Handoff must not dump large transcript blocks",
        stats.longStringPath,
      ),
    );
  }
  if (stats.markerCount >= 3 || stats.totalTranscriptLikeChars > 2200) {
    issues.push(
      issue(
        "transcript-dump",
        "Handoff must not stitch together many transcript fragments",
        "handoff",
      ),
    );
  }
}

function collectTranscriptStats(
  value: unknown,
  path = "handoff",
): { longStringPath: string | null; markerCount: number; totalTranscriptLikeChars: number } {
  let longStringPath: string | null = null;
  let markerCount = 0;
  let totalTranscriptLikeChars = 0;

  function visit(nested: unknown, nestedPath: string): void {
    if (typeof nested === "string") {
      const hasMarker = TRANSCRIPT_MARKER_PATTERN.test(nested);
      if (nested.length > 1500 || (hasMarker && nested.length > 500)) {
        longStringPath ??= nestedPath;
      }
      if (hasMarker) {
        markerCount += 1;
        totalTranscriptLikeChars += nested.length;
      }
      return;
    }
    if (Array.isArray(nested)) {
      nested.forEach((item, index) => visit(item, `${nestedPath}[${index}]`));
      return;
    }
    if (isRecord(nested)) {
      for (const [key, item] of Object.entries(nested)) {
        visit(item, `${nestedPath}.${key}`);
      }
    }
  }

  visit(value, path);
  return { longStringPath, markerCount, totalTranscriptLikeChars };
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
