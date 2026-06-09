import { basename } from "node:path";
import {
  computeMessageId,
  messageRecordSchema,
  SOURCES,
  toolCallRecordSchema,
} from "../core/records.js";
import type { MessageRecord, SourceFileRecord, ToolCallRecord } from "../core/records.js";
import { openStore } from "../core/store/open-store.js";
import { writeRecordBatch } from "../core/store/write-records.js";
import { searchMemory } from "../core/search/search-memory.js";
import type { DiscoveredFile, IngestContext, SourceAdapter } from "./contract.js";

/**
 * Fixtures a caller supplies to prove an adapter. They are adapter-specific (only
 * the adapter author knows where its transcripts live and what they say) while
 * the checks below are universal. Expressed around the streaming `ingest`
 * contract — no "representative line" — so a JSONL adapter and a database-backed
 * adapter are proven the same way: point the harness at a real sample tree and
 * name a record it must surface through search.
 */
export interface ConformanceFixtures {
  /**
   * A directory tree the adapter's `discover` finds at least one transcript in.
   * It MUST contain at least one real message record and at least one meta /
   * non-message record, so both the parse path and the skip path are exercised.
   */
  sampleRoot: string;
  /** A keyword query that MUST return a message ingested from the sample tree. */
  searchQuery: string;
  /** Substring the round-tripped message text MUST contain (proves it's the right record). */
  expectedText: string;
}

export interface ConformanceCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ConformanceReport {
  source: string;
  passed: boolean;
  checks: ConformanceCheck[];
}

/** Everything one ingest of the sample tree produced, ready for assertions. */
interface IngestedTree {
  files: DiscoveredFile[];
  sourceFiles: SourceFileRecord[];
  messages: MessageRecord[];
  toolCalls: ToolCallRecord[];
  skipped: number;
}

/**
 * Run an adapter end to end through the universal contract and return a
 * structured report. Pure of any test framework (no assertions, no process exit)
 * so it backs both a vitest test and the lore skill's self-onboarding flow
 * (skills/lore/references/setup/index.md), where a freshly written adapter must prove
 * itself before it is registered.
 *
 * The structural checks confirm the adapter's shape; the round-trip check is the
 * real trust gate — it ingests the sample tree into an in-memory store, searches
 * it, and confirms the expected record comes back with correct provenance. An
 * adapter that does not round-trip fails loudly here.
 */
export async function checkAdapterConformance(
  adapter: SourceAdapter,
  fixtures: ConformanceFixtures,
): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];
  checks.push(declaresKnownSource(adapter));

  let tree: IngestedTree;
  try {
    tree = await ingestTree(adapter, fixtures.sampleRoot);
  } catch (err) {
    checks.push({
      name: "ingests-sample-tree",
      passed: false,
      detail: `ingest threw: ${String(err)}`,
    });
    return { source: adapter.source, passed: false, checks };
  }

  checks.push(discoversSampleTree(tree));
  checks.push(parsesRepresentativeRecord(tree));
  checks.push(skipsMetaRecords(tree));
  checks.push(sourceKeyedMessageIds(tree));
  checks.push(await stableMessageIds(adapter, fixtures.sampleRoot, tree));
  checks.push(roundTrip(adapter, fixtures, tree));

  return {
    source: adapter.source,
    passed: checks.every((c) => c.passed),
    checks,
  };
}

/**
 * Discover and ingest every file under `root`, collecting the records. Mirrors
 * what the file indexer does (sessionId fallback, source-file record assembly)
 * minus persistence, so the harness exercises the same path real indexing does.
 */
async function ingestTree(adapter: SourceAdapter, root: string): Promise<IngestedTree> {
  const files = await adapter.discover(root);
  const sourceFiles: SourceFileRecord[] = [];
  const messages: MessageRecord[] = [];
  const toolCalls: ToolCallRecord[] = [];
  let skipped = 0;

  for (const file of files) {
    const sessionId = file.sessionId ?? basename(file.path).replace(/\.jsonl$/i, "");
    const ctx: IngestContext = {
      sourceFileId: file.path,
      sessionId,
      source: adapter.source,
      priorToken: null,
    };
    const result = await adapter.ingest(file, ctx);
    sourceFiles.push({
      sourceFileId: file.path,
      source: adapter.source,
      sessionId,
      kind: file.kind,
      agentFile: file.agentFile,
      path: file.path,
      byteOffset: 0,
      lineCount: 0,
      prefixSha256: null,
      mtime: null,
      resumeToken: result.resumeToken,
      indexedAt: new Date().toISOString(),
    });
    messages.push(...result.messages);
    toolCalls.push(...result.toolCalls);
    skipped += result.skipped;
  }

  return { files, sourceFiles, messages, toolCalls, skipped };
}

function declaresKnownSource(adapter: SourceAdapter): ConformanceCheck {
  const known = (SOURCES as readonly string[]).includes(adapter.source);
  return {
    name: "declares-known-source",
    passed: known,
    detail: known ? undefined : `source "${adapter.source}" is not in the SOURCES enum`,
  };
}

