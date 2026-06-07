import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLoreServer } from "./server.js";
import { openStore } from "../core/store/open-store.js";
import { resolveDbPath } from "../core/db-path.js";
import { logger } from "../core/logger.js";

/**
 * Start the lore MCP server over stdio against the resolved store. This is the
 * entrypoint an MCP client (Claude Code, Cursor, Cline, …) launches.
 */
export async function startStdioServer(): Promise<void> {
  const db = openStore(resolveDbPath());
  const server = createLoreServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("lore MCP server listening on stdio");
}
