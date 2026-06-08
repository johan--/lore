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

export interface ParsedSearchArgs {
  /** First positional token, the FTS query. Undefined when only flags are given. */
  query: string | undefined;
  opts: SearchOptions;
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
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) opts.limit = n;
        i++;
        continue;
      }
      if ((SEARCH_STRING_FLAGS as readonly string[]).includes(name)) {
        if (value !== undefined) {
          (opts as Record<string, unknown>)[name] = value;
          i++;
        }
        continue;
      }
      // Unknown flag: skip just this token. A following bare token still falls
      // through to become the query, so a typo'd flag can't swallow the search.
      continue;
    }
    if (query === undefined) query = arg;
  }

  return { query, opts, json };
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
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) opts.limit = n;
        i++;
        continue;
      }
      if ((SESSION_STRING_FLAGS as readonly string[]).includes(name)) {
        if (value !== undefined) {
          (opts as Record<string, unknown>)[name] = value;
          i++;
        }
        continue;
      }
      if (value !== undefined && !value.startsWith("--")) i++;
    }
  }

  return { opts, json };
}
