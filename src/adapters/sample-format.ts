import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface FormatSample {
  /** The directory that was sampled. */
  root: string;
  /** Count of `*.jsonl` files found under `root`. */
  fileCount: number;
  /** Path of the file the lines/keys were sampled from, or null if none. */
  sampleFile: string | null;
  /** Distinct `type` values seen across the sampled lines. */
  lineTypes: string[];
  /** Distinct top-level JSON keys seen across the sampled lines. */
  topLevelKeys: string[];
  /** The raw lines read from the sample file (up to `maxLines`). */
  sampleLines: string[];
}

export interface SampleFormatOptions {
  /** Max raw lines to read from the chosen sample file. Default 20. */
  maxLines?: number;
  /** Max files to walk while counting. Default 500. */
  maxFiles?: number;
}

/**
 * Summarize a transcript directory's on-disk shape so an onboarding agent (or
 * `/recall-setup`) can reason about an unknown harness's format without reading
 * whole files. Walks for `*.jsonl`, picks the first file deterministically
 * (sorted), reads up to `maxLines` raw lines, and best-effort parses each to
 * collect the distinct top-level keys and `type` values. An empty directory
 * yields a zeroed sample rather than throwing.
 */
export async function sampleFormat(
  root: string,
  opts: SampleFormatOptions = {},
): Promise<FormatSample> {
  const maxLines = opts.maxLines ?? 20;
  const maxFiles = opts.maxFiles ?? 500;

  const files: string[] = [];
  await walk(root, files, maxFiles);
  files.sort();

  const empty: FormatSample = {
    root,
    fileCount: files.length,
    sampleFile: null,
    lineTypes: [],
    topLevelKeys: [],
    sampleLines: [],
  };
  const sampleFile = files[0];
  if (sampleFile === undefined) return empty;

  const content = await readFile(sampleFile, "utf8");
  const sampleLines = content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, maxLines);

  const lineTypes = new Set<string>();
  const topLevelKeys = new Set<string>();
  for (const line of sampleLines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const obj = parsed as Record<string, unknown>;
    for (const key of Object.keys(obj)) topLevelKeys.add(key);
    if (typeof obj["type"] === "string") lineTypes.add(obj["type"]);
  }

  return {
    root,
    fileCount: files.length,
    sampleFile,
    lineTypes: [...lineTypes],
    topLevelKeys: [...topLevelKeys],
    sampleLines,
  };
}

async function walk(dir: string, acc: string[], maxFiles: number): Promise<void> {
  if (acc.length >= maxFiles) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.length >= maxFiles) return;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc, maxFiles);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      acc.push(full);
    }
  }
}
