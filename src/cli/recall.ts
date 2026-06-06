#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { openStore } from "../core/store/open-store.js";
import { resolveDbPath } from "../core/db-path.js";
import { backfillDirectory } from "../core/indexer/backfill.js";
import { startStdioServer } from "../mcp/stdio.js";
import { logger } from "../core/logger.js";

const USAGE = `recall — full-fidelity agent session memory

Usage:
  recall index <dir> [--subagents]   Backfill transcripts under <dir> into the store
  recall serve                       Start the MCP server over stdio
  recall help                        Show this help

Env:
  RECALL_DB        Path to the SQLite store (default: ~/.recall/recall.db)
  RECALL_LOG_LEVEL debug|info|warn|error (default: info)
`;

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "index": {
      const dir = rest.find((a) => !a.startsWith("--"));
      if (!dir) {
        process.stderr.write("error: `recall index` requires a <dir>\n\n" + USAGE);
        return 1;
      }
      const includeSubagents = rest.includes("--subagents");
      const db = openStore(resolveDbPath());
      const totals = await backfillDirectory(db, dir, { includeSubagents });
      process.stdout.write(
        `Indexed ${totals.files} files: ${totals.messages} messages, ` +
          `${totals.toolCalls} tool calls, ${totals.skipped} skipped.\n`,
      );
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

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runCli(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err) => {
      logger.error("cli failed", { error: String(err) });
      process.exitCode = 1;
    });
}
