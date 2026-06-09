import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, type Store } from "../store/open-store.js";
import { listTombstones, loadTombstoneSets } from "../store/tombstones.js";
import { upsertSourceFile, upsertMessage, upsertToolCall, upsertSession } from "../store/upsert.js";
import { searchMemory } from "../search/search-memory.js";
import {
  previewForgetSession,
  executeForgetSession,
  previewForgetProject,
  executeForgetProject,
  previewExcludeProject,
  executeExcludeProject,
  removeExclusion,
  listExclusions,
} from "./forget.js";
import { pushRecords } from "./push.js";
import { indexFile } from "../indexer/index-file.js";
import type { MessageRecord, SourceFileRecord, ToolCallRecord } from "../records.js";

// ─── Store helpers ────────────────────────────────────────────────────────────

let db: Store;
let dir: string;

beforeEach(async () => {
  db = openStore(":memory:");
  dir = await mkdtemp(join(tmpdir(), "lore-forget-"));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

function sourceFile(over: Partial<SourceFileRecord> = {}): SourceFileRecord {
  return {
    sourceFileId: "file-1",
    source: "claude-code",
    sessionId: "sess-1",
    kind: "primary",
    agentFile: null,
    path: "/project/file.jsonl",
    byteOffset: 0,
    lineCount: 0,
    prefixSha256: null,
    mtime: null,
    indexedAt: "2026-06-08T00:00:00.000Z",
    ...over,
  };
}

function message(
  over: Partial<MessageRecord> & Pick<MessageRecord, "messageId" | "text">,
): MessageRecord {
  return {
    sourceFileId: "file-1",
    sessionId: "sess-1",
    uuid: over.messageId,
    parentUuid: null,
    seq: 0,
    role: "user",
    timestamp: "2026-06-08T00:00:00.000Z",
    project: "/project",
    branch: "main",
    model: null,
    agent: null,
    skill: null,
    textTruncated: false,
    ...over,
  };
}

function toolCall(
  over: Partial<ToolCallRecord> & Pick<ToolCallRecord, "toolCallId" | "messageId" | "toolName">,
): ToolCallRecord {
  return {
    sourceFileId: "file-1",
    sessionId: "sess-1",
    toolUseId: `tu-${over.toolCallId}`,
    input: "{}",
    result: null,
    isError: null,
    truncated: false,
    ...over,
  };
}

/**
 * Seed a minimal session directly into the store without going through
 * writeRecordBatch (avoids the guard interfering with setup).
 */
function seedSession(
  sessionId: string,
  fileId: string,
  project: string,
  msgs: { id: string; text: string }[],
): void {
  upsertSourceFile(db, sourceFile({ sourceFileId: fileId, sessionId }));
  upsertSession(db, {
    sessionId,
    source: "claude-code",
    project,
    branch: "main",
    firstTimestamp: "2026-06-08T00:00:00.000Z",
    lastTimestamp: "2026-06-08T00:00:00.000Z",
    messageCount: msgs.length,
  });
  msgs.forEach(({ id, text }, seq) => {
    upsertMessage(
      db,
      message({ messageId: id, uuid: id, seq, text, sourceFileId: fileId, sessionId, project }),
    );
    upsertToolCall(db, {
      toolCallId: `tc-${id}`,
      sourceFileId: fileId,
      sessionId,
      messageId: id,
      toolUseId: `tu-${id}`,
      toolName: "Bash",
      input: "{}",
      result: null,
      isError: null,
      truncated: false,
    });
  });
}

// ─── Counting helpers ─────────────────────────────────────────────────────────

function messageCount(sessionId?: string): number {
  if (sessionId !== undefined) {
    return (
      db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?").get(sessionId) as {
        n: number;
      }
    ).n;
  }
  return (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n;
}

function toolCallCount(sessionId?: string): number {
  if (sessionId !== undefined) {
    return (
      db.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE session_id = ?").get(sessionId) as {
        n: number;
      }
    ).n;
  }
  return (db.prepare("SELECT COUNT(*) AS n FROM tool_calls").get() as { n: number }).n;
}

// ─── forget session — preview ─────────────────────────────────────────────────

describe("previewForgetSession", () => {
  it("reports true message and tool call counts without mutating the store", () => {
    seedSession("sess-1", "file-1", "/proj", [
      { id: "m1", text: "alpha" },
      { id: "m2", text: "beta" },
    ]);

    const preview = previewForgetSession(db, "sess-1");

    expect(preview).toEqual({ sessionId: "sess-1", messages: 2, toolCalls: 2 });
    // No mutation.
    expect(messageCount("sess-1")).toBe(2);
    expect(loadTombstoneSets(db).sessions.size).toBe(0);
  });

  it("returns zeros for a session that does not exist", () => {
    const preview = previewForgetSession(db, "nonexistent");
    expect(preview).toEqual({ sessionId: "nonexistent", messages: 0, toolCalls: 0 });
  });
});

// ─── forget session — execute ─────────────────────────────────────────────────

describe("executeForgetSession", () => {
  it("deletes all rows for the session and writes a tombstone", () => {
    seedSession("sess-1", "file-1", "/proj", [{ id: "m1", text: "forgetme" }]);

    executeForgetSession(db, "sess-1");

    expect(messageCount("sess-1")).toBe(0);
    expect(toolCallCount("sess-1")).toBe(0);

    const tombstones = listTombstones(db, "session");
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ kind: "session", value: "sess-1", reason: "forget" });
  });

  it("leaves other sessions intact", () => {
    seedSession("sess-1", "file-1", "/proj", [{ id: "m1", text: "forget session one" }]);
    seedSession("sess-2", "file-2", "/proj", [{ id: "m2", text: "keep session two" }]);

    executeForgetSession(db, "sess-1");

    expect(messageCount("sess-1")).toBe(0);
    expect(messageCount("sess-2")).toBe(1);
    expect(searchMemory(db, "keep")).toHaveLength(1);
    expect(searchMemory(db, "forget")).toHaveLength(0);
  });

  it("removes deleted content from FTS so it is no longer searchable", () => {
    seedSession("sess-1", "file-1", "/proj", [{ id: "m1", text: "unique siren keyword" }]);

    expect(searchMemory(db, "siren")).toHaveLength(1);
    executeForgetSession(db, "sess-1");
    expect(searchMemory(db, "siren")).toHaveLength(0);
  });

  it("returns the counts of what was removed", () => {
    seedSession("sess-1", "file-1", "/proj", [
      { id: "m1", text: "alpha" },
      { id: "m2", text: "beta" },
    ]);

    const result = executeForgetSession(db, "sess-1");

    expect(result).toEqual({ sessionId: "sess-1", messages: 2, toolCalls: 2 });
  });

  it("is transactional: a failure after the delete rolls the delete back", () => {
    seedSession("sess-1", "file-1", "/proj", [{ id: "m1", text: "stable content" }]);

    // Inject a real mid-transaction failure with no mocking: drop the tombstones
    // table so the addTombstone INSERT throws AFTER deleteSessionRows has run
    // inside the same transaction. If executeForgetSession is atomic, the throw
    // rolls the delete back and the messages survive intact.
    db.exec("DROP TABLE tombstones");

    expect(() => executeForgetSession(db, "sess-1")).toThrow();

    // Delete was rolled back — the session is fully intact and still searchable.
    expect(messageCount("sess-1")).toBe(1);
    expect(searchMemory(db, "stable")).toHaveLength(1);
  });
});

