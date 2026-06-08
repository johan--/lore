import type { SearchOptions } from "../core/search/search-memory.js";
import type { ListSessionsOptions } from "../core/retrieval/list-sessions.js";

/** String-valued search filters that map 1:1 from `--flag value` to SearchOptions. */
const SEARCH_STRING_FLAGS = [
  "project",
  "branch",
  "session",
  "source",
  "agent",
  "skill",
  "tool",
  "role",
  "model",
  "since",
  "until",
] as const;

const SESSION_STRING_FLAGS = ["project", "source", "since", "until"] as const;

function isValueToken(value: string | undefined): value is string {
  return value !== undefined && !value.startsWith("--");
}

export interface ParsedSearchArgs {
  /** First positional token, the FTS query. Undefined when only flags are given. */
  query: string | undefined;
  opts: SearchOptions;
  /** When true, rank by recency-blended relevance (findRelevant) instead of pure bm25. */
  relevant: boolean;
  json: boolean;
}

export interface ParsedSessionsArgs {
  opts: ListSessionsOptions;
  json: boolean;
}

/**
 * Parse `lore search` argv into a query, SearchOptions, and the --json toggle.
 * Pure (argv in, struct out) so the mapping is testable without spawning a
 * process. Unknown flags and their bare values are skipped rather than mistaken
 * for the query, so a typo'd flag can't silently become the search term.
 */
export function parseSearchArgs(rest: string[]): ParsedSearchArgs {
  const opts: SearchOptions = {};
  let query: string | undefined;
  let json = false;
  let relevant = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--relevant") {
      relevant = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const value = rest[i + 1];
      if (name === "limit") {
        if (isValueToken(value)) {
          const n = Number(value);
          if (Number.isInteger(n) && n > 0) opts.limit = n;
          i++;
        }
        continue;
      }
      if ((SEARCH_STRING_FLAGS as readonly string[]).includes(name)) {
        if (isValueToken(value)) {
          (opts as Record<string, unknown>)[name] = value;
          i++;
        }
        continue;
      }
      // Unknown flag: skip its value-shaped token too, so typo'd flags do not
      // silently turn their values into the search query.
      if (isValueToken(value)) i++;
      continue;
    }
    if (query === undefined) query = arg;
  }

  return { query, opts, relevant, json };
}

/** Parse `lore sessions` argv into ListSessionsOptions and the --json toggle. */
export function parseSessionsArgs(rest: string[]): ParsedSessionsArgs {
  const opts: ListSessionsOptions = {};
  let json = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const value = rest[i + 1];
      if (name === "limit") {
        if (isValueToken(value)) {
          const n = Number(value);
          if (Number.isInteger(n) && n > 0) opts.limit = n;
          i++;
        }
        continue;
      }
      if ((SESSION_STRING_FLAGS as readonly string[]).includes(name)) {
        if (isValueToken(value)) {
          (opts as Record<string, unknown>)[name] = value;
          i++;
        }
        continue;
      }
      if (isValueToken(value)) i++;
    }
  }

  return { opts, json };
}