function discoversSampleTree(tree: IngestedTree): ConformanceCheck {
  const name = "discovers-sample-tree";
  if (tree.files.length === 0) {
    return { name, passed: false, detail: "discover found no files in the sample tree" };
  }
  const validKinds = tree.files.every((f) => f.kind === "primary" || f.kind === "subagent");
  return validKinds
    ? { name, passed: true }
    : { name, passed: false, detail: "discover returned a file with an invalid kind" };
}

function parsesRepresentativeRecord(tree: IngestedTree): ConformanceCheck {
  const name = "parses-representative-record";
  if (tree.messages.length === 0) {
    return { name, passed: false, detail: "ingesting the sample tree yielded no messages" };
  }
  for (const message of tree.messages) {
    const ok = messageRecordSchema.safeParse(message);
    if (!ok.success) {
      return { name, passed: false, detail: `message failed schema: ${ok.error.message}` };
    }
  }
  for (const call of tree.toolCalls) {
    const ok = toolCallRecordSchema.safeParse(call);
    if (!ok.success) {
      return { name, passed: false, detail: `tool call failed schema: ${ok.error.message}` };
    }
  }
  return { name, passed: true };
}

function skipsMetaRecords(tree: IngestedTree): ConformanceCheck {
  const name = "skips-meta-records";
  return tree.skipped >= 1
    ? { name, passed: true }
    : {
        name,
        passed: false,
        detail:
          "adapter skipped no records; the sample tree must include at least one meta/non-message record",
      };
}

/**
 * The message id must be minted via `computeMessageId(sourceFileId, uuid, seq)`
 * so it is namespaced by the source file — otherwise raw uuids collide across
 * files and distinct messages silently overwrite each other. Recompute every id
 * from its own fields and confirm a match, then confirm the set has no dupes.
 */
function sourceKeyedMessageIds(tree: IngestedTree): ConformanceCheck {
  const name = "source-keyed-message-id";
  for (const m of tree.messages) {
    const expected = computeMessageId(m.sourceFileId, m.uuid, m.seq);
    if (m.messageId !== expected) {
      return {
        name,
        passed: false,
        detail: "messageId is not minted via computeMessageId(sourceFileId, uuid, seq)",
      };
    }
  }
  const unique = new Set(tree.messages.map((m) => m.messageId));
  return unique.size === tree.messages.length
    ? { name, passed: true }
    : { name, passed: false, detail: "ingest produced colliding message ids" };
}

/** Re-ingesting the same tree must mint the exact same ids — the dedup property. */
async function stableMessageIds(
  adapter: SourceAdapter,
  root: string,
  first: IngestedTree,
): Promise<ConformanceCheck> {
  const name = "stable-message-id";
  try {
    const second = await ingestTree(adapter, root);
    const a = first.messages.map((m) => m.messageId).sort();
    const b = second.messages.map((m) => m.messageId).sort();
    const stable = a.length === b.length && a.every((id, i) => id === b[i]);
    return stable
      ? { name, passed: true }
      : { name, passed: false, detail: "message ids changed across an identical re-ingest" };
  } catch (err) {
    return { name, passed: false, detail: `re-ingest threw: ${String(err)}` };
  }
}

/**
 * The trust gate: persist the ingested records into a fresh in-memory store, run
 * a real search, and confirm the expected record comes back tagged with this
 * adapter's source and an ingested file's provenance. Proves the whole pipeline
 * (discover -> ingest -> store -> search) honestly, not just the parse shape.
 */
function roundTrip(
  adapter: SourceAdapter,
  fixtures: ConformanceFixtures,
  tree: IngestedTree,
): ConformanceCheck {
  const name = "round-trip-search";
  const db = openStore(":memory:");
  try {
    for (const sourceFile of tree.sourceFiles) {
      writeRecordBatch(
        db,
        {
          sourceFile,
          messages: tree.messages.filter((m) => m.sourceFileId === sourceFile.sourceFileId),
          toolCalls: tree.toolCalls.filter((c) => c.sourceFileId === sourceFile.sourceFileId),
        },
        { mode: "full" },
      );
    }

    const hits = searchMemory(db, fixtures.searchQuery, { source: adapter.source });
    const hit = hits.find((h) => h.text.includes(fixtures.expectedText));
    if (!hit) {
      return {
        name,
        passed: false,
        detail: `search "${fixtures.searchQuery}" returned no ${adapter.source} record containing "${fixtures.expectedText}"`,
      };
    }
    const knownProvenance = tree.sourceFiles.some((sf) => sf.sourceFileId === hit.sourceFileId);
    return knownProvenance
      ? { name, passed: true }
      : {
          name,
          passed: false,
          detail: "round-tripped hit has provenance not from the sample tree",
        };
  } catch (err) {
    return { name, passed: false, detail: `round-trip threw: ${String(err)}` };
  } finally {
    db.close();
  }
}
