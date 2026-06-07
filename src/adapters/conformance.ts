import { messageRecordSchema, SOURCES, toolCallRecordSchema } from "../core/records.js";
import type { SourceAdapter, ParseContext } from "./contract.js";

/**
 * Fixtures a caller supplies to prove an adapter. They are adapter-specific (only
 * the adapter author knows what a representative line looks like) while the
 * checks below are universal.
 */
export interface ConformanceFixtures {
  /** A representative transcript line that MUST parse into a message. */
  representativeLine: string;
  /** A meta/non-message line that MUST be skipped, never parsed. */
  metaLine: string;
  /** Optional directory tree the adapter should discover at least one file in. */
  sampleRoot?: string;
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

const CTX: ParseContext = {
  sourceFileId: "conformance",
  sessionId: "conformance",
  seq: 0,
  source: "claude-code",
};

/**
 * Run an adapter through the universal contract checks and return a structured
 * report. Pure (no test framework, no process exit) so it can back both a vitest
 * assertion and the `/lore-setup` self-onboarding flow, where a freshly written
 * adapter must prove itself before it is registered.
 */
export async function checkAdapterConformance(
  adapter: SourceAdapter,
  fixtures: ConformanceFixtures,
): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];

  checks.push(declaresKnownSource(adapter));
  checks.push(parsesRepresentativeLine(adapter, fixtures.representativeLine));
  checks.push(skipsMetaLine(adapter, fixtures.metaLine));
  checks.push(stableMessageId(adapter, fixtures.representativeLine));
  if (fixtures.sampleRoot !== undefined) {
    checks.push(await discoversSampleTree(adapter, fixtures.sampleRoot));
  }

  return {
    source: adapter.source,
    passed: checks.every((c) => c.passed),
    checks,
  };
}

function declaresKnownSource(adapter: SourceAdapter): ConformanceCheck {
  const known = (SOURCES as readonly string[]).includes(adapter.source);
  return {
    name: "declares-known-source",
    passed: known,
    detail: known ? undefined : `source "${adapter.source}" is not in the SOURCES enum`,
  };
}

function ctxFor(adapter: SourceAdapter, seq = 0): ParseContext {
  return { ...CTX, source: adapter.source, seq };
}

function parsesRepresentativeLine(adapter: SourceAdapter, line: string): ConformanceCheck {
  const name = "parses-representative-line";
  let outcome;
  try {
    outcome = adapter.parseLine(line, ctxFor(adapter));
  } catch (err) {
    return { name, passed: false, detail: `parseLine threw: ${String(err)}` };
  }
  if (outcome.kind !== "parsed") {
    return { name, passed: false, detail: `expected a parsed message, got skipped` };
  }
  const message = messageRecordSchema.safeParse(outcome.parsed.message);
  if (!message.success) {
    return { name, passed: false, detail: `message failed schema: ${message.error.message}` };
  }
  for (const call of outcome.parsed.toolCalls) {
    const ok = toolCallRecordSchema.safeParse(call);
    if (!ok.success) {
      return { name, passed: false, detail: `tool call failed schema: ${ok.error.message}` };
    }
  }
  return { name, passed: true };
}

function skipsMetaLine(adapter: SourceAdapter, line: string): ConformanceCheck {
  const name = "skips-meta-line";
  try {
    const outcome = adapter.parseLine(line, ctxFor(adapter));
    return outcome.kind === "skipped"
      ? { name, passed: true }
      : { name, passed: false, detail: "meta line was parsed instead of skipped" };
  } catch (err) {
    return { name, passed: false, detail: `parseLine threw on a meta line: ${String(err)}` };
  }
}

function stableMessageId(adapter: SourceAdapter, line: string): ConformanceCheck {
  const name = "stable-message-id";
  try {
    const a = adapter.parseLine(line, ctxFor(adapter, 0));
    const b = adapter.parseLine(line, ctxFor(adapter, 0));
    const c = adapter.parseLine(line, ctxFor(adapter, 1));
    if (a.kind !== "parsed" || b.kind !== "parsed" || c.kind !== "parsed") {
      return { name, passed: false, detail: "representative line did not parse" };
    }
    const stable = a.parsed.message.messageId === b.parsed.message.messageId;
    const seqVaries = a.parsed.message.messageId !== c.parsed.message.messageId;
    return stable && seqVaries
      ? { name, passed: true }
      : {
          name,
          passed: false,
          detail: stable
            ? "messageId did not change when seq changed"
            : "messageId was not stable across identical inputs",
        };
  } catch (err) {
    return { name, passed: false, detail: `parseLine threw: ${String(err)}` };
  }
}

async function discoversSampleTree(
  adapter: SourceAdapter,
  root: string,
): Promise<ConformanceCheck> {
  const name = "discovers-sample-tree";
  try {
    const files = await adapter.discover(root);
    if (files.length === 0) {
      return { name, passed: false, detail: "discover found no files in the sample tree" };
    }
    const validKinds = files.every((f) => f.kind === "primary" || f.kind === "subagent");
    return validKinds
      ? { name, passed: true }
      : { name, passed: false, detail: "discover returned a file with an invalid kind" };
  } catch (err) {
    return { name, passed: false, detail: `discover threw: ${String(err)}` };
  }
}
