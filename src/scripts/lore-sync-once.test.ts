import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const script = join(process.cwd(), "scripts", "lore-sync-once.sh");

describe("lore-sync-once.sh", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lore-sync-script-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function fakeCli(): Promise<string> {
    const path = join(dir, "fake-lore.js");
    await writeFile(path, "# fake cli\n");
    await chmod(path, 0o755);
    return path;
  }

  function run(args: string[], env: NodeJS.ProcessEnv = {}) {
    return spawnSync(script, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        LORE_SYNC_STATE_DIR: join(dir, "state"),
        LORE_SYNC_LOCK_DIR: join(dir, "lock"),
        ...env,
      },
    });
  }

  it("requires a source argument or environment fallback", () => {
    const result = run([], { LORE_SYNC_SOURCE: "" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("source required");
  });

  it("uses the positional source before LORE_SYNC_SOURCE", async () => {
    const cli = await fakeCli();

    const result = run(["codex"], {
      LORE_SYNC_SOURCE: "hermes",
      LORE_NODE_BIN: "/bin/echo",
      LORE_CLI_JS: cli,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${cli} sync codex`);
  });

  it("reports a missing built CLI as a non-zero setup failure", () => {
    const result = run(["codex"], {
      LORE_NODE_BIN: "/bin/echo",
      LORE_CLI_JS: join(dir, "missing.js"),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lore CLI not found");
  });

  it("handles missing HOME without an unbound-variable shell error", () => {
    const result = spawnSync(script, ["codex"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: "/usr/bin:/bin",
        LORE_SYNC_STATE_DIR: join(dir, "state"),
        LORE_SYNC_LOCK_DIR: join(dir, "lock"),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("node not found");
    expect(result.stderr).not.toContain("unbound variable");
  });

  it("respects explicit Node and CLI paths even when PATH is sparse", async () => {
    const cli = await fakeCli();
    const result = spawnSync(script, ["codex"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: "/no-such-dir",
        LORE_NODE_BIN: "/bin/echo",
        LORE_CLI_JS: cli,
        LORE_SYNC_STATE_DIR: join(dir, "state"),
        LORE_SYNC_LOCK_DIR: join(dir, "lock"),
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${cli} sync codex`);
  });

  it("recovers a stale lock before running sync", async () => {
    const cli = await fakeCli();
    const lockDir = join(dir, "lock", "lock");
    execFileSync("mkdir", ["-p", lockDir]);
    await writeFile(join(lockDir, "pid"), "999999\n");

    const result = run(["codex"], {
      LORE_NODE_BIN: "/bin/echo",
      LORE_CLI_JS: cli,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${cli} sync codex`);
    expect(existsSync(lockDir)).toBe(false);
  });

  it("exits quietly when another live sync owns the lock", async () => {
    const cli = await fakeCli();
    const lockDir = join(dir, "lock", "lock");
    execFileSync("mkdir", ["-p", lockDir]);
    await writeFile(join(lockDir, "pid"), `${process.pid}\n`);

    const result = run(["codex"], {
      LORE_NODE_BIN: "/bin/echo",
      LORE_CLI_JS: cli,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
