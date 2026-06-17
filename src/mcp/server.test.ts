import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLoreServer } from "./server.js";
import { openStore, openStoreReadonly } from "../core/store/open-store.js";
import { SCHEMA_VERSION } from "../core/store/migrate.js";
import { upsertMessage } from "../core/store/upsert.js";
import type { MessageRecord } from "../core/records.js";

function msg(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "text">,
): MessageRecord {
  return {
    sourceFileId: "sf-1",
    sessionId: "sess-1",
    uuid: over.messageId,
    parentUuid: null,
    seq: 0,
    role: "user",
    timestamp: "2026-05-10T00:00:00.000Z",
    project: "/repo",
    branch: "main",
    model: "claude-opus-4-8",
    agent: null,
    skill: null,
    textTruncated: false,
    ...over,
  };
}

async function connectedClient(setup: (db: ReturnType<typeof openStore>) => void): Promise<Client> {
  const db = openStore(":memory:");
  setup(db);
  const server = createLoreServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function connectedFileClient(path: string): Promise<Client> {
  const server = createLoreServer({
    withReadStore: (read) => {
      const db = openStoreReadonly(path);
      try {
        return read(db);
      } finally {
        db.close();
      }
    },
    withWriteStore: (write) => {
      const db = openStore(path);
      try {
        return write(db);
      } finally {
        db.close();
      }
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function firstText(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content.find((c) => c.type === "text");
  return block?.text ?? "";
}

describe("lore MCP server", () => {
  it("advertises the full retrieval surface", async () => {
    const client = await connectedClient(() => {});
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "find_relevant",
      "get_context",
      "get_message",
      "get_session",
      "list_sessions",
      "push",
      "search_memory",
      "timeline",
    ]);
  });

  it("push ingests a normalized batch that becomes searchable over the wire", async () => {
    const client = await connectedClient(() => {});
    const result = await client.callTool({
      name: "push",
      arguments: {
        sourceFile: {
          sourceFileId: "codex-file-1",
          source: "codex",
          sessionId: "codex-sess-1",
          kind: "primary",
          agentFile: null,
          path: "/rollouts/codex-file-1.jsonl",
          byteOffset: 0,
          lineCount: 0,
          prefixSha256: null,
          mtime: null,
          indexedAt: "2026-05-10T00:00:00.000Z",
        },
        messages: [
          {
            messageId: "m1",
            sourceFileId: "codex-file-1",
            sessionId: "codex-sess-1",
            uuid: "u1",
            parentUuid: null,
            seq: 0,
            role: "user",
            timestamp: "2026-05-10T00:00:00.000Z",
            project: "/work",
            branch: "main",
            model: null,
            agent: null,
            skill: null,
            text: "pushed over the wire from codex",
            textTruncated: false,
          },
        ],
      },
    });
    const payload = JSON.parse(firstText(result as never)) as {
      sourceFileId: string;
      messages: number;
    };
    expect(payload.messages).toBe(1);

    const search = await client.callTool({
      name: "search_memory",
      arguments: { query: "codex", source: "codex" },
    });
    const hits = JSON.parse(firstText(search as never)) as { hits: { messageId: string }[] };
    expect(hits.hits.map((h) => h.messageId)).toEqual(["m1"]);
  });

  it("search_memory returns a hit with provenance over stdio contract", async () => {
    const client = await connectedClient((db) => {
      upsertMessage(db, msg({ messageId: "m1", text: "remember the alamo" }));
    });
    const result = await client.callTool({ name: "search_memory", arguments: { query: "alamo" } });
    const payload = JSON.parse(firstText(result as never)) as {
      count: number;
      hits: { messageId: string; sessionId: string; project: string }[];
    };
    expect(payload.count).toBe(1);
    expect(payload.hits[0]?.messageId).toBe("m1");
    expect(payload.hits[0]?.sessionId).toBe("sess-1");
    expect(payload.hits[0]?.project).toBe("/repo");
  });

  it("search_memory can read a compatible store from a newer Lore version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-mcp-newer-"));
    const path = join(dir, "lore.db");
    try {
      const db = openStore(path);
      upsertMessage(db, msg({ messageId: "m-newer", text: "remember newer alamo" }));
      db.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
      db.close();

      const client = await connectedFileClient(path);
      const result = await client.callTool({
        name: "search_memory",
        arguments: { query: "alamo" },
      });
      const payload = JSON.parse(firstText(result as never)) as {
        count: number;
        hits: { messageId: string }[];
      };
      expect(payload.count).toBe(1);
      expect(payload.hits[0]?.messageId).toBe("m-newer");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("push refuses to write to a store from a newer Lore version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-mcp-newer-"));
    const path = join(dir, "lore.db");
    try {
      const db = openStore(path);
      db.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
      db.close();

      const client = await connectedFileClient(path);
      const result = await client.callTool({
        name: "push",
        arguments: {
          sourceFile: {
            sourceFileId: "sf-newer-push",
            source: "codex",
            sessionId: "sess-newer-push",
            kind: "primary",
            agentFile: null,
            path: "/transcripts/newer.jsonl",
            byteOffset: 0,
            lineCount: 1,
            prefixSha256: null,
            mtime: null,
            resumeToken: null,
            indexedAt: "2026-05-10T00:00:00.000Z",
          },
          messages: [
            {
              messageId: "m-newer-push",
              sourceFileId: "sf-newer-push",
              sessionId: "sess-newer-push",
              uuid: "u1",
              parentUuid: null,
              seq: 0,
              role: "user",
              timestamp: "2026-05-10T00:00:00.000Z",
              project: "/repo",
              branch: "main",
              model: null,
              agent: null,
              skill: null,
              text: "should not write",
              textTruncated: false,
            },
          ],
          toolCalls: [],
        },
      });
      const payload = JSON.parse(firstText(result as never)) as { error: string; detail: string };
      expect(payload.error).toBe("newer_store");
      expect(payload.detail).toContain("Update Lore before running this write command");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("search_memory honors a dimension filter passed over the wire", async () => {
    const client = await connectedClient((db) => {
      upsertMessage(
        db,
        msg({ messageId: "m1", uuid: "u1", seq: 0, text: "alamo here", project: "/a" }),
      );
      upsertMessage(
        db,
        msg({ messageId: "m2", uuid: "u2", seq: 1, text: "alamo there", project: "/b" }),
      );
    });
    const result = await client.callTool({
      name: "search_memory",
      arguments: { query: "alamo", project: "/b" },
    });
    const payload = JSON.parse(firstText(result as never)) as {
      count: number;
      hits: { messageId: string }[];
    };
    expect(payload.count).toBe(1);
    expect(payload.hits[0]?.messageId).toBe("m2");
  });

  it("get_message returns full text with full=true", async () => {
    const big = "alamo " + "z".repeat(10_000);
    const client = await connectedClient((db) => {
      upsertMessage(db, msg({ messageId: "m1", text: big }));
    });
    const elided = await client.callTool({
      name: "get_message",
      arguments: { message_id: "m1" },
    });
    expect(firstText(elided as never)).toContain("chars elided");

    const full = await client.callTool({
      name: "get_message",
      arguments: { message_id: "m1", full: true },
    });
    const detail = JSON.parse(firstText(full as never)) as { text: string };
    expect(detail.text).toBe(big);
  });

  it("get_context returns a neighbor window flagging the anchor over the wire", async () => {
    const client = await connectedClient((db) => {
      for (let i = 0; i < 4; i++) {
        upsertMessage(db, msg({ messageId: `m${i}`, uuid: `u${i}`, seq: i, text: `line ${i}` }));
      }
    });
    const result = await client.callTool({
      name: "get_context",
      arguments: { message_id: "m2", before: 1, after: 1 },
    });
    const payload = JSON.parse(firstText(result as never)) as {
      messages: { messageId: string; isAnchor: boolean }[];
    };
    expect(payload.messages.map((m) => m.messageId)).toEqual(["m1", "m2", "m3"]);
    expect(payload.messages.find((m) => m.isAnchor)?.messageId).toBe("m2");
  });

  it("find_relevant returns ranked hits over the wire", async () => {
    const client = await connectedClient((db) => {
      upsertMessage(db, msg({ messageId: "m1", text: "alamo remembered" }));
    });
    const result = await client.callTool({
      name: "find_relevant",
      arguments: { query: "alamo" },
    });
    const payload = JSON.parse(firstText(result as never)) as {
      count: number;
      hits: { messageId: string }[];
    };
    expect(payload.count).toBe(1);
    expect(payload.hits[0]?.messageId).toBe("m1");
  });
});
