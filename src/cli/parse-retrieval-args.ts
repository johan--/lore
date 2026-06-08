/**
 * Argument parsers for the drill-down retrieval commands (`lore get`,
 * `lore context`, `lore session`, `lore timeline`). Kept pure (argv in, struct
 * out) and separate from `parse-search-args.ts` so each command's shape is
 * testable without spawning a process. The small flag helpers are shared so the
 * commands agree on how `--flag value` and bare `--bool` tokens are read.
 */
import type { TimelineBucket, TimelineOptions } from "../core/retrieval/timeline.js";

/** True when `--name` appears anywhere in argv. */
function hasFlag(rest: string[], name: string): boolean {
  return rest.includes(`--${name}`);
}

/** Value following `--name`, or undefined when absent. */
function flagValue(rest: string[], name: string): string | undefined {
  const idx = rest.indexOf(`--${name}`);
  if (idx < 0) return undefined;
  return rest[idx + 1];
}

/** Positive integer following `--name`, or undefined when absent/invalid. */
function intFlag(rest: string[], name: string): number | undefined {
  const raw = flagValue(rest, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** First bare token that is neither a `--flag` nor a flag's value. */
function firstPositional(rest: string[], valueFlags: readonly string[]): string | undefined {
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg.startsWith("--")) {
      if (valueFlags.includes(arg.slice(2))) i++; // skip its value
      continue;
    }
    return arg;
  }
  return undefined;
}

export interface ParsedGetArgs {
  messageId: string | undefined;
  full: boolean;
  json: boolean;
}

/** `lore get <message-id> [--full] [--json]`. */
export function parseGetArgs(rest: string[]): ParsedGetArgs {
  return {
    messageId: firstPositional(rest, []),
    full: hasFlag(rest, "full"),
    json: hasFlag(rest, "json"),
  };
}

export interface ParsedContextArgs {
  messageId: string | undefined;
  before?: number;
  after?: number;
  json: boolean;
}

/** `lore context <message-id> [--before N] [--after N] [--json]`. */
export function parseContextArgs(rest: string[]): ParsedContextArgs {
  const args: ParsedContextArgs = {
    messageId: firstPositional(rest, ["before", "after"]),
    json: hasFlag(rest, "json"),
  };
  const before = intFlag(rest, "before");
  const after = intFlag(rest, "after");
  if (before !== undefined) args.before = before;
  if (after !== undefined) args.after = after;
  return args;
}

export interface ParsedSessionArgs {
  sessionId: string | undefined;
  around?: string;
  before?: number;
  after?: number;
  limit?: number;
  cursor?: string;
  json: boolean;
}

/**
 * `lore session <session-id> [--around <message-id> --before N --after N]
 * [--limit N] [--cursor C] [--json]`. The `--around` mode jumps to a known
 * message's neighborhood; otherwise it is a bounded page from the cursor.
 */
export function parseSessionArgs(rest: string[]): ParsedSessionArgs {
  const args: ParsedSessionArgs = {
    sessionId: firstPositional(rest, ["around", "before", "after", "limit", "cursor"]),
    json: hasFlag(rest, "json"),
  };
  const around = flagValue(rest, "around");
  const before = intFlag(rest, "before");
  const after = intFlag(rest, "after");
  const limit = intFlag(rest, "limit");
  const cursor = flagValue(rest, "cursor");
  if (around !== undefined) args.around = around;
  if (before !== undefined) args.before = before;
  if (after !== undefined) args.after = after;
  if (limit !== undefined) args.limit = limit;
  if (cursor !== undefined) args.cursor = cursor;
  return args;
}

export interface ParsedTimelineArgs {
  opts: TimelineOptions;
  json: boolean;
}

const TIMELINE_STRING_FLAGS = ["project", "source", "since", "until"] as const;

/** `lore timeline [--project P --source S --since T --until T] [--bucket day|hour] [--json]`. */
export function parseTimelineArgs(rest: string[]): ParsedTimelineArgs {
  const opts: TimelineOptions = {};
  for (const name of TIMELINE_STRING_FLAGS) {
    const value = flagValue(rest, name);
    if (value !== undefined) (opts as Record<string, unknown>)[name] = value;
  }
  const bucket = flagValue(rest, "bucket");
  if (bucket === "day" || bucket === "hour") opts.bucket = bucket as TimelineBucket;
  return { opts, json: hasFlag(rest, "json") };
}
