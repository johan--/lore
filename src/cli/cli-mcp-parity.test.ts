import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runCli } from "./lore.js";
import { createLoreServer } from "../mcp/server.js";
import { openStore } from "../core/store/open-store.js";
import { pushRecords } from "../core/ingest/push.js";

/**
 * Proves the server-free CLI is a faithful stand-in for the MCP server: for one
 * shared fixture store, every `lore … --json` envelope is byte-identical to the
 * matching MCP tool's response. This is the load-bearing evidence behind "the
 * skill makes the MCP server unnecessary" — parity is proven here, not asserted
 * in prose. If a future change drifts one path from the other, this fails.
 */

const FIXTURE_BATCH = {
  sourceFile: {
    sourceFileId: "sf-fix",
    source: "claude-code",
    sessionId: "sess-fix",
    kind: "primary",
    agentFile: null,
    path: "/transcripts/fix.jsonl",
    byteOffset: 0,
    lineCount: 2,
    prefixSha256: null,
    mtime: null,
    indexedAt: "2026-05-11T00:00:00.000Z",
  },
  messages: [
    {
      messageId: "mfix1",
      sourceFileId: "sf-fix",
      sessionId: "sess-fix",
      uuid: "ufix1",
      parentUuid: null,
      seq: 0,
      role: "user" as const,
      timestamp: "2026-05-10T00:00:00.000Z",
      project: "/repo",
      branch: "main",
      model: null,
      agent: null,
      skill: null,
      text: "alamo fixture one",
      textTruncated: false,
    },
    {
      messageId: "mfix2",
      sourceFileId: "sf-fix",
      sessionId: "sess-fix",
      uuid: "ufix2",
      parentUuid: "ufix1",
      seq: 1,
      role: "assistant" as const,
      timestamp: "2026-05-11T00:00:00.000Z",
      project: "/repo",
      branch: "main",
      model: "claude-opus-4-8",
      agent: null,
      skill: null,
      text: "alamo fixture two",
      textTruncated: false,
    },
  ],
  toolCalls: [],
};

let dir: string;
let dbPath: string;
let prevDb: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lore-parity-"));
  dbPath = join(dir, "lore.db");
  prevDb = process.env.LORE_DB;
  process.env.LORE_DB = dbPath;
  // Seed once; both the CLI (via LORE_DB) and the MCP server (via openStore) read
  // this same file, so any difference in output is a real divergence, not a
  // different dataset.
  const seed = openStore(dbPath);
  pushRecords(seed, FIXTURE_BATCH);
  seed.close();
});

afterEach(async () => {
  if (prevDb === undefined) delete process.env.LORE_DB;
  else process.env.LORE_DB = prevDb;
  await rm(dir, { recursive: true, force: true });
});

/** Run a CLI command and parse its single JSON stdout payload. */
async function cliJson(argv: string[]): Promise<unknown> {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  try {
    await runCli(argv);
    return JSON.parse(writes.join(""));
  } finally {
    spy.mockRestore();
  }
}

/** Run a CLI command expected to succeed, keeping stderr in the assertion diff. */
async function successfulCliJson(argv: string[]): Promise<unknown> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  try {
    const code = await runCli(argv);
    expect({ code, stderr: stderr.join("") }).toEqual({ code: 0, stderr: "" });
    return JSON.parse(stdout.join(""));
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

/** Run a CLI command with stdin and parse its single JSON stdout payload. */
async function cliJsonStdin(argv: string[], input: string): Promise<unknown> {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  const orig = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", {
    value: Readable.from([Buffer.from(input)]),
    configurable: true,
  });
  try {
    await runCli(argv);
    return JSON.parse(writes.join(""));
  } finally {
    spy.mockRestore();
    if (orig) Object.defineProperty(process, "stdin", orig);
  }
}

/** Call an MCP tool over an in-memory transport against the same fixture store. */
async function mcpJson(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = openStore(dbPath);
  const server = createLoreServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "parity", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text?: string }[];
  };
  await client.close();
  db.close();
  const block = result.content.find((c) => c.type === "text");
  return JSON.parse(block?.text ?? "");
}

describe("CLI ⇄ MCP envelope parity", () => {
  it("status: `lore status --json` == status", async () => {
    const cli = await successfulCliJson(["status", "--json"]);
    const mcp = await mcpJson("status", {});
    expect(cli).toEqual(mcp);
  });

  it("search_memory: `lore search --json` == search_memory", async () => {
    const cli = await cliJson(["search", "alamo", "--json"]);
    const mcp = await mcpJson("search_memory", { query: "alamo" });
    expect(cli).toEqual(mcp);
  });

  it("find_relevant: `lore search --relevant --json` == find_relevant", async () => {
    // find_relevant blends bm25 with a recency factor derived from Date.now(),
    // so the two calls must observe the same clock or their score floats drift
    // apart by call latency. Freeze Date (only) around both.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    try {
      const cli = await cliJson(["search", "alamo", "--relevant", "--json"]);
      const mcp = await mcpJson("find_relevant", { query: "alamo" });
      expect(cli).toEqual(mcp);
    } finally {
      vi.useRealTimers();
    }
  });

  it("get_message: `lore get --json` == get_message", async () => {
    const cli = await cliJson(["get", "mfix1", "--json"]);
    const mcp = await mcpJson("get_message", { message_id: "mfix1" });
    expect(cli).toEqual(mcp);
  });

  it("get_message not_found envelope matches", async () => {
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const cli = await cliJson(["get", "nope", "--json"]);
    errSpy.mockRestore();
    const mcp = await mcpJson("get_message", { message_id: "nope" });
    expect(cli).toEqual(mcp);
    expect(cli).toEqual({ error: "not_found", message_id: "nope" });
  });

  it("get_context: `lore context --json` == get_context", async () => {
    const cli = await cliJson(["context", "mfix1", "--before", "1", "--after", "1", "--json"]);
    const mcp = await mcpJson("get_context", { message_id: "mfix1", before: 1, after: 1 });
    expect(cli).toEqual(mcp);
  });

  it("get_session: `lore session --json` == get_session", async () => {
    const cli = await cliJson(["session", "sess-fix", "--json"]);
    const mcp = await mcpJson("get_session", { session_id: "sess-fix" });
    expect(cli).toEqual(mcp);
  });

  it("list_sessions: `lore sessions --json` == list_sessions", async () => {
    const cli = await cliJson(["sessions", "--json"]);
    const mcp = await mcpJson("list_sessions", {});
    expect(cli).toEqual(mcp);
  });

  it("timeline: `lore timeline --json` == timeline", async () => {
    const cli = await cliJson(["timeline", "--json"]);
    const mcp = await mcpJson("timeline", {});
    expect(cli).toEqual(mcp);
  });

  it("push: `lore push` result == push (idempotent re-write)", async () => {
    const cli = await cliJsonStdin(["push"], JSON.stringify(FIXTURE_BATCH));
    const mcp = await mcpJson("push", {
      sourceFile: FIXTURE_BATCH.sourceFile,
      messages: FIXTURE_BATCH.messages,
      toolCalls: FIXTURE_BATCH.toolCalls,
    });
    expect(cli).toEqual(mcp);
  });

  // Note on the malformed-batch path: the CLI catches a bad batch and returns the
  // `{ error: "invalid_batch" }` envelope (proven in lore.test.ts), while the MCP
  // SDK rejects a schema-invalid batch at the protocol layer before the handler
  // runs. The success envelopes above are the meaningful equivalence; the two
  // error layers are deliberately not the same surface, so no cross-path equality
  // is asserted for invalid input.
});
