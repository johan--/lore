import { describe, it, expect } from "vitest";
import { renderRegistrationGuide } from "./registration-guide.js";

describe("renderRegistrationGuide", () => {
  it("includes the per-client registration commands and a reload hint", () => {
    const guide = renderRegistrationGuide();
    expect(guide).toContain("claude mcp add recall");
    expect(guide).toContain("[mcp_servers.recall]");
    expect(guide).toContain("recall serve");
    expect(guide.toLowerCase()).toContain("reload");
  });
});
