import type { Store } from "./open-store.js";
import {
  type MessageRecord,
  type SessionRecord,
  type SourceFileRecord,
  type ToolCallRecord,
} from "../records.js";

/**
 * Idempotent writers. All keyed on a stable primary key with ON CONFLICT DO
 * UPDATE, so re-indexing the same file never duplicates rows and never churns
 * the FTS rowid (UPDATE keeps the rowid; INSERT OR REPLACE would not).
 */

export function upsertSourceFile(db: Store, rec: SourceFileRecord): void {
  db.prepare(
    `INSERT INTO source_files
       (source_file_id, source, session_id, kind, agent_file, path,
        byte_offset, line_count, prefix_sha256, mtime, resume_token, indexed_at)
     VALUES
       (@sourceFileId, @source, @sessionId, @kind, @agentFile, @path,
        @byteOffset, @lineCount, @prefixSha256, @mtime, @resumeToken, @indexedAt)
     ON CONFLICT(source_file_id) DO UPDATE SET
       session_id=excluded.session_id, kind=excluded.kind, agent_file=excluded.agent_file,
       path=excluded.path, byte_offset=excluded.byte_offset, line_count=excluded.line_count,
       prefix_sha256=excluded.prefix_sha256, mtime=excluded.mtime,
       resume_token=excluded.resume_token, indexed_at=excluded.indexed_at`,
  ).run({
    ...rec,
    // SQLite can't bind an object: store the tagged token as JSON, null when absent.
    resumeToken: rec.resumeToken ? JSON.stringify(rec.resumeToken) : null,
  });
}

export function upsertSession(db: Store, rec: SessionRecord): void {
  db.prepare(
    `INSERT INTO sessions
       (session_id, source, project, branch, first_timestamp, last_timestamp, message_count)
     VALUES
       (@sessionId, @source, @project, @branch, @firstTimestamp, @lastTimestamp, @messageCount)
     ON CONFLICT(session_id) DO UPDATE SET
       project=excluded.project, branch=excluded.branch,
       first_timestamp=excluded.first_timestamp, last_timestamp=excluded.last_timestamp,
       message_count=excluded.message_count`,
  ).run(rec);
}

export function upsertMessage(db: Store, rec: MessageRecord): void {
  db.prepare(
    `INSERT INTO messages
       (message_id, source_file_id, session_id, uuid, parent_uuid, seq, role,
        timestamp, project, branch, model, agent, skill, text, text_truncated)
     VALUES
       (@messageId, @sourceFileId, @sessionId, @uuid, @parentUuid, @seq, @role,
        @timestamp, @project, @branch, @model, @agent, @skill, @text, @textTruncated)
     ON CONFLICT(message_id) DO UPDATE SET
       source_file_id=excluded.source_file_id, session_id=excluded.session_id,
       uuid=excluded.uuid, parent_uuid=excluded.parent_uuid, seq=excluded.seq,
       role=excluded.role, timestamp=excluded.timestamp, project=excluded.project,
       branch=excluded.branch, model=excluded.model, agent=excluded.agent,
       skill=excluded.skill, text=excluded.text, text_truncated=excluded.text_truncated`,
  ).run({ ...rec, textTruncated: rec.textTruncated ? 1 : 0 });
}

/**
 * Remove every message and tool call belonging to one physical file. Used before
 * a full re-index of a rewritten/rotated file so stale rows never linger. The
 * messages delete fires the FTS delete trigger, keeping the index in sync.
 */
export function deleteFileRows(db: Store, sourceFileId: string): void {
  db.prepare("DELETE FROM tool_calls WHERE source_file_id = ?").run(sourceFileId);
  db.prepare("DELETE FROM messages WHERE source_file_id = ?").run(sourceFileId);
}

export function upsertToolCall(db: Store, rec: ToolCallRecord): void {
  db.prepare(
    `INSERT INTO tool_calls
       (tool_call_id, source_file_id, session_id, message_id, tool_use_id,
        tool_name, input, result, is_error, truncated)
     VALUES
       (@toolCallId, @sourceFileId, @sessionId, @messageId, @toolUseId,
        @toolName, @input, @result, @isError, @truncated)
     ON CONFLICT(tool_call_id) DO UPDATE SET
       source_file_id=excluded.source_file_id, session_id=excluded.session_id,
       message_id=excluded.message_id, tool_use_id=excluded.tool_use_id,
       tool_name=excluded.tool_name, input=excluded.input, result=excluded.result,
       is_error=excluded.is_error, truncated=excluded.truncated`,
  ).run({
    ...rec,
    isError: rec.isError === null ? null : rec.isError ? 1 : 0,
    truncated: rec.truncated ? 1 : 0,
  });
}
