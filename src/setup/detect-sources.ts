import { homedir } from "node:os";
import { join } from "node:path";
import type { Source } from "../core/records.js";
import { getAdapter } from "../adapters/registry.js";

/** A known harness's transcript location, expressed relative to the home dir. */
interface KnownLocation {
  source: Source;
  /** Path segments under the home dir where this harness writes transcripts. */
  segments: string[];
  /**
   * Locations with the same group are alternatives for the same harness. The
   * first location with discoverable files wins so setup does not double-index
   * compatibility archives and the current session tree.
   */
  group?: string;
}

/**
 * Where each built-in harness writes its transcripts, relative to $HOME. These
 * are the directories `lore setup` probes so a user never has to know the
 * on-disk layout of their own tools.
 */
const KNOWN_LOCATIONS: KnownLocation[] = [
  { source: "claude-code", segments: [".claude", "projects"] },
  { source: "codex", segments: [".codex", "sessions"], group: "codex-history" },
  { source: "codex", segments: [".codex", "archived_sessions"], group: "codex-history" },
];

export interface DetectedSource {
  source: Source;
  /** Absolute directory holding this source's transcripts. */
  dir: string;
  /** How many transcript files the source's adapter discovers there. */
  fileCount: number;
}

async function detectKnownLocation(
  location: KnownLocation,
  home: string,
): Promise<DetectedSource | null> {
  const adapter = getAdapter(location.source);
  if (!adapter) return null;
  const dir = join(home, ...location.segments);
  const files = await adapter.discover(dir);
  if (files.length === 0) return null;
  return { source: location.source, dir, fileCount: files.length };
}

/**
 * Probe the machine for known harnesses that have transcripts on disk. For each
 * built-in location that exists and has discoverable files, return the source,
 * its directory, and the file count. `home` is injectable for testing; it
 * defaults to the real home dir.
 */
export async function detectSources(home: string = homedir()): Promise<DetectedSource[]> {
  const found: DetectedSource[] = [];
  const matchedGroups = new Set<string>();
  for (const location of KNOWN_LOCATIONS) {
    if (location.group && matchedGroups.has(location.group)) continue;
    const detected = await detectKnownLocation(location, home);
    if (!detected) continue;
    found.push(detected);
    if (location.group) matchedGroups.add(location.group);
  }
  return found;
}

/**
 * Detect the active Codex transcript root. Codex has no lifecycle hook today, so
 * scheduled/live catch-up should index the current session tree first and use
 * archived_sessions only as a compatibility fallback.
 */
export async function detectCodexSource(home: string = homedir()): Promise<DetectedSource | null> {
  return detectSource("codex", home);
}

/**
 * Detect the active transcript root for one known source. When a source has
 * compatibility fallbacks (for example Codex archived sessions), locations are
 * tried in priority order and the first discoverable tree wins.
 */
export async function detectSource(
  source: Source,
  home: string = homedir(),
): Promise<DetectedSource | null> {
  for (const location of KNOWN_LOCATIONS) {
    if (location.source !== source) continue;
    const detected = await detectKnownLocation(location, home);
    if (detected) return detected;
  }
  return null;
}
