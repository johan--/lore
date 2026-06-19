import { existsSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLoreServer } from "./server.js";
import { openStore, openStoreReadonly } from "../core/store/open-store.js";
import { resolveDbPath } from "../core/db-path.js";
import { logger } from "../core/logger.js";
import {
  missingStoreStatus,
  readLoreStatus,
  unreadableStoreStatus,
  type LoreStatusOptions,
} from "../core/status.js";

/**
 * Start the lore MCP server over stdio against the resolved store. This is the
 * entrypoint an MCP client (Claude Code, Cursor, Cline, …) launches.
 */
export async function startStdioServer(): Promise<void> {
  const dbPath = resolveDbPath();
  const server = createLoreServer({
    withReadStore: (read) => {
      const db = openStoreReadonly(dbPath);
      try {
        return read(db);
      } finally {
        db.close();
      }
    },
    withWriteStore: (write) => {
      const db = openStore(dbPath);
      try {
        return write(db);
      } finally {
        db.close();
      }
    },
    readStatus: (options: LoreStatusOptions) => {
      if (!existsSync(dbPath)) return missingStoreStatus(dbPath, options);
      let db: ReturnType<typeof openStoreReadonly> | undefined;
      try {
        db = openStoreReadonly(dbPath);
        return readLoreStatus(db, options, dbPath);
      } catch {
        return unreadableStoreStatus(dbPath, options);
      } finally {
        db?.close();
      }
    },
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("lore MCP server listening on stdio");
}