// ─── forget project — preview ─────────────────────────────────────────────────

describe("previewForgetProject", () => {
  it("reports affected sessions, message count, tool call count without mutating", () => {
    seedSession("sess-1", "file-1", "/proj-a", [
      { id: "m1", text: "alpha" },
      { id: "m2", text: "beta" },
    ]);

    const preview = previewForgetProject(db, "/proj-a");

    expect(preview.project).toBe("/proj-a");
    expect(preview.sessions).toEqual(["sess-1"]);
    expect(preview.messages).toBe(2);
    expect(preview.toolCalls).toBe(2);
    // No mutation.
    expect(messageCount()).toBe(2);
  });

  it("enumerates sessions via messages table, not sessions rollup", () => {
    // Seed a session whose last message has a null project — the sessions.project
    // rollup would miss it, but messages.project catches the earlier non-null row.
    upsertSourceFile(db, sourceFile({ sourceFileId: "file-x", sessionId: "sess-x" }));
    upsertSession(db, {
      sessionId: "sess-x",
      source: "claude-code",
      project: null, // rollup sees null (last message was null-project)
      branch: "main",
      firstTimestamp: null,
      lastTimestamp: null,
      messageCount: 2,
    });
    // First message: has the target project.
    upsertMessage(
      db,
      message({
        messageId: "mx1",
        seq: 0,
        text: "project message",
        sourceFileId: "file-x",
        sessionId: "sess-x",
        project: "/proj-a",
      }),
    );
    // Second message: null project (cwd change mid-session) — makes sessions.project null.
    upsertMessage(
      db,
      message({
        messageId: "mx2",
        seq: 1,
        text: "cwd changed",
        sourceFileId: "file-x",
        sessionId: "sess-x",
        project: null,
      }),
    );

    const preview = previewForgetProject(db, "/proj-a");

    // The session must appear in the enumeration even though sessions.project is null.
    expect(preview.sessions).toContain("sess-x");
    expect(preview.messages).toBe(1); // only the /proj-a message
  });
});

