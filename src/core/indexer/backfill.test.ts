import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, type Store } from "../store/open-store.js";
import { backfillDirectory } from "./backfill.js";
import { searchMemory } from "../search/search-memory.js";
import type { SourceAdapter } from "../../adapters/contract.js";
import { computeMessageId } from "../../adapters/claude-code/parse-line.js";

let dir: string;
let db: Store;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "recall-backfill-"));
  db = openStore(":memory:");
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

function userLine(session: string, uuid: string, text: string): string {
  return JSON.stringify({
    type: "user",
    uuid,
    parentUuid: null,
    timestamp: "2026-05-10T00:00:00.000Z",
    sessionId: session,
    cwd: "/repo",
    gitBranch: "main",
    message: { role: "user", content: text },
  });
}

describe("backfillDirectory", () => {
  it("indexes primary files across a directory tree and skips subagents by default", async () => {
    await writeFile(join(dir, "sess-a.jsonl"), userLine("sess-a", "u1", "alpha keyword") + "\n");
    const nested = join(dir, "sess-a", "subagents");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, "agent-xyz.jsonl"),
      userLine("sess-a", "u2", "beta keyword") + "\n",
    );

    const result = await backfillDirectory(db, dir);
    expect(result.files).toBe(1);
    expect(searchMemory(db, "alpha")).toHaveLength(1);
    expect(searchMemory(db, "beta")).toHaveLength(0); // subagent skipped in slice-1 default
  });

  it("re-runs incrementally: unchanged files are skipped, only changed ones reindex", async () => {
    const pathA = join(dir, "sess-a.jsonl");
    const pathB = join(dir, "sess-b.jsonl");
    await writeFile(pathA, userLine("sess-a", "u1", "alpha keyword") + "\n");
    await writeFile(pathB, userLine("sess-b", "u2", "bravo keyword") + "\n");

    const first = await backfillDirectory(db, dir);
    expect(first.files).toBe(2);
    expect(first.filesIndexed).toBe(2);
    expect(first.filesSkipped).toBe(0);

    // Touch only file A with an appended line; B is untouched.
    await writeFile(
      pathA,
      userLine("sess-a", "u1", "alpha keyword") +
        "\n" +
        userLine("sess-a", "u3", "charlie added") +
        "\n",
    );

    const second = await backfillDirectory(db, dir);
    expect(second.files).toBe(2);
    expect(second.filesSkipped).toBe(1); // B unchanged
    expect(second.filesIndexed).toBe(1); // A reindexed (appended)
    expect(searchMemory(db, "charlie")).toHaveLength(1);
  });

  it("indexes through a custom adapter into that adapter's source namespace", async () => {
    await writeFile(
      join(dir, "roll.jsonl"),
      JSON.stringify({ role: "user", uuid: "cu1", text: "codex pull path works" }) + "\n",
    );

    const codexAdapter: SourceAdapter = {
      source: "codex",
      discover: async (root) => [
        { path: join(root, "roll.jsonl"), kind: "primary", agentFile: null, sessionId: "codex-s" },
      ],
      parseLine: (raw, ctx) => {
        const o = JSON.parse(raw) as { role: "user"; uuid: string; text: string };
        return {
          kind: "parsed",
          parsed: {
            message: {
              messageId: computeMessageId(ctx.sourceFileId, o.uuid, ctx.seq),
              sourceFileId: ctx.sourceFileId,
              sessionId: ctx.sessionId,
              uuid: o.uuid,
              parentUuid: null,
              seq: ctx.seq,
              role: o.role,
              timestamp: null,
              project: null,
              branch: null,
              model: null,
              agent: null,
              skill: null,
              text: o.text,
              textTruncated: false,
            },
            toolCalls: [],
          },
        };
      },
    };

    const result = await backfillDirectory(db, dir, { adapter: codexAdapter });
    expect(result.filesIndexed).toBe(1);
    expect(searchMemory(db, "codex", { source: "codex" })).toHaveLength(1);
    expect(searchMemory(db, "codex", { source: "claude-code" })).toHaveLength(0);
  });

  it("indexes subagent files when includeSubagents is set", async () => {
    const nested = join(dir, "sess-a", "subagents");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, "agent-xyz.jsonl"),
      userLine("sess-a", "u2", "gamma keyword") + "\n",
    );

    const result = await backfillDirectory(db, dir, { includeSubagents: true });
    expect(result.files).toBe(1);
    expect(searchMemory(db, "gamma")).toHaveLength(1);
  });
});
