/**
 * Minimal structured logger. Writes JSON lines to stderr so it never corrupts
 * MCP stdio (which uses stdout) or CLI piping. Replaces console.log per house
 * rules.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function envLevel(): LogLevel {
  const raw = process.env.LORE_LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[envLevel()]) return;
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...fields });
  process.stderr.write(`${line}\n`);
}

export const logger: Logger = {
  debug: (msg, fields) => emit("debug", msg, fields),
  info: (msg, fields) => emit("info", msg, fields),
  warn: (msg, fields) => emit("warn", msg, fields),
  error: (msg, fields) => emit("error", msg, fields),
};