// ─── forget project — execute ─────────────────────────────────────────────────

describe("executeForgetProject", () => {
  it("deletes project rows and writes one session tombstone per affected session", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "project alpha content" }]);
    seedSession("sess-2", "file-2", "/proj-a", [{ id: "m2", text: "also in project alpha" }]);

    executeForgetProject(db, "/proj-a");

    expect(messageCount()).toBe(0);

    const tombstones = listTombstones(db, "session");
    const values = tombstones.map((t) => t.value).sort();
    expect(values).toEqual(["sess-1", "sess-2"]);

    // No project tombstone written.
    expect(listTombstones(db, "project")).toHaveLength(0);
  });

  it("writes no project tombstone so future sessions from the project resume normally", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "old" }]);

    executeForgetProject(db, "/proj-a");

    expect(listTombstones(db, "project")).toHaveLength(0);
  });

  it("leaves sessions from other projects intact", () => {
    seedSession("sess-1", "file-1", "/proj-a", [{ id: "m1", text: "project a content" }]);
    seedSession("sess-2", "file-2", "/proj-b", [{ id: "m2", text: "project b content" }]);

    executeForgetProject(db, "/proj-a");

    expect(messageCount("sess-2")).toBe(1);
    expect(searchMemory(db, "project b")).toHaveLength(1);
  });

  it("catches the null-last-message-project session that sessions rollup would miss", () => {
    upsertSourceFile(db, sourceFile({ sourceFileId: "file-x", sessionId: "sess-x" }));
    upsertSession(db, {
      sessionId: "sess-x",
      source: "claude-code",
      project: null,
      branch: "main",
      firstTimestamp: null,
      lastTimestamp: null,
      messageCount: 2,
    });
    upsertMessage(
      db,
      message({
        messageId: "mx1",
        seq: 0,
        text: "proj message",
        sourceFileId: "file-x",
        sessionId: "sess-x",
        project: "/proj-a",
      }),
    );
    upsertMessage(
      db,
      message({
        messageId: "mx2",
        seq: 1,
        text: "null cwd",
        sourceFileId: "file-x",
        sessionId: "sess-x",
        project: null,
      }),
    );

    executeForgetProject(db, "/proj-a");

    // The /proj-a message was removed.
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = 'sess-x'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1); // null-project message survives
    // The session got a tombstone.
    expect(listTombstones(db, "session").map((t) => t.value)).toContain("sess-x");
  });
});

