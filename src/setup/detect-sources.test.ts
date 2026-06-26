import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  detectedSourceNames,
  detectCodexSource,
  detectSource,
  detectSources,
  hasDetectedSourceLocation,
} from "./detect-sources.js";

function writeHermesDb(path: string): void {
  const db = new Database(path);
  db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT)");
  db.prepare("INSERT INTO sessions (id) VALUES (?)").run("sess-hermes-detect");
  db.prepare("INSERT INTO messages (session_id) VALUES (?)").run("sess-hermes-detect");
  db.close();
}

describe("detectSources", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "lore-detect-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("returns nothing for a home dir with no known transcript locations", async () => {
    const found = await detectSources(home);
    expect(found).toEqual([]);
  });

  it("detects claude-code transcripts under ~/.claude/projects with a file count", async () => {
    const dir = join(home, ".claude", "projects", "myproj");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "session-a.jsonl"), "{}\n");
    await writeFile(join(dir, "session-b.jsonl"), "{}\n");

    const found = await detectSources(home);

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe("claude-code");
    expect(found[0]?.dir).toBe(join(home, ".claude", "projects"));
    expect(found[0]?.fileCount).toBe(2);
  });

  it("detects codex rollout transcripts under the current ~/.codex/sessions tree", async () => {
    const dir = join(home, ".codex", "sessions", "2026", "06", "06");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "rollout-2026-a.jsonl"), "{}\n");

    const found = await detectSources(home);

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe("codex");
    expect(found[0]?.fileCount).toBe(1);
  });

  it("uses archived codex sessions only as a fallback when the current tree is absent", async () => {
    const dir = join(home, ".codex", "archived_sessions");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "rollout-2026-a.jsonl"), "{}\n");

    const found = await detectSources(home);

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe("codex");
    expect(found[0]?.dir).toBe(join(home, ".codex", "archived_sessions"));
  });

  it("does not double-detect archived codex sessions when the current tree exists", async () => {
    const sessionsDir = join(home, ".codex", "sessions", "2026", "06", "06");
    const archiveDir = join(home, ".codex", "archived_sessions");
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(sessionsDir, "rollout-2026-current.jsonl"), "{}\n");
    await writeFile(join(archiveDir, "rollout-2026-archived.jsonl"), "{}\n");

    const found = await detectSources(home);

    expect(found).toHaveLength(1);
    expect(found[0]?.dir).toBe(join(home, ".codex", "sessions"));
    expect(found[0]?.fileCount).toBe(1);
  });

  it("detectCodexSource uses current sessions before archived sessions", async () => {
    const sessionsDir = join(home, ".codex", "sessions", "2026", "06", "09");
    const archiveDir = join(home, ".codex", "archived_sessions");
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(sessionsDir, "rollout-2026-current.jsonl"), "{}\n");
    await writeFile(join(archiveDir, "rollout-2026-archived.jsonl"), "{}\n");

    const found = await detectCodexSource(home);

    expect(found?.source).toBe("codex");
    expect(found?.dir).toBe(join(home, ".codex", "sessions"));
    expect(found?.fileCount).toBe(1);
  });

  it("detectSource finds claude-code under the active Claude projects tree", async () => {
    const dir = join(home, ".claude", "projects", "myproj");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "session-a.jsonl"), "{}\n");

    const found = await detectSource("claude-code", home);

    expect(found?.source).toBe("claude-code");
    expect(found?.dir).toBe(join(home, ".claude", "projects"));
    expect(found?.fileCount).toBe(1);
  });

  it("detectSource finds hermes under the global Hermes root", async () => {
    const dir = join(home, ".hermes");
    await mkdir(dir, { recursive: true });
    writeHermesDb(join(dir, "state.db"));

    const found = await detectSource("hermes", home);

    expect(found?.source).toBe("hermes");
    expect(found?.dir).toBe(join(home, ".hermes"));
    expect(found?.fileCount).toBe(1);
  });

  it("reports which registered sources have detected sync locations", () => {
    expect(detectedSourceNames()).toEqual(["claude-code", "codex", "hermes"]);
    expect(hasDetectedSourceLocation("hermes")).toBe(true);
    expect(hasDetectedSourceLocation("openclaw")).toBe(false);
  });
});
