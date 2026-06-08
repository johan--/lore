#!/usr/bin/env node
import { existsSync } from "node:fs";
import { isMainModule } from "./is-main.js";
import { openStore, openStoreReadonly, type Store } from "../core/store/open-store.js";
import { resolveDbPath } from "../core/db-path.js";
import { backfillDirectory } from "../core/indexer/backfill.js";
import { indexFromHookPayload } from "../hooks/index-current.js";
import { startStdioServer } from "../mcp/stdio.js";
import { logger } from "../core/logger.js";
import { getAdapter, adapterSources } from "../adapters/registry.js";
import { sampleFormat, renderSample } from "../adapters/sample-format.js";
import { runSetup } from "../setup/run-setup.js";
import { renderRegistrationGuide } from "../setup/registration-guide.js";
import { searchMemory } from "../core/search/search-memory.js";
import { findRelevant } from "../core/search/find-relevant.js";
import { listSessions } from "../core/retrieval/list-sessions.js";
import { getMessage } from "../core/retrieval/get-message.js";
import { getContext } from "../core/retrieval/get-context.js";
import { getSession, getSessionWindow } from "../core/retrieval/get-session.js";
import { timeline } from "../core/retrieval/timeline.js";
import { pushRecords } from "../core/ingest/push.js";
import { elide } from "../core/budget.js";
import { parseSearchArgs, parseSessionsArgs } from "./parse-search-args.js";
import {
  parseGetArgs,
  parseContextArgs,
  parseSessionArgs,
  parseTimelineArgs,
} from "./parse-retrieval-args.js";
import {
  renderSearchResults,
  renderSessions,
  renderMessage,
  renderContext,
  renderSessionPage,
  renderSessionWindow,
  renderTimeline,
} from "./render-results.js";

/** Print a `{ error }` envelope to stdout (json) or a message to stderr (human). */
function emitNotFound(kind: string, messageId: string, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify({ error: kind, message_id: messageId }, null, 2) + "\n");
  } else {
    process.stderr.write(`error: no message with id "${messageId}"\n`);
  }
}

const USAGE = `lore — full-fidelity agent session memory

Usage:
  lore setup [--home <dir>]        Detect known harnesses on this machine, index
                                     their history, verify search, and print how to
                                     register lore in your MCP client
  lore index <dir> [--source <name>] [--subagents] [--redact]
                                     Backfill transcripts under <dir> into the store
                                     (--source picks an adapter; default claude-code)
  lore search <query> [filters] [--relevant] [--json]
                                     Keyword search the store WITHOUT the MCP server.
                                     Filters: --project --branch --session --source --agent
                                     --skill --tool --role --model --since --until --limit
                                     --relevant blends keyword strength with recency.
  lore sessions [filters] [--json]
                                     List session rollups (newest first). Filters:
                                     --project --source --since --until --limit
  lore get <message-id> [--full] [--json]
                                     Fetch one message. Default is an elided snippet;
                                     --full returns the complete stored text
  lore context <message-id> [--before N] [--after N] [--json]
                                     Show the neighbor window around a message (default
                                     5 before / 5 after), anchor flagged
  lore session <session-id> [--cursor C] [--limit N] [--json]
  lore session <session-id> --around <message-id> [--before N] [--after N] [--json]
                                     Walk one session's folded timeline a bounded page
                                     at a time (pass --cursor to continue), or jump to a
                                     known message's neighborhood with --around. A session
                                     can run to thousands of messages; there is no dump.
  lore timeline [filters] [--bucket day|hour] [--json]
                                     Bucketed message activity over time (default by day).
                                     Filters: --project --source --since --until
  lore sample <dir>                Summarize a transcript dir's on-disk format
  lore hook [--redact]             Index the current session from a hook payload on stdin
  lore push                        Ingest one JSON batch of normalized records from stdin
                                     (the live-write path; mirrors the MCP push tool). Prints
                                     the write result, or an {error:"invalid_batch"} envelope
                                     and a non-zero exit when the batch is malformed.
  lore serve                       Start the MCP server over stdio
  lore help                        Show this help

Env:
  LORE_DB        Path to the SQLite store (default: ~/.lore/lore.db)
  LORE_LOG_LEVEL debug|info|warn|error (default: info)
`;