// ─── exclude project — preview ────────────────────────────────────────────────

describe("previewExcludeProject", () => {
  it("reports what would be deleted and the standing rule that would be created", () => {
    seedSession("sess-1", "file-1", "/nda-repo", [{ id: "m1", text: "confidential" }]);

    const preview = previewExcludeProject(db, "/nda-repo");

    expect(preview.project).toBe("/nda-repo");
    expect(preview.sessions).toEqual(["sess-1"]);
    expect(preview.messages).toBe(1);
    expect(preview.toolCalls).toBe(1);
    // No mutation.
    expect(messageCount()).toBe(1);
    expect(listTombstones(db, "project")).toHaveLength(0);
  });
});

// ─── exclude project — execute ────────────────────────────────────────────────

describe("executeExcludeProject", () => {
  it("deletes rows and writes a project tombstone", () => {
    seedSession("sess-1", "file-1", "/nda-repo", [{ id: "m1", text: "secret content" }]);

    executeExcludeProject(db, "/nda-repo");

    expect(messageCount()).toBe(0);

    const projectTombstones = listTombstones(db, "project");
    expect(projectTombstones).toHaveLength(1);
    expect(projectTombstones[0]).toMatchObject({
      kind: "project",
      value: "/nda-repo",
      reason: "exclude",
    });
  });

  it("leaves rows from other projects intact", () => {
    seedSession("sess-1", "file-1", "/nda-repo", [{ id: "m1", text: "secret" }]);
    seedSession("sess-2", "file-2", "/safe-repo", [{ id: "m2", text: "public" }]);

    executeExcludeProject(db, "/nda-repo");

    expect(messageCount("sess-2")).toBe(1);
    expect(searchMemory(db, "public")).toHaveLength(1);
  });
});

// ─── removeExclusion ──────────────────────────────────────────────────────────

describe("removeExclusion", () => {
  it("lifts the exclusion rule without restoring deleted data", () => {
    seedSession("sess-1", "file-1", "/nda-repo", [{ id: "m1", text: "gone data" }]);
    executeExcludeProject(db, "/nda-repo");

    expect(listTombstones(db, "project")).toHaveLength(1);
    expect(messageCount()).toBe(0);

    removeExclusion(db, "/nda-repo");

    // Rule is gone.
    expect(listTombstones(db, "project")).toHaveLength(0);
    // Data is NOT restored.
    expect(messageCount()).toBe(0);
    expect(searchMemory(db, "gone")).toHaveLength(0);
  });

  it("is a no-op if no exclusion exists", () => {
    expect(() => removeExclusion(db, "/no-such-repo")).not.toThrow();
  });
});

// ─── listExclusions ───────────────────────────────────────────────────────────

describe("listExclusions", () => {
  it("returns standing project exclusions", () => {
    executeExcludeProject(db, "/repo-a");
    executeExcludeProject(db, "/repo-b");

    const exclusions = listExclusions(db);

    expect(exclusions.map((e) => e.value).sort()).toEqual(["/repo-a", "/repo-b"]);
    expect(exclusions.every((e) => e.kind === "project")).toBe(true);
  });

  it("does not include session tombstones", () => {
    seedSession("sess-1", "file-1", "/proj", [{ id: "m1", text: "forget me" }]);
    executeForgetSession(db, "sess-1");
    executeExcludeProject(db, "/another-proj");

    const exclusions = listExclusions(db);

    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]?.value).toBe("/another-proj");
  });
});

// ─── Resurrection test: session ───────────────────────────────────────────────

