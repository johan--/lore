import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "./open-store.js";
import { addTombstone, removeTombstone, listTombstones, loadTombstoneSets } from "./tombstones.js";

let db: Store;

beforeEach(() => {
  db = openStore(":memory:");
});

describe("addTombstone / listTombstones", () => {
  it("adds a session tombstone and returns it in list", () => {
    addTombstone(db, { kind: "session", value: "sess-abc", reason: "forget" });
    const rows = listTombstones(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "session", value: "sess-abc", reason: "forget" });
    expect(rows[0]?.created_at).toBeTruthy();
  });

  it("adds a project tombstone and returns it in list", () => {
    addTombstone(db, { kind: "project", value: "/my/repo", reason: "exclude" });
    const rows = listTombstones(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "project", value: "/my/repo", reason: "exclude" });
  });

  it("is idempotent: re-adding the same (kind, value) does not throw or duplicate", () => {
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    expect(listTombstones(db)).toHaveLength(1);
  });

  it("upserts: re-adding with a different reason updates the row, no duplicate", () => {
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    addTombstone(db, { kind: "session", value: "sess-1", reason: "user note" });
    const rows = listTombstones(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("user note");
  });

  it("stores multiple distinct tombstones independently", () => {
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    addTombstone(db, { kind: "session", value: "sess-2", reason: "forget" });
    addTombstone(db, { kind: "project", value: "/repo-a", reason: "exclude" });
    expect(listTombstones(db)).toHaveLength(3);
  });
});

describe("listTombstones(kind?)", () => {
  beforeEach(() => {
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    addTombstone(db, { kind: "session", value: "sess-2", reason: "forget" });
    addTombstone(db, { kind: "project", value: "/repo-a", reason: "exclude" });
  });

  it("returns all tombstones when kind is omitted", () => {
    expect(listTombstones(db)).toHaveLength(3);
  });

  it("filters to session tombstones only", () => {
    const rows = listTombstones(db, "session");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "session")).toBe(true);
  });

  it("filters to project tombstones only", () => {
    const rows = listTombstones(db, "project");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("project");
  });
});

describe("removeTombstone", () => {
  it("removes a tombstone so it no longer appears in list", () => {
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    removeTombstone(db, "session", "sess-1");
    expect(listTombstones(db)).toHaveLength(0);
  });

  it("does not throw when removing a tombstone that does not exist", () => {
    expect(() => removeTombstone(db, "project", "/no/such/path")).not.toThrow();
  });

  it("removes only the targeted (kind, value) pair, leaves others intact", () => {
    addTombstone(db, { kind: "session", value: "sess-1", reason: "forget" });
    addTombstone(db, { kind: "session", value: "sess-2", reason: "forget" });
    removeTombstone(db, "session", "sess-1");
    const rows = listTombstones(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("sess-2");
  });
});

describe("loadTombstoneSets", () => {
  it("returns empty sets when no tombstones exist", () => {
    const { sessions, projects } = loadTombstoneSets(db);
    expect(sessions.size).toBe(0);
    expect(projects.size).toBe(0);
  });

  it("populates sessions set from session tombstones", () => {
    addTombstone(db, { kind: "session", value: "sess-a", reason: "forget" });
    addTombstone(db, { kind: "session", value: "sess-b", reason: "forget" });
    const { sessions, projects } = loadTombstoneSets(db);
    expect(sessions.has("sess-a")).toBe(true);
    expect(sessions.has("sess-b")).toBe(true);
    expect(projects.size).toBe(0);
  });

  it("populates projects set from project tombstones", () => {
    addTombstone(db, { kind: "project", value: "/nda-client", reason: "exclude" });
    const { sessions, projects } = loadTombstoneSets(db);
    expect(projects.has("/nda-client")).toBe(true);
    expect(sessions.size).toBe(0);
  });

  it("populates both sets independently", () => {
    addTombstone(db, { kind: "session", value: "sess-x", reason: "forget" });
    addTombstone(db, { kind: "project", value: "/private-repo", reason: "exclude" });
    const { sessions, projects } = loadTombstoneSets(db);
    expect(sessions.has("sess-x")).toBe(true);
    expect(projects.has("/private-repo")).toBe(true);
  });

  it("removed tombstone is absent from sets", () => {
    addTombstone(db, { kind: "session", value: "sess-gone", reason: "forget" });
    removeTombstone(db, "session", "sess-gone");
    const { sessions } = loadTombstoneSets(db);
    expect(sessions.has("sess-gone")).toBe(false);
  });
});
