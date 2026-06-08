import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import type {
  ByteResumeToken,
  HashResumeToken,
  ResumeToken,
  RowidResumeToken,
} from "../records.js";

/**
 * Source-agnostic resume planning. A source file row remembers a tagged
 * `ResumeToken`; on re-index we compare it against the source's current state to
 * decide whether to skip, append only the new tail, or re-index from scratch.
 *
 * Each token kind has its own pure planner. Byte sources (append-only text
 * transcripts) take the cheap append path, with a head-hash guard that catches
 * an in-place rewrite or rotation and forces a full re-index. Database sources
 * resume from a row id; whole-file sources re-read whenever a content hash
 * changes. `planReindex` dispatches to the right planner on the *current*
 * source's kind, treating a prior token of a different kind as "never seen."
 */

/** Bytes of file head hashed to detect in-place rewrites without reading the whole file. */
export const PREFIX_BYTES = 4096;

export interface FileStats {
  size: number;
  mtime: string;
}

/**
 * The resume plan. `append.from` carries the prior token so the caller knows
 * where to resume from (byte offset + line count, or row id).
 */
export type ReindexPlan =
  | { mode: "skip" }
  | { mode: "full" }
  | { mode: "append"; from: ResumeToken };

/** Current state of the source, tagged by the resume strategy it supports. */
export type CurrentSource =
  | { kind: "byte"; stats: FileStats; prefixHash: string | null }
  | { kind: "rowid"; maxRowId: number | null; fingerprint?: string | null }
  | { kind: "hash"; hash: string };

/**
 * Decide how to re-index given the prior token and the source's current state.
 * Dispatches on the current source kind; a prior token whose kind doesn't match
 * (e.g. an adapter changed strategy) is treated as no prior → full re-index.
 */
export function planReindex(prior: ResumeToken | null, current: CurrentSource): ReindexPlan {
  switch (current.kind) {
    case "byte":
      return planByteReindex(
        prior?.kind === "byte" ? prior : null,
        current.stats,
        current.prefixHash,
      );
    case "rowid":
      return planRowidReindex(
        prior?.kind === "rowid" ? prior : null,
        current.maxRowId,
        current.fingerprint,
      );
    case "hash":
      return planHashReindex(prior?.kind === "hash" ? prior : null, current.hash);
  }
}

/**
 * Byte (append-only text) planner. `currentPrefixHash` may be null when the file
 * is empty or unreadable; callers treat that as "can't verify the head."
 */
export function planByteReindex(
  prior: ByteResumeToken | null,
  stats: FileStats,
  currentPrefixHash: string | null,
): ReindexPlan {
  // Never seen this file → index the whole thing.
  if (!prior) return { mode: "full" };

  // File shrank below the last watermark → rotated/truncated, can't trust it.
  if (stats.size < prior.byteOffset) return { mode: "full" };

  // Head bytes changed → the file was rewritten in place, not appended to.
  if (prior.prefixSha256 && currentPrefixHash && prior.prefixSha256 !== currentPrefixHash) {
    return { mode: "full" };
  }

  if (stats.size === prior.byteOffset) {
    return stats.mtime === prior.mtime ? { mode: "skip" } : { mode: "full" };
  }

  // Grew with a verified matching head → append the tail.
  if (prior.prefixSha256 && currentPrefixHash && prior.prefixSha256 === currentPrefixHash) {
    return { mode: "append", from: prior };
  }
  return { mode: "full" };
}

/**
 * Row-id (database) planner. Appends rows past the last ingested id; a max row id
 * below the watermark means rows were deleted/rotated, so re-read in full. A null
 * max (couldn't read) is treated conservatively as a full re-read.
 */
export function planRowidReindex(
  prior: RowidResumeToken | null,
  maxRowId: number | null,
  currentFingerprint: string | null = null,
): ReindexPlan {
  if (!prior) return { mode: "full" };
  if (maxRowId === null) return { mode: "full" };
  if (maxRowId < prior.value) return { mode: "full" };
  if (prior.fingerprint && currentFingerprint && prior.fingerprint !== currentFingerprint) {
    return { mode: "full" };
  }
  if (maxRowId === prior.value) return { mode: "skip" };
  return { mode: "append", from: prior };
}

/**
 * Whole-file (content-hash) planner. No incremental cursor: identical hash means
 * skip, any change means a full re-index.
 */
export function planHashReindex(prior: HashResumeToken | null, currentHash: string): ReindexPlan {
  if (!prior) return { mode: "full" };
  if (prior.value === currentHash) return { mode: "skip" };
  return { mode: "full" };
}

/**
 * SHA-256 of the first `bytes` of a file. Used as a cheap fingerprint of the
 * file head so an in-place rewrite is distinguishable from an append. Returns
 * null on read error.
 */
export async function prefixHash(path: string, bytes = PREFIX_BYTES): Promise<string | null> {
  return new Promise((resolve) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path, { start: 0, end: bytes - 1 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", () => resolve(null));
  });
}
