import type { Store } from "../store/open-store.js";
import {
  addTombstone,
  removeTombstone,
  listTombstones,
  type Tombstone,
} from "../store/tombstones.js";
import { deleteSessionRows, deleteProjectRows } from "../store/upsert.js";

/**
 * Deep module for forget/exclude operations. This is the only code that
 * combines row deletion with tombstone writes; callers (CLI, tests) go through
 * this interface and never reach into the store helpers directly.
 *
 * Verb semantics:
 *   forget  — point-in-time removal. Deletes what is there now; future sessions
 *              for the same project continue to be remembered.
 *   exclude — standing rule. Deletes existing rows AND bars all future captures
 *              from the project until the exclusion is explicitly removed.
 *
 * Every execute function runs in a single transaction so a crash mid-delete
 * cannot leave the store half-wiped.
 */

// ─── Preview shapes ───────────────────────────────────────────────────────────

export interface ForgetSessionPreview {
  sessionId: string;
  messages: number;
  toolCalls: number;
}

export interface ForgetProjectPreview {
  project: string;
  sessions: string[];
  messages: number;
  toolCalls: number;
}

export interface ExcludeProjectPreview {
  project: string;
  sessions: string[];
  messages: number;
  toolCalls: number;
}

// ─── Forget session ───────────────────────────────────────────────────────────

/**
 * Count the messages and tool calls that `executeForgetSession` would remove,
 * without touching the store.
 */
export function previewForgetSession(db: Store, sessionId: string): ForgetSessionPreview {
  const { messages } = db
    .prepare("SELECT COUNT(*) AS messages FROM messages WHERE session_id = ?")
    .get(sessionId) as { messages: number };
  const { toolCalls } = db
    .prepare("SELECT COUNT(*) AS toolCalls FROM tool_calls WHERE session_id = ?")
    .get(sessionId) as { toolCalls: number };
  return { sessionId, messages, toolCalls };
}

/**
 * Delete all rows for `sessionId` and write a `(session, sessionId, "forget")`
 * tombstone in one transaction so re-indexing or `push` cannot resurrect them.
 */
export function executeForgetSession(db: Store, sessionId: string): ForgetSessionPreview {
  const preview = previewForgetSession(db, sessionId);
  db.transaction(() => {
    deleteSessionRows(db, sessionId);
    addTombstone(db, { kind: "session", value: sessionId, reason: "forget" });
  })();
  return preview;
}

// ─── Forget project ───────────────────────────────────────────────────────────

/**
 * Enumerate the sessions affected by a project forget. Uses `messages`, not
 * the `sessions` rollup, because `sessions.project` reflects only the last
 * non-null project on the session — it can miss sessions whose final message
 * carried a null project.
 */
function affectedSessions(db: Store, project: string): string[] {
  const rows = db
    .prepare("SELECT DISTINCT session_id AS sessionId FROM messages WHERE project = ?")
    .all(project) as { sessionId: string }[];
  return rows.map((r) => r.sessionId);
}

/**
 * Count what `executeForgetProject` would remove, without touching the store.
 * Note: sessions returned here are enumerated from `messages` (see spec).
 */
export function previewForgetProject(db: Store, project: string): ForgetProjectPreview {
  const sessions = affectedSessions(db, project);
  const { messages } = db
    .prepare("SELECT COUNT(*) AS messages FROM messages WHERE project = ?")
    .get(project) as { messages: number };
  const { toolCalls } = db
    .prepare(
      "SELECT COUNT(*) AS toolCalls FROM tool_calls WHERE message_id IN (SELECT message_id FROM messages WHERE project = ?)",
    )
    .get(project) as { toolCalls: number };
  return { project, sessions, messages, toolCalls };
}

/**
 * Delete all rows for `project` and write one `(session, …, "forget")` tombstone
 * per enumerated session in one transaction. No project tombstone is written —
 * future sessions from this project continue to be remembered (use
 * `executeExcludeProject` for a standing rule).
 */
export function executeForgetProject(db: Store, project: string): ForgetProjectPreview {
  const preview = previewForgetProject(db, project);
  db.transaction(() => {
    deleteProjectRows(db, project);
    for (const sessionId of preview.sessions) {
      addTombstone(db, { kind: "session", value: sessionId, reason: "forget" });
    }
  })();
  return preview;
}

// ─── Exclude project ─────────────────────────────────────────────────────────

/**
 * Count what `executeExcludeProject` would remove and what standing rule it
 * would create, without touching the store.
 */
export function previewExcludeProject(db: Store, project: string): ExcludeProjectPreview {
  const sessions = affectedSessions(db, project);
  const { messages } = db
    .prepare("SELECT COUNT(*) AS messages FROM messages WHERE project = ?")
    .get(project) as { messages: number };
  const { toolCalls } = db
    .prepare(
      "SELECT COUNT(*) AS toolCalls FROM tool_calls WHERE message_id IN (SELECT message_id FROM messages WHERE project = ?)",
    )
    .get(project) as { toolCalls: number };
  return { project, sessions, messages, toolCalls };
}

/**
 * Delete all rows for `project` and write a `(project, project, "exclude")`
 * tombstone in one transaction. This is strictly stronger than forget: the
 * tombstone bars all future captures from the project, not just the rows that
 * existed at the time of the call.
 */
export function executeExcludeProject(db: Store, project: string): ExcludeProjectPreview {
  const preview = previewExcludeProject(db, project);
  db.transaction(() => {
    deleteProjectRows(db, project);
    addTombstone(db, { kind: "project", value: project, reason: "exclude" });
  })();
  return preview;
}

// ─── Exclusion management ─────────────────────────────────────────────────────

/**
 * Lift a standing project exclusion. Future captures from `project` will be
 * allowed again. Does NOT restore any previously deleted data — the deletion
 * was irreversible.
 */
export function removeExclusion(db: Store, project: string): void {
  removeTombstone(db, "project", project);
}

/**
 * List all standing project exclusions, in insertion order.
 */
export function listExclusions(db: Store): Tombstone[] {
  return listTombstones(db, "project");
}
