import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Store } from "../core/store/open-store.js";
import { searchMemory } from "../core/search/search-memory.js";
import { findRelevant } from "../core/search/find-relevant.js";
import { getMessage } from "../core/retrieval/get-message.js";
import { getContext } from "../core/retrieval/get-context.js";
import { getSession } from "../core/retrieval/get-session.js";
import { listSessions } from "../core/retrieval/list-sessions.js";
import { timeline } from "../core/retrieval/timeline.js";
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
        source: z
          .string()
          .optional()
          .describe("Filter to a harness namespace (e.g. claude-code, codex)."),
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
    async ({
      query,
      project,
      branch,
      source,
      agent,
      skill,
      tool,
      role,
      model,
      since,
      until,
      limit,
    }) => {
      const hits = searchMemory(db, query, {
        project,
        branch,
        source,
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

  server.registerTool(
    "get_context",
    {
      description:
        "Return the neighbor messages around an anchor message_id, in order, with the anchor " +
        "flagged. The window never crosses the anchor's file or session boundary. Text is elided.",
      inputSchema: {
        message_id: z.string().describe("The anchor message_id to center the window on."),
        before: z.number().int().nonnegative().optional().describe("Neighbors before (default 5)."),
        after: z.number().int().nonnegative().optional().describe("Neighbors after (default 5)."),
      },
    },
    async ({ message_id, before, after }) => {
      const ctx = getContext(db, message_id, { before, after });
      if (!ctx) return jsonContent({ error: "not_found", message_id });
      return jsonContent(ctx);
    },
  );

  server.registerTool(
    "get_session",
    {
      description:
        "Return one logical session as a single chronological timeline, folding the primary thread " +
        "and all subagent files together. Paginated by an opaque cursor. Text is elided.",
      inputSchema: {
        session_id: z.string().describe("The session_id to fetch."),
        cursor: z.string().optional().describe("Opaque cursor from a prior page."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max messages per page (default 100)."),
      },
    },
    async ({ session_id, cursor, limit }) => {
      return jsonContent(getSession(db, session_id, { cursor, limit }));
    },
  );

  server.registerTool(
    "list_sessions",
    {
      description:
        "List sessions as rollups (message count, first/last activity, project), most-recent first. " +
        "Filterable by project, source namespace, and a time window on last activity.",
      inputSchema: {
        project: z.string().optional().describe("Filter to a project path (cwd)."),
        source: z.string().optional().describe("Filter to a harness namespace."),
        since: z.string().optional().describe("Inclusive ISO-8601 lower bound on last activity."),
        until: z.string().optional().describe("Inclusive ISO-8601 upper bound on last activity."),
        limit: z.number().int().positive().optional().describe("Max sessions (default 50)."),
      },
    },
    async ({ project, source, since, until, limit }) => {
      const sessions = listSessions(db, { project, source, since, until, limit });
      return jsonContent({ count: sessions.length, sessions });
    },
  );

  server.registerTool(
    "timeline",
    {
      description:
        "Bucketed message activity over time (by day or hour), in chronological order. Filterable " +
        "by project, source namespace, and a time window.",
      inputSchema: {
        project: z.string().optional().describe("Filter to a project path (cwd)."),
        source: z.string().optional().describe("Filter to a harness namespace."),
        since: z.string().optional().describe("Inclusive ISO-8601 lower bound on timestamp."),
        until: z.string().optional().describe("Inclusive ISO-8601 upper bound on timestamp."),
        bucket: z.enum(["day", "hour"]).optional().describe("Bucket granularity (default day)."),
      },
    },
    async ({ project, source, since, until, bucket }) => {
      const buckets = timeline(db, { project, source, since, until, bucket });
      return jsonContent({ buckets });
    },
  );

  server.registerTool(
    "find_relevant",
    {
      description:
        "Like search_memory, but ranked by relevance blended with recency (a fresh memory outranks " +
        "an equally-relevant stale one). Use when 'what's most useful now' matters more than pure " +
        "keyword strength. Supports the same dimension filters. Text is elided.",
      inputSchema: {
        query: z.string().describe("Keyword or phrase to search for."),
        project: z.string().optional().describe("Filter to a project path (cwd)."),
        branch: z.string().optional().describe("Filter to a git branch."),
        source: z.string().optional().describe("Filter to a harness namespace."),
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
    async ({
      query,
      project,
      branch,
      source,
      agent,
      skill,
      tool,
      role,
      model,
      since,
      until,
      limit,
    }) => {
      const hits = findRelevant(db, query, {
        project,
        branch,
        source,
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

  return server;
}
