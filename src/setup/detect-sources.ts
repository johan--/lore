import { homedir } from "node:os";
import { join } from "node:path";
import type { Source } from "../core/records.js";
import { getAdapter } from "../adapters/registry.js";

/** A known harness's transcript location, expressed relative to the home dir. */
interface KnownLocation {
  source: Source;
  /** Path segments under the home dir where this harness writes transcripts. */
  segments: string[];
}

/**
 * Where each built-in harness writes its transcripts, relative to $HOME. These
 * are the directories `recall setup` probes so a user never has to know the
 * on-disk layout of their own tools.
 */
const KNOWN_LOCATIONS: KnownLocation[] = [
  { source: "claude-code", segments: [".claude", "projects"] },
  { source: "codex", segments: [".codex", "archived_sessions"] },
];

export interface DetectedSource {
  source: Source;
  /** Absolute directory holding this source's transcripts. */
  dir: string;
  /** How many transcript files the source's adapter discovers there. */
  fileCount: number;
}

/**
 * Probe the machine for known harnesses that have transcripts on disk. For each
 * built-in location that exists and has discoverable files, return the source,
 * its directory, and the file count. `home` is injectable for testing; it
 * defaults to the real home dir.
 */
export async function detectSources(home: string = homedir()): Promise<DetectedSource[]> {
  const found: DetectedSource[] = [];
  for (const location of KNOWN_LOCATIONS) {
    const adapter = getAdapter(location.source);
    if (!adapter) continue;
    const dir = join(home, ...location.segments);
    const files = await adapter.discover(dir);
    if (files.length === 0) continue;
    found.push({ source: location.source, dir, fileCount: files.length });
  }
  return found;
}
