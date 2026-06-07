/**
 * The client-agnostic registration guide printed at the end of `lore setup`.
 * lore never edits another tool's config file (every client's format differs
 * and silently rewriting them is unsafe), so the running agent applies the block
 * for its own harness and tells the user the one manual step — the reload — that
 * a running session cannot do for itself.
 */
export function renderRegistrationGuide(): string {
  return [
    "Next: register the lore MCP server in YOUR client, then reload it.",
    "",
    "Claude Code:",
    "  claude mcp add lore -- lore serve",
    "",
    "Codex (~/.codex/config.toml):",
    "  [mcp_servers.lore]",
    '  command = "lore"',
    '  args = ["serve"]',
    "",
    "Cursor / Cline / other MCP clients (stdio server entry):",
    '  { "mcpServers": { "lore": { "command": "lore", "args": ["serve"] } } }',
    "",
    "Reload so the client picks up the new tools:",
    "  - Most clients only load MCP tools at session start — start a NEW session.",
    "  - Some expose a reload command (e.g. /reload-plugins) that reseeds in place.",
    "  - Tell the user which step their client needs; a running session cannot",
    "    register its own tools mid-flight.",
    "",
    "Verify: call the search_memory tool with a word you know is in a past session.",
  ].join("\n");
}
