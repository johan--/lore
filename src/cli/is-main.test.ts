import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainModule } from "./is-main.js";

describe("isMainModule", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "recall-ismain-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is false when there is no entry path", () => {
    expect(isMainModule(pathToFileURL(join(dir, "x.js")).href, undefined)).toBe(false);
  });

  it("is true when the entry path is the module itself", async () => {
    const mod = join(dir, "real", "recall.js");
    await mkdir(join(dir, "real"), { recursive: true });
    await writeFile(mod, "");
    expect(isMainModule(pathToFileURL(mod).href, mod)).toBe(true);
  });

  it("is true when invoked through a symlink to the module (global bin install)", async () => {
    const realMod = join(dir, "dist", "recall.js");
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(realMod, "");
    const binLink = join(dir, "recall");
    await symlink(realMod, binLink);

    // import.meta.url resolves to the real file; argv[1] is the symlink.
    const importMetaUrl = pathToFileURL(await realpath(realMod)).href;
    expect(isMainModule(importMetaUrl, binLink)).toBe(true);
  });

  it("is false for an unrelated entry path", async () => {
    const mod = join(dir, "recall.js");
    await writeFile(mod, "");
    const other = join(dir, "other.js");
    await writeFile(other, "");
    expect(isMainModule(pathToFileURL(mod).href, other)).toBe(false);
  });
});
