#!/usr/bin/env node
import { existsSync } from "node:fs";
import { isMainModule } from "./is-main.js";
import { openStore, openStoreReadonly } from "../core/store/open-store.js";
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
import { listSessions } from "../core/retrieval/list-sessions.js";
import { elide } from "../core/budget.js";
import { parseSearchArgs, parseSessionsArgs } from "./parse-search-args.js";
import { renderSearchResults, renderSessions } from "./render-results.js";

const USAGE = `lore — full-fidelity agent session memory

Usage:
  lore setup [--home <dir>]        Detect known harnesses on this machine, index
                                     their history, verify search, and print how to
                                     register lore in your MCP client
  lore index <dir> [--source <name>] [--subagents] [--redact]
                                     Backfill transcripts under <dir> into the store
                                     (--source picks an adapter; default claude-code)
  lore search <query> [filters] [--json]
                                     Keyword search the store WITHOUT the MCP server.
                                     Filters: --project --branch --session --source --agent
                                     --skill --tool --role --model --since --until --limit
  lore sessions [filters] [--json]
                                     List session rollups (newest first). Filters:
                                     --project --source --since --until --limit
  lore sample <dir>                Summarize a transcript dir's on-disk format
  lore hook [--redact]             Index the current session from a hook payload on stdin
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
      const totals = await backfillDirectory(db, dir, { includeSubagents, redact, adapter });
      process.stdout.write(
        `Indexed ${totals.files} files: ${totals.messages} messages, ` +
          `${totals.toolCalls} tool calls, ${totals.skipped} skipped.\n`,
      );
      db.close();
      return 0;
    }
    case "search": {
      const { query, opts, json } = parseSearchArgs(rest);
      if (!query) {
        process.stderr.write("error: `lore search` requires a <query>\n\n" + USAGE);
        return 1;
      }
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        process.stderr.write(
          `error: no lore store at ${dbPath}. Run \`lore setup\` or \`lore index <dir>\` first.\n`,
        );
        return 1;
      }
      const db = openStoreReadonly(dbPath);
      const hits = searchMemory(db, query, opts).map((hit) => ({
        ...hit,
        text: elide(hit.text, hit.messageId),
      }));
      db.close();
      process.stdout.write(renderSearchResults(hits, json));
      return 0;
    }
    case "sessions": {
      const { opts, json } = parseSessionsArgs(rest);
      const dbPath = resolveDbPath();
      if (!existsSync(dbPath)) {
        process.stderr.write(
          `error: no lore store at ${dbPath}. Run \`lore setup\` or \`lore index <dir>\` first.\n`,
        );
        return 1;
      }
      const db = openStoreReadonly(dbPath);
      const sessions = listSessions(db, opts);
      db.close();
      process.stdout.write(renderSessions(sessions, json));
      return 0;
    }
    case "setup": {
      const homeIdx = rest.indexOf("--home");
      const home = homeIdx >= 0 ? rest[homeIdx + 1] : undefined;
      const db = openStore(resolveDbPath());
      const result = await runSetup(db, home);
      db.close();
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
      await indexFromHookPayload(db, payload, { redact });
      db.close();
      return 0;
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
