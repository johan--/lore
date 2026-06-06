/**
 * Opt-in secret redaction. Off by default — recall is a local-only store, so the
 * baseline posture is "keep everything verbatim." When a user opts in (via the
 * indexer flag), message text and tool payloads are passed through this pass so
 * obvious credentials never land in the index.
 *
 * The patterns are deliberately conservative: well-known credential shapes with
 * low false-positive risk. This is a safety net, not a guarantee — it will not
 * catch every secret, and over-aggressive matching would corrupt legitimate
 * content, which for a memory tool is its own kind of data loss.
 */

const REDACTED = "[REDACTED]";

/** Ordered list of credential patterns. Each match is replaced with [REDACTED]. */
const PATTERNS: RegExp[] = [
  // PEM private key blocks (any flavor), including the body.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // OpenAI-style keys: sk- followed by a long token.
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_ + 36 chars.
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  // AWS access key ids.
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  // Slack tokens.
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // Bearer tokens in an Authorization header.
  /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
];

export interface RedactionResult {
  text: string;
  redactions: number;
}

export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let redactions = 0;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match) => {
      redactions++;
      // Keep the `Bearer ` prefix readable; replace only the token body.
      if (match.startsWith("Bearer ")) return `Bearer ${REDACTED}`;
      return REDACTED;
    });
  }
  return { text: out, redactions };
}
