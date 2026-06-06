import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRecallServer } from "./server.js";
import { openStore } from "../core/store/open-store.js";
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
    textTruncated: false,
    ...over,
  };
}

async function connectedClient(setup: (db: ReturnType<typeof openStore>) => void): Promise<Client> {
  const db = openStore(":memory:");
  setup(db);
  const server = createRecallServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function firstText(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content.find((c) => c.type === "text");
  return block?.text ?? "";
}

describe("recall MCP server", () => {
  it("advertises search_memory and get_message", async () => {
    const client = await connectedClient(() => {});
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_message", "search_memory"]);
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
});