describe("resurrection guard — session", () => {
  const SESSION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const PROJECT = "/Users/jordanhindo/claude-lives";

  function primaryLine(uuid: string, text: string): string {
    return JSON.stringify({
      type: "user",
      uuid,
      parentUuid: null,
      timestamp: "2026-06-08T00:00:01.000Z",
      sessionId: SESSION_ID,
      cwd: PROJECT,
      gitBranch: "main",
      message: { role: "user", content: text },
    });
  }

  it("keeps forgotten data gone after a forced full re-index of its source file", async () => {
    // 1. Write the transcript file and index it.
    const filePath = join(dir, `${SESSION_ID}.jsonl`);
    const originalContent = [primaryLine("u-1", "alamo forgotten content")].join("\n") + "\n";
    await writeFile(filePath, originalContent, "utf8");
    await indexFile(db, { path: filePath, redact: false });

    expect(searchMemory(db, "alamo")).toHaveLength(1);

    // 2. Forget the session.
    executeForgetSession(db, SESSION_ID);
    expect(searchMemory(db, "alamo")).toHaveLength(0);

    // 3. Rewrite the file with completely different content so the prefix hash
    //    changes — this forces `indexFile` into "full" mode and exercises the
    //    guard inside `writeRecordBatch`.
    //
    //    Key: appending to the file keeps the prefix (first 4096 bytes)
    //    identical, so `planByteReindex` picks "append", never calling
    //    `writeRecordBatch` at all (a false green). We must change the FIRST
    //    line so the prefix hash differs and the planner chooses "full".
    const rewrittenContent =
      [
        primaryLine("u-rewritten", "completely different first line changes prefix hash"),
        primaryLine("u-1", "alamo forgotten content reappears in rewrite"),
      ].join("\n") + "\n";
    await writeFile(filePath, rewrittenContent, "utf8");

    const result = await indexFile(db, { path: filePath, redact: false });
    expect(result.mode).toBe("full"); // confirmed: writeRecordBatch guard path ran

    // 4. Data must still be gone — the guard dropped both records.
    expect(searchMemory(db, "alamo")).toHaveLength(0);
    expect(searchMemory(db, "different first line")).toHaveLength(0);
  });

  it("keeps forgotten data gone when the same records are pushed directly", () => {
    // Seed directly, forget, then push the same records through pushRecords.
    seedSession(SESSION_ID, "push-file-1", PROJECT, [
      { id: "push-m1", text: "push resurrection test content" },
    ]);

    executeForgetSession(db, SESSION_ID);
    expect(searchMemory(db, "resurrection")).toHaveLength(0);

    // Push the same records through the live write path.
    pushRecords(db, {
      sourceFile: sourceFile({
        sourceFileId: "push-file-1",
        sessionId: SESSION_ID,
        path: join(dir, "push-file-1.jsonl"),
      }),
      messages: [
        message({
          messageId: "push-m1",
          sessionId: SESSION_ID,
          sourceFileId: "push-file-1",
          project: PROJECT,
          text: "push resurrection test content",
        }),
      ],
      toolCalls: [],
    });

    expect(searchMemory(db, "resurrection")).toHaveLength(0);
  });
});

// ─── Resurrection test: project exclude ──────────────────────────────────────

