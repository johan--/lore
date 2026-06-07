import type { ParsedLine, Source, SourceFileKind } from "../core/records.js";

export interface FileMetadata {
  project?: string | null;
  branch?: string | null;
  model?: string | null;
  agent?: string | null;
}

/**
 * The contract every source adapter implements. An adapter is the only
 * source-specific code in recall: it knows how to find a harness's transcript
 * files on disk (`discover`) and how to turn one raw line into normalized
 * records (`parseLine`). Everything downstream — store, search, MCP — operates
 * on the normalized records and never sees a harness quirk.
 *
 * Adapters are proven against this contract by the conformance harness, so a new
 * harness can be onboarded by writing an adapter and watching it pass, rather
 * than by reading the core.
 */
export interface SourceAdapter {
  /** The harness namespace this adapter ingests into (e.g. "claude-code"). */
  readonly source: Source;
  /** Walk a root directory and return the transcript files to ingest. */
  discover(root: string): Promise<DiscoveredFile[]>;
  /** Optional file-level metadata pass for sources that put cwd/model in meta lines. */
  getFileMetadata?(rawLines: string[], sourceFileId: string): FileMetadata;
  /** Parse one raw transcript line into normalized records, or skip it. */
  parseLine(rawLine: string, ctx: ParseContext): ParseOutcome;
}

/** A transcript file located by an adapter's `discover`. */
export interface DiscoveredFile {
  path: string;
  kind: SourceFileKind;
  /** For subagent files, the agent file name (basename without extension). */
  agentFile: string | null;
  /**
   * Authoritative session id when the adapter can derive it structurally (e.g.
   * Claude Code subagent files name their parent session in the path). Null when
   * the indexer should infer it from the payload/filename.
   */
  sessionId: string | null;
}

/** Per-line context the indexer threads into `parseLine`. */
export interface ParseContext {
  sourceFileId: string;
  sessionId: string;
  seq: number;
  source: Source;
  fileMetadata?: FileMetadata;
  /** Cap on stored text/tool payload chars. Adapters default this if unset. */
  maxTextChars?: number;
}

/** Result of parsing one line: either normalized records or a counted skip. */
export type ParseOutcome =
  | { kind: "parsed"; parsed: ParsedLine }
  | { kind: "skipped"; reason: string };
