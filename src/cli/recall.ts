#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { openStore } from "../core/store/open-store.js";
import { resolveDbPath } from "../core/db-path.js";
import { backfillDirectory } from "../core/indexer/backfill.js";
import { indexFromHookPayload } from "../hooks/index-current.js";
import { startStdioServer } from "../mcp/stdio.js";
import { logger } from "../core/logger.js";
import { getAdapter, adapterSources } from "../adapters/registry.js";
import { sampleFormat } from "../adapters/sample-format.js";

const USAGE = `recall — full-fidelity agent session memory

Usage:
  recall index <dir> [--source <name>] [--subagents] [--redact]
                                     Backfill transcripts under <dir> into the store
                                     (--source picks an adapter; default claude-code)
  recall sample <dir>                Summarize a transcript dir's on-disk format
  recall hook [--redact]             Index the current session from a hook payload on stdin
  recall serve                       Start the MCP server over stdio
  recall help                        Show this help

Env:
  RECALL_DB        Path to the SQLite store (default: ~/.recall/recall.db)
  RECALL_LOG_LEVEL debug|info|warn|error (default: info)
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
        process.stderr.write("error: `recall index` requires a <dir>\n\n" + USAGE);
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
    case "sample": {
      const dir = rest.find((a) => !a.startsWith("--"));
      if (!dir) {
        process.stderr.write("error: `recall sample` requires a <dir>\n\n" + USAGE);
        return 1;
      }
      const sample = await sampleFormat(dir);
      process.stdout.write(
        `Format sample of ${sample.root}\n` +
          `  files:        ${sample.fileCount}\n` +
          `  sampleFile:   ${sample.sampleFile ?? "(none)"}\n` +
          `  line types:   ${sample.lineTypes.join(", ") || "(none)"}\n` +
          `  top-level keys: ${sample.topLevelKeys.join(", ") || "(none)"}\n`,
      );
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
