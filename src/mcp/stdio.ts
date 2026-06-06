import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRecallServer } from "./server.js";
import { openStore } from "../core/store/open-store.js";
import { resolveDbPath } from "../core/db-path.js";
import { logger } from "../core/logger.js";

/**
 * Start the recall MCP server over stdio against the resolved store. This is the
 * entrypoint an MCP client (Claude Code, Cursor, Cline, …) launches.
 */
export async function startStdioServer(): Promise<void> {
  const db = openStore(resolveDbPath());
  const server = createRecallServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("recall MCP server listening on stdio");
}
