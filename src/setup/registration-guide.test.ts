import { describe, it, expect } from "vitest";
import { renderRegistrationGuide } from "./registration-guide.js";

describe("renderRegistrationGuide", () => {
  it("includes the per-client registration commands and a reload hint", () => {
    const guide = renderRegistrationGuide();
    expect(guide).toContain("claude mcp add lore");
    expect(guide).toContain("[mcp_servers.lore]");
    expect(guide).toContain("lore serve");
    expect(guide.toLowerCase()).toContain("reload");
  });
});
