import { createHash } from "node:crypto";

/**
 * Canonical content keying for recurrence-based importance.
 *
 * A memory's *organic content* is what a human or agent actually authored, with
 * the structural control blocks the harness injects (system-reminders, command
 * echoes, CLAUDE.md, hook output) removed and whitespace normalized. Those tags
 * are literal delimiters the harness emits, so stripping them is true by
 * construction — not a guess at what text "means".
 *
 * `contentHash` keys a message by that organic content so the same authored
 * content recurring across distinct sessions can be counted, while injected
 * boilerplate and trivially short messages are excluded (null hash).
 */

/**
 * Harness control blocks whose entire span is injected, not authored. The first
 * group is Claude Code's; the second is other harnesses that share this store
 * (codex and friends), whose standalone injected turns otherwise recur verbatim
 * across thousands of sessions and drown out genuine memories.
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

/** Minimum organic length for a message to be worth counting as recurring. */
export const MIN_RECURRENCE_CHARS = 40;

function stripInjectedBlocks(text: string): string {
  let out = text;
  for (const tag of INJECTED_BLOCKS) {
    const block = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi");
    out = out.replace(block, " ");
  }
  return out;
}

/** Canonical organic content: injected blocks removed, whitespace collapsed. */
export function canonicalContent(text: string): string {
  return stripInjectedBlocks(text).replace(/\s+/g, " ").trim();
}

/** Whether a message carries enough organic content to count toward recurrence. */
export function isRecurrenceEligible(text: string): boolean {
  return canonicalContent(text).length >= MIN_RECURRENCE_CHARS;
}

/**
 * A stable hash of a message's canonical organic content, or null when the
 * message has too little organic content to count as recurring. Computed at write
 * time (stored, indexed) and recomputed for search candidates — same function,
 * same capped text, so the two always agree.
 */
export function contentHash(text: string): string | null {
  if (!isRecurrenceEligible(text)) return null;
  return createHash("sha256").update(canonicalContent(text)).digest("hex");
}
