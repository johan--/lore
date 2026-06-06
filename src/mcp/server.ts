import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Store } from "../core/store/open-store.js";
import { searchMemory } from "../core/search/search-memory.js";
import { getMessage } from "../core/retrieval/get-message.js";
import { elide } from "../core/budget.js";

const SERVER_NAME = "recall";
const SERVER_VERSION = "0.1.0";
const MAX_RESULTS_IN_RESPONSE = 20;

function jsonContent(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Build the recall MCP server over an open store. Kept transport-agnostic so it
 * can be wired to stdio in production and to an in-memory transport in tests.
 */
export function createRecallServer(db: Store): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "search_memory",
    {
      description:
        "Keyword search across all indexed agent session transcripts, ranked by relevance (bm25). " +
        "Returns matching messages with full provenance (message_id, session_id, timestamp, project, branch, model). " +
        "Long text is elided; fetch the full message with get_message(full=true).",
      inputSchema: {
        query: z.string().describe("Keyword or phrase to search for."),
        project: z.string().optional().describe("Filter to a project path (cwd)."),
        branch: z.string().optional().describe("Filter to a git branch."),
        agent: z.string().optional().describe("Filter to a subagent id."),
        skill: z.string().optional().describe("Filter to messages that invoked a named skill."),
        tool: z.string().optional().describe("Filter to messages that called a named tool."),
        role: z.string().optional().describe("Filter by role (user, assistant, system)."),
        model: z.string().optional().describe("Filter by model id."),
        since: z.string().optional().describe("Inclusive ISO-8601 lower bound on timestamp."),
        until: z.string().optional().describe("Inclusive ISO-8601 upper bound on timestamp."),
        limit: z.number().int().positive().optional().describe("Max results (default 20)."),
      },
    },
    async ({ query, project, branch, agent, skill, tool, role, model, since, until, limit }) => {
      const hits = searchMemory(db, query, {
        project,
        branch,
        agent,
        skill,
        tool,
        role,
        model,
        since,
        until,
        limit: limit ?? MAX_RESULTS_IN_RESPONSE,
      }).map((hit) => ({ ...hit, text: elide(hit.text, hit.messageId) }));
      return jsonContent({ count: hits.length, hits });
    },
  );

  server.registerTool(
    "get_message",
    {
      description:
        "Fetch a single message by message_id. Use full=true to retrieve the complete stored text " +
        "for content that was elided in a search_memory result.",
      inputSchema: {
        message_id: z.string().describe("The message_id from a search result."),
        full: z.boolean().optional().describe("Return the complete stored text (default false)."),
      },
    },
    async ({ message_id, full }) => {
      const detail = getMessage(db, message_id, { full: full ?? false });
      if (!detail) return jsonContent({ error: "not_found", message_id });
      return jsonContent(detail);
    },
  );

  return server;
}
