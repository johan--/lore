import type { SourceAdapter } from "./contract.js";
import { claudeCodeAdapter } from "./claude-code/adapter.js";
import { codexAdapter } from "./codex/adapter.js";
import { openclawAdapter } from "./openclaw/adapter.js";
import { cursorAdapter } from "./cursor/adapter.js";

/**
 * The adapter registry maps a source name to the adapter that ingests it. It is
 * how the CLI selects a parser (`lore index --source codex`) and how a new
 * harness becomes a first-class citizen: drop in an adapter that passes the
 * conformance harness, add it here, and every code path that resolves by source
 * picks it up. Onboarding is a registration, not a core change.
 */
export interface AdapterRegistry {
  get(source: string): SourceAdapter | undefined;
  sources(): string[];
}

/** Build an isolated registry over an explicit adapter list (used in tests). */
export function makeRegistry(adapters: SourceAdapter[]): AdapterRegistry {
  const bySource = new Map<string, SourceAdapter>(adapters.map((a) => [a.source, a] as const));
  return {
    get: (source) => bySource.get(source),
    sources: () => [...bySource.keys()],
  };
}

/** The process-wide registry of built-in adapters. */
const builtins = makeRegistry([claudeCodeAdapter, codexAdapter, openclawAdapter, cursorAdapter]);

export function getAdapter(source: string): SourceAdapter | undefined {
  return builtins.get(source);
}

export function adapterSources(): string[] {
  return builtins.sources();
}