describe("resurrection guard — project exclude", () => {
  it("keeps excluded project data gone after a forced re-index", async () => {
    const SESSION_ID = "11111111-2222-3333-4444-555555555555";
    const PROJECT = "/excluded/project";

    const filePath = join(dir, `${SESSION_ID}.jsonl`);

    function exclLine(uuid: string, text: string): string {
      return JSON.stringify({
        type: "user",
        uuid,
        parentUuid: null,
        timestamp: "2026-06-08T00:00:01.000Z",
        sessionId: SESSION_ID,
        cwd: PROJECT,
        gitBranch: "main",
        message: { role: "user", content: text },
      });
    }

    await writeFile(filePath, exclLine("u-excl", "excluded project secret data") + "\n", "utf8");
    await indexFile(db, { path: filePath, redact: false });

    expect(searchMemory(db, "excluded project")).toHaveLength(1);

    // Exclude the project.
    executeExcludeProject(db, PROJECT);
    expect(searchMemory(db, "excluded project")).toHaveLength(0);

    // Rewrite the file with a different FIRST line so the prefix hash changes
    // and planByteReindex picks "full" mode — this is the only way to guarantee
    // writeRecordBatch runs and the guard is exercised (appending keeps the
    // prefix hash identical and would yield "append" mode, bypassing the guard).
    const rewrittenContent =
      exclLine("u-rewritten", "different first line forces prefix hash change") +
      "\n" +
      exclLine("u-excl", "excluded project secret data reappears in rewrite") +
      "\n";
    await writeFile(filePath, rewrittenContent, "utf8");

    const result = await indexFile(db, { path: filePath, redact: false });
    expect(result.mode).toBe("full"); // guard path actually ran

    expect(searchMemory(db, "excluded project")).toHaveLength(0);
    expect(searchMemory(db, "different first line")).toHaveLength(0);
  });

  it("keeps excluded project data gone when pushed directly", () => {
    const PROJECT = "/excluded/push-project";

    seedSession("excl-sess-1", "excl-file-1", PROJECT, [
      { id: "excl-m1", text: "excluded push resurrection content" },
    ]);

    executeExcludeProject(db, PROJECT);
    expect(searchMemory(db, "excluded push")).toHaveLength(0);

    pushRecords(db, {
      sourceFile: sourceFile({
        sourceFileId: "excl-file-1",
        sessionId: "excl-sess-1",
        path: join(dir, "excl-file-1.jsonl"),
      }),
      messages: [
        message({
          messageId: "excl-m1",
          sessionId: "excl-sess-1",
          sourceFileId: "excl-file-1",
          project: PROJECT,
          text: "excluded push resurrection content",
        }),
      ],
      toolCalls: [],
    });

    expect(searchMemory(db, "excluded push")).toHaveLength(0);
  });
});

// ─── Multi-session isolation ──────────────────────────────────────────────────

describe("multi-session isolation", () => {
  it("forgetting one session in a multi-session store does not affect its neighbor", async () => {
    // Two sessions in a single file (cursor-style multi-session transcript).
    const SESSION_A = "aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const SESSION_B = "bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    seedSession(SESSION_A, "shared-file", "/proj", [
      { id: "ma1", text: "session a content canary" },
    ]);
    seedSession(SESSION_B, "shared-file-b", "/proj", [
      { id: "mb1", text: "session b content survive" },
    ]);

    // Forget only session A.
    executeForgetSession(db, SESSION_A);

    // Session A is gone.
    expect(messageCount(SESSION_A)).toBe(0);
    expect(searchMemory(db, "canary")).toHaveLength(0);

    // Session B is untouched.
    expect(messageCount(SESSION_B)).toBe(1);
    expect(searchMemory(db, "survive")).toHaveLength(1);

    // Only one session tombstone, for A.
    const tombstones = listTombstones(db, "session");
    expect(tombstones.map((t) => t.value)).toEqual([SESSION_A]);
  });

  it("re-pushing the tombstoned session's records does not revive the other session's data", () => {
    const SESSION_A = "cccc0000-cccc-cccc-cccc-cccccccccccc";
    const SESSION_B = "dddd0000-dddd-dddd-dddd-dddddddddddd";

    seedSession(SESSION_A, "file-a", "/proj", [{ id: "ma1", text: "forgotten isolate alpha" }]);
    seedSession(SESSION_B, "file-b", "/proj", [{ id: "mb1", text: "safe isolate beta" }]);

    executeForgetSession(db, SESSION_A);

    // Re-push session A's records.
    pushRecords(db, {
      sourceFile: sourceFile({
        sourceFileId: "file-a",
        sessionId: SESSION_A,
        path: join(dir, "file-a.jsonl"),
      }),
      messages: [
        message({
          messageId: "ma1",
          sessionId: SESSION_A,
          sourceFileId: "file-a",
          project: "/proj",
          text: "forgotten isolate alpha",
        }),
      ],
      toolCalls: [],
    });

    // Session A still gone.
    expect(searchMemory(db, "forgotten isolate")).toHaveLength(0);
    // Session B unaffected.
    expect(searchMemory(db, "safe isolate")).toHaveLength(1);
  });
});