/** Read all of stdin to a string. Used by the hook command. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function missingStore(dbPath: string): void {
  process.stderr.write(
    `error: no lore store at ${dbPath}. Run \`lore setup\` or \`lore index <dir>\` first.\n`,
  );
}

function unreadableStore(dbPath: string): void {
  process.stderr.write(
    `error: lore store at ${dbPath} is not readable with the current schema. ` +
      `Run \`lore setup\` or \`lore index <dir>\` first.\n`,
  );
}

function withReadonlyStore<T>(
  dbPath: string,
  read: (db: Store) => T,
): { ok: true; value: T } | { ok: false } {
  let db: Store | undefined;
  try {
    db = openStoreReadonly(dbPath);
    return { ok: true, value: read(db) };
  } catch {
    unreadableStore(dbPath);
    return { ok: false };
  } finally {
    db?.close();
  }
}

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "index": {
      const dir = rest.find((a) => !a.startsWith("--"));
      if (!dir) {
        process.stderr.write("error: `lore index` requires a <dir>\n\n" + USAGE);
        return 1;
      }
      const includeSubagents = rest.includes("--subagents");
      const redact = rest.includes("--redact");
      const sourceIdx = rest.indexOf("--source");
      const sourceName = sourceIdx >= 0 ? rest[sourceIdx + 1] : undefined;
      const adapter = sourceName ? getAdapter(sourceName) : undefined;
      if (sourceName && !adapter) {
        process.stderr.write(
          `error: unknown source "${sourceName}". ` +
            `Known sources: ${adapterSources().join(", ")}\n\n` +
            USAGE,
        );
        return 1;
      }
      const db = openStore(resolveDbPath());
      try {
        const totals = await backfillDirectory(db, dir, { includeSubagents, redact, adapter });
        process.stdout.write(
          `Indexed ${totals.files} files: ${totals.messages} messages, ` +
            `${totals.toolCalls} tool calls, ${totals.skipped} skipped.\n`,
        );
      } finally {
        db.close();
      }
      return 0;
    }
    case "search": {
      const { query, opts, relevant, json } = parseSearchArgs(rest);
      if (!query) {
        process.stderr.write("error: `lore search` requires a <query>\n\n" + USAGE);
        return 1;
      }
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        missingStore(dbPath);
        return 1;
      }
      const result = withReadonlyStore(dbPath, (db) => {
        // `--relevant` blends keyword strength with recency (findRelevant); it is a
        // deliberate superset of MCP's find_relevant — it honors every search
        // filter, including --session, which the MCP tool omits.
        const raw = relevant ? findRelevant(db, query, opts) : searchMemory(db, query, opts);
        const hits = raw.map((hit) => ({ ...hit, text: elide(hit.text, hit.messageId) }));
        return renderSearchResults(hits, json);
      });
      if (!result.ok) return 1;
      process.stdout.write(result.value);
      return 0;
    }
    case "sessions": {
      const { opts, json } = parseSessionsArgs(rest);
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        missingStore(dbPath);
        return 1;
      }
      const result = withReadonlyStore(dbPath, (db) =>
        renderSessions(listSessions(db, opts), json),
      );
      if (!result.ok) return 1;
      process.stdout.write(result.value);
      return 0;
    }
    case "get": {
      const { messageId, full, json } = parseGetArgs(rest);
      if (!messageId) {
        process.stderr.write("error: `lore get` requires a <message-id>\n\n" + USAGE);
        return 1;
      }
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        missingStore(dbPath);
        return 1;
      }
      const result = withReadonlyStore(dbPath, (db) => getMessage(db, messageId, { full }));
      if (!result.ok) return 1;
      if (!result.value) {
        emitNotFound("not_found", messageId, json);
        return 1;
      }
      process.stdout.write(renderMessage(result.value, json));
      return 0;
    }
    case "context": {
      const { messageId, before, after, json } = parseContextArgs(rest);
      if (!messageId) {
        process.stderr.write("error: `lore context` requires a <message-id>\n\n" + USAGE);
        return 1;
      }
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        missingStore(dbPath);
        return 1;
      }
      const result = withReadonlyStore(dbPath, (db) =>
        getContext(db, messageId, { before, after }),
      );
      if (!result.ok) return 1;
      if (!result.value) {
        emitNotFound("not_found", messageId, json);
        return 1;
      }
      process.stdout.write(renderContext(result.value, json));
      return 0;
    }
    case "session": {
      const { sessionId, around, before, after, limit, cursor, json } = parseSessionArgs(rest);
      if (!sessionId) {
        process.stderr.write("error: `lore session` requires a <session-id>\n\n" + USAGE);
        return 1;
      }
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        missingStore(dbPath);
        return 1;
      }
      // `--around` jumps to a known message's neighborhood within the folded
      // session; otherwise it is a bounded, cursor-paged walk from the top.
      const result = withReadonlyStore(dbPath, (db) =>
        around !== undefined
          ? {
              kind: "window" as const,
              around,
              window: getSessionWindow(db, sessionId, around, { before, after }),
            }
          : { kind: "page" as const, page: getSession(db, sessionId, { limit, cursor }) },
      );
      if (!result.ok) return 1;
      if (result.value.kind === "window") {
        if (!result.value.window) {
          emitNotFound("not_found", result.value.around, json);
          return 1;
        }
        process.stdout.write(renderSessionWindow(result.value.window, json));
        return 0;
      }
      process.stdout.write(renderSessionPage(result.value.page, json));
      return 0;
    }
    case "timeline": {
      const { opts, json } = parseTimelineArgs(rest);
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        missingStore(dbPath);
        return 1;
      }
      const result = withReadonlyStore(dbPath, (db) => timeline(db, opts));
      if (!result.ok) return 1;
      process.stdout.write(renderTimeline(result.value, json));
      return 0;
    }
    case "setup": {
      const homeIdx = rest.indexOf("--home");
      const home = homeIdx >= 0 ? rest[homeIdx + 1] : undefined;
      const db = openStore(resolveDbPath());
      let result: Awaited<ReturnType<typeof runSetup>>;
      try {
        result = await runSetup(db, home);
      } finally {
        db.close();
      }
      if (result.indexed.length === 0) {
        process.stdout.write(
          "No known harness transcripts found on this machine.\n" +
            `Known sources: ${adapterSources().join(", ")}.\n` +
            "If your harness writes transcripts elsewhere, run `lore index <dir> --source <name>`.\n\n",
        );
      } else {
        const lines = result.indexed
          .map(
            (s) =>
              `  ${s.source}: ${s.files} files processed, ${s.messages} messages indexed this run, ${s.toolCalls} tool calls indexed this run`,
          )
          .join("\n");
        process.stdout.write(
          `Indexed your history into the lore store:\n${lines}\n` +
            `Search self-check: ${result.verified ? `OK (${result.verifyHits} hit)` : "no hits yet"}\n\n`,
        );
      }
      process.stdout.write(renderRegistrationGuide() + "\n");
      return 0;
    }
    case "sample": {
      const dir = rest.find((a) => !a.startsWith("--"));
      if (!dir) {
        process.stderr.write("error: `lore sample` requires a <dir>\n\n" + USAGE);
        return 1;
      }
      const sample = await sampleFormat(dir);
      process.stdout.write(renderSample(sample));
      return 0;
    }
    case "hook": {
      // Lifecycle hooks must never break the harness: read the payload, index
      // the named transcript best-effort, and always exit 0.
      const payload = await readStdin();
      const redact = rest.includes("--redact");
      const db = openStore(resolveDbPath());
      try {
        await indexFromHookPayload(db, payload, { redact });
      } finally {
        db.close();
      }
      return 0;
    }
    case "push": {
      // The universal live-write path, mirroring the MCP `push` tool: read one
      // JSON batch from stdin, validate it whole, and write it idempotently.
      // Unlike `hook`, push reports failure honestly — a malformed batch returns
      // the `{ error: "invalid_batch" }` envelope and a non-zero exit, so a
      // calling harness can tell a rejected write from an accepted one.
      const raw = await readStdin();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        process.stdout.write(
          JSON.stringify({ error: "invalid_batch", detail: String(err) }, null, 2) + "\n",
        );
        return 1;
      }
      const db = openStore(resolveDbPath());
      try {
        const result = pushRecords(db, parsed);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      } catch (err) {
        process.stdout.write(
          JSON.stringify({ error: "invalid_batch", detail: String(err) }, null, 2) + "\n",
        );
        return 1;
      } finally {
        db.close();
      }
    }
    case "serve": {
      await startStdioServer();
      return 0;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined: {
      process.stdout.write(USAGE);
      return 0;
    }
    default: {
      process.stderr.write(`error: unknown command "${command}"\n\n` + USAGE);
      return 1;
    }
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  runCli(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err) => {
      logger.error("cli failed", { error: String(err) });
      process.exitCode = 1;
    });
}
