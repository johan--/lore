import { open, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";

/** The on-disk container shape the sampler recognized. */
export type SampleKind = "jsonl" | "sqlite" | "json-array" | "json-object" | "unknown" | "empty";

/** One table's shape in a sampled SQLite database. */
export interface TableShape {
  name: string;
  columns: string[];
  rowCount: number;
}

export interface FormatSample {
  /** The directory that was sampled. */
  root: string;
  /** The container format detected for the sample file. */
  kind: SampleKind;
  /** Count of candidate transcript files found under `root`. */
  fileCount: number;
  /** Path of the file the shape was sampled from, or null if none. */
  sampleFile: string | null;
  /** JSONL: distinct `type` values seen across the sampled lines. */
  lineTypes: string[];
  /** JSONL / JSON-object: distinct top-level keys seen. */
  topLevelKeys: string[];
  /** JSONL: the raw lines read from the sample file (up to `maxLines`). */
  sampleLines: string[];
  /** SQLite: each table's name, columns, and row count. */
  tables: TableShape[];
  /** JSON array: distinct keys seen across the array's element objects. */
  elementKeys: string[];
  /** JSON array: number of elements, or null when not a JSON array. */
  elementCount: number | null;
}

export interface SampleFormatOptions {
  /** Max raw lines to read from a JSONL sample file. Default 20. */
  maxLines?: number;
  /** Max candidate files to walk while counting. Default 500. */
  maxFiles?: number;
  /** Max array elements to inspect for keys. Default 50. */
  maxElements?: number;
  /** Skip parsing a whole-file JSON larger than this many bytes. Default 25 MB. */
  maxJsonBytes?: number;
}

const SQLITE_MAGIC = "SQLite format 3";
const CANDIDATE_EXTENSIONS = [".jsonl", ".db", ".vscdb", ".sqlite", ".sqlite3", ".json"];

/**
 * Summarize a transcript directory's on-disk shape so an onboarding agent (or
 * `/lore-setup`) can reason about an unknown harness's format without reading
 * whole files. It recognizes three container shapes and reports what each needs:
 *
 *  - **JSONL** (Claude Code, Codex, openclaw): distinct top-level keys and line
 *    `type` values plus a few raw sample lines.
 *  - **SQLite** (Cursor, Hermes): the table names, their columns, and row counts —
 *    read via the file header (`SQLite format 3`), never by loading the DB, so a
 *    multi-GB database is safe to sample.
 *  - **Whole-file JSON array**: the element count and the union of element keys.
 *
 * Discovery walks for candidate files (by extension), picks the first
 * deterministically (sorted), and detects its kind by sniffing the header for
 * SQLite and otherwise by extension/parse. An empty directory yields a zeroed
 * `empty` sample rather than throwing.
 */
export async function sampleFormat(
  root: string,
  opts: SampleFormatOptions = {},
): Promise<FormatSample> {
  const maxFiles = opts.maxFiles ?? 500;

  const files: string[] = [];
  await walk(root, files, maxFiles);
  files.sort();

  const base: FormatSample = {
    root,
    kind: "empty",
    fileCount: files.length,
    sampleFile: null,
    lineTypes: [],
    topLevelKeys: [],
    sampleLines: [],
    tables: [],
    elementKeys: [],
    elementCount: null,
  };

  // Prefer a real transcript store over a stray config file: rank SQLite and
  // JSONL ahead of loose `.json`, so pointing at e.g. `~/.hermes` samples
  // `state.db`, not a config object that happens to sort first.
  const sampleFile = pickSample(files);
  if (sampleFile === undefined) return base;
  base.sampleFile = sampleFile;

  if (await isSqlite(sampleFile)) {
    base.kind = "sqlite";
    base.tables = describeSqlite(sampleFile);
    return base;
  }

  if (sampleFile.endsWith(".jsonl")) {
    return { ...base, ...(await describeJsonl(sampleFile, opts)) };
  }

  if (sampleFile.endsWith(".json")) {
    return { ...base, ...(await describeJson(sampleFile, opts)) };
  }

  base.kind = "unknown";
  return base;
}

/** Rank: SQLite-ish (0) > JSONL (1) > JSON (2); tie-break on the sorted path. */
function pickSample(sortedFiles: string[]): string | undefined {
  const rank = (f: string): number => {
    if (f.endsWith(".jsonl")) return 1;
    if (f.endsWith(".json")) return 2;
    return 0; // .db / .vscdb / .sqlite / .sqlite3
  };
  let best: string | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const f of sortedFiles) {
    const r = rank(f);
    if (r < bestRank) {
      best = f;
      bestRank = r;
    }
  }
  return best;
}

