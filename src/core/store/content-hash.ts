import { createHash } from "node:crypto";

/**
 * Canonical content keying for recurrence-aware memory ranking.
 *
 * The hash is derived from authored content, not harness boilerplate. That keeps
 * repeated injected turns from becoming "important" simply because every agent
 * session contains the same control block.
 */
const INJECTED_BLOCKS = [
  "system-reminder",
  "command-message",
  "command-name",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "user-prompt-submit-hook",
  "turn_aborted",
  "personality_spec",
  "collaboration_mode",
  "skill",
];

const INJECTED_BLOCK_REGEXES = INJECTED_BLOCKS.map(
  (tag) => new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi"),
);

export const MIN_RECURRENCE_CHARS = 40;

function stripInjectedBlocks(text: string | null | undefined): string {
  let out = text ?? "";
  for (const block of INJECTED_BLOCK_REGEXES) {
    out = out.replace(block, " ");
  }
  return out;
}

export function canonicalContent(text: string | null | undefined): string {
  return stripInjectedBlocks(text).replace(/\s+/g, " ").trim();
}

export function isRecurrenceEligible(text: string | null | undefined): boolean {
  return canonicalContent(text).length >= MIN_RECURRENCE_CHARS;
}

export function contentHash(text: string | null | undefined): string | null {
  if (!isRecurrenceEligible(text)) return null;
  return createHash("sha256").update(canonicalContent(text)).digest("hex");
}
