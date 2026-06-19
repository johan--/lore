export type ValidationIssue = {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type BriefWindow = {
  fromIso: string;
  toIso: string;
  localDateLabel: string;
  timeZone: string;
};

const ACTION_CREATED_PATTERN =
  /\b(created|updated|scheduled|wrote|opened|filed|committed|pushed)\b/i;
const REQUIRED_ARRAYS = [
  "completedActivity",
  "openWork",
  "changes",
  "learnedSignals",
  "proposals",
  "memoryCardCandidates",
  "contradictionCandidates",
];
const REQUIRED_MEMORY_KINDS = [
  "decision",
  "claim",
  "commitment",
  "artifact",
  "contradiction",
  "open_question",
];

export function getDefaultBriefWindow(options: { now: Date; timeZone: string }): BriefWindow {
  const toIso = options.now.toISOString();
  const fromIso = new Date(options.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return {
    fromIso,
    toIso,
    localDateLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: options.timeZone,
    }).format(options.now),
    timeZone: options.timeZone,
  };
}

export function validateBriefProposalOnly(brief: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isRecord(brief)) {
    return report([issue("invalid-brief", "Brief must be an object")]);
  }

  if (brief.sideEffects !== false) {
    issues.push(
      issue("proposal-only-violation", "Brief must declare sideEffects:false", "sideEffects"),
    );
  }

  validateWindow(brief.window, issues);
  for (const field of REQUIRED_ARRAYS) {
    if (!Array.isArray(brief[field])) {
      issues.push(issue("invalid-brief", `Brief must include ${field} array`, field));
    }
  }

  validateEvidenceBackedList(brief.completedActivity, "completedActivity", issues, false);
  validateEvidenceBackedList(brief.openWork, "openWork", issues, false);
  validateEvidenceBackedList(brief.changes, "changes", issues, false);
  validateEvidenceBackedList(brief.learnedSignals, "learnedSignals", issues, false);
  validateProposals(brief.proposals, issues);
  validateMemoryCardCandidates(brief.memoryCardCandidates, issues);
  validateContradictions(brief.contradictionCandidates, issues);
  scanActionCreatedLanguage(brief.proposals, issues, "proposals");

  return report(issues);
}

function validateWindow(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue("invalid-window", "Brief must include window object", "window"));
    return;
  }
  for (const field of ["fromIso", "toIso", "localDateLabel", "timeZone"]) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) {
      issues.push(
        issue("invalid-window", `window.${field} must be non-empty string`, `window.${field}`),
      );
    }
  }
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
        issues.push(issue("invalid-proposal", `Proposal must include ${field}`, path));
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
  const kinds = new Set<string>();
  value.forEach((candidate, index) => {
    const path = `memoryCardCandidates[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("invalid-memory-card-candidate", "Candidate must be object", path));
      return;
    }
    if (typeof candidate.kind === "string") kinds.add(candidate.kind);
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
    for (const side of ["sideA", "sideB"]) {
      const sideValue = candidate[side];
      if (!isRecord(sideValue)) {
        issues.push(issue("missing-contradiction-evidence", `${side} missing`, `${path}.${side}`));
        continue;
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

function validateEvidenceBackedList(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  allowEmptyEvidence: boolean,
): void {
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateEvidenceIds(
      item.evidenceIds,
      `${path}[${index}]`,
      issues,
      "missing-evidence",
      allowEmptyEvidence,
    );
  });
}

function validateEvidenceIds(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  code: string,
  allowEmpty = false,
): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push(issue(code, `${path} must include evidenceIds`, path));
  }
}

function scanActionCreatedLanguage(
  value: unknown,
  issues: ValidationIssue[],
  path = "brief",
): void {
  if (typeof value === "string") {
    if (ACTION_CREATED_PATTERN.test(value)) {
      issues.push(issue("proposal-only-violation", `Action-created wording found: ${value}`, path));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanActionCreatedLanguage(item, issues, `${path}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      scanActionCreatedLanguage(nested, issues, `${path}.${key}`);
    }
  }
}

function report(issues: ValidationIssue[]): ValidationReport {
  return { ok: issues.filter((item) => item.severity === "error").length === 0, issues };
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
