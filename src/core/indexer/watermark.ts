import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Resume watermark logic. A source file row remembers (byteOffset, lineCount,
 * prefixSha256, mtime) from its last index. On re-index we compare that against
 * the file's current size/mtime/head-hash to decide whether to skip the file
 * entirely, append only its new tail, or re-index it from scratch.
 *
 * Append-only transcripts (the common Claude Code / Codex case) take the cheap
 * append path; an in-place rewrite or rotation is caught by the prefix hash and
 * falls back to a full re-index so the store never carries stale rows.
 */

/** Bytes of file head hashed to detect in-place rewrites without reading the whole file. */
export const PREFIX_BYTES = 4096;

export interface PriorWatermark {
  byteOffset: number;
  lineCount: number;
  prefixSha256: string | null;
  mtime: string | null;
}

export interface FileStats {
  size: number;
  mtime: string;
}

export type ReindexPlan =
  | { mode: "skip" }
  | { mode: "full" }
  | { mode: "append"; fromByte: number; fromSeq: number };

/**
 * Decide how to re-index a file given its prior watermark, current stats, and a
 * freshly computed head hash. `currentPrefixHash` may be null when the file is
 * smaller than one byte or unreadable; callers treat that as "can't verify".
 */
export function planReindex(
  prior: PriorWatermark | null,
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

  // Same size and mtime → nothing happened since last index.
  if (stats.size === prior.byteOffset && stats.mtime === prior.mtime) {
    return { mode: "skip" };
  }

  // Grew (or only mtime changed) with a matching head → append the tail.
  return { mode: "append", fromByte: prior.byteOffset, fromSeq: prior.lineCount };
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