/** Read the 16-byte header and test for the SQLite magic string. */
async function isSqlite(path: string): Promise<boolean> {
  let fh;
  try {
    fh = await open(path, "r");
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    return buf.toString("utf8", 0, SQLITE_MAGIC.length) === SQLITE_MAGIC;
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

/** Enumerate tables, their columns, and row counts without loading the DB. */
function describeSqlite(path: string): TableShape[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const shapes: TableShape[] = [];
    for (const { name } of tables) {
      const columns = (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map(
        (c) => c.name,
      );
      const count = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number };
      shapes.push({ name, columns, rowCount: count?.n ?? 0 });
    }
    return shapes;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

/** JSONL: collect line types, top-level keys, and a few raw sample lines. */
async function describeJsonl(
  path: string,
  opts: SampleFormatOptions,
): Promise<Partial<FormatSample>> {
  const maxLines = opts.maxLines ?? 20;
  const content = await readFile(path, "utf8");
  const sampleLines = content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, maxLines);

  const lineTypes = new Set<string>();
  const topLevelKeys = new Set<string>();
  for (const line of sampleLines) {
    const obj = parseObject(line);
    if (!obj) continue;
    for (const key of Object.keys(obj)) topLevelKeys.add(key);
    if (typeof obj["type"] === "string") lineTypes.add(obj["type"]);
  }
  return {
    kind: "jsonl",
    lineTypes: [...lineTypes],
    topLevelKeys: [...topLevelKeys],
    sampleLines,
  };
}

/** Whole-file JSON: report array element keys, or a top-level object's keys. */
async function describeJson(
  path: string,
  opts: SampleFormatOptions,
): Promise<Partial<FormatSample>> {
  const maxElements = opts.maxElements ?? 50;
  const maxJsonBytes = opts.maxJsonBytes ?? 25 * 1024 * 1024;

  const size = (await stat(path)).size;
  if (size > maxJsonBytes) return { kind: "unknown" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { kind: "unknown" };
  }

  if (Array.isArray(parsed)) {
    const elementKeys = new Set<string>();
    for (const el of parsed.slice(0, maxElements)) {
      if (el && typeof el === "object" && !Array.isArray(el)) {
        for (const key of Object.keys(el as Record<string, unknown>)) elementKeys.add(key);
      }
    }
    return { kind: "json-array", elementKeys: [...elementKeys], elementCount: parsed.length };
  }

  if (parsed && typeof parsed === "object") {
    return { kind: "json-object", topLevelKeys: Object.keys(parsed as Record<string, unknown>) };
  }
  return { kind: "unknown" };
}

/**
 * Render a `FormatSample` as the human-readable block `lore sample` prints. Kept
 * pure (returns a string) so the CLI stays a thin dispatcher and the rendering is
 * directly testable. The body adapts to the detected `kind` so a SQLite or JSON
 * source reports its real shape instead of empty JSONL fields.
 */
export function renderSample(sample: FormatSample): string {
  const head =
    `Format sample of ${sample.root}\n` +
    `  kind:         ${sample.kind}\n` +
    `  files:        ${sample.fileCount}\n` +
    `  sampleFile:   ${sample.sampleFile ?? "(none)"}\n`;

  if (sample.kind === "sqlite") {
    if (sample.tables.length === 0) return head + "  tables:       (none readable)\n";
    const tables = sample.tables
      .map((t) => `    - ${t.name} (${t.rowCount} rows): ${t.columns.join(", ")}`)
      .join("\n");
    return head + `  tables:\n${tables}\n`;
  }

  if (sample.kind === "json-array") {
    return (
      head +
      `  elements:     ${sample.elementCount ?? 0}\n` +
      `  element keys: ${sample.elementKeys.join(", ") || "(none)"}\n`
    );
  }

  if (sample.kind === "json-object") {
    return head + `  top-level keys: ${sample.topLevelKeys.join(", ") || "(none)"}\n`;
  }

  return (
    head +
    `  line types:   ${sample.lineTypes.join(", ") || "(none)"}\n` +
    `  top-level keys: ${sample.topLevelKeys.join(", ") || "(none)"}\n`
  );
}

function parseObject(line: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

async function walk(dir: string, acc: string[], maxFiles: number): Promise<void> {
  if (acc.length >= maxFiles) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  // Collect this level's candidate files before descending, so a transcript
  // store high in the tree (e.g. a root `state.db`) is never starved by the
  // `maxFiles` cap filling up inside a huge subdirectory first.
  const subdirs: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      subdirs.push(full);
    } else if (entry.isFile() && CANDIDATE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      if (acc.length < maxFiles) acc.push(full);
    }
  }
  for (const sub of subdirs) {
    if (acc.length >= maxFiles) return;
    await walk(sub, acc, maxFiles);
  }
}
