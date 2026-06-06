import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleFormat } from "./sample-format.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "recall-sample-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sampleFormat", () => {
  it("summarizes a transcript directory's on-disk shape for an onboarding agent", async () => {
    const lines = [
      JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "summary", summary: "meta line" }),
    ];
    await writeFile(join(dir, "sess-a.jsonl"), lines.join("\n") + "\n");

    const sample = await sampleFormat(dir, { maxLines: 10 });
    expect(sample.fileCount).toBe(1);
    expect(sample.sampleFile).toContain("sess-a.jsonl");
    expect(sample.sampleLines).toHaveLength(2);
    expect(sample.lineTypes.sort()).toEqual(["summary", "user"]);
    expect(sample.topLevelKeys).toEqual(expect.arrayContaining(["type", "uuid", "message"]));
  });

  it("reports an empty directory without throwing", async () => {
    const sample = await sampleFormat(dir);
    expect(sample.fileCount).toBe(0);
    expect(sample.sampleFile).toBeNull();
    expect(sample.sampleLines).toEqual([]);
  });
});
