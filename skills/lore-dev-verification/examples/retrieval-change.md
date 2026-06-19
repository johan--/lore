# Example: Retrieval Change Verification

Change: add fields to a retrieval JSON envelope.

Plan:

- Run the targeted retrieval tests for the changed function.
- Run `npm run test -- src/cli/cli-mcp-parity.test.ts` if a CLI and MCP surface
  both expose the operation.
- Verify new fields are bounded and use `null` for unknown source data.
- Run `npm run check` before merge.

Privacy note: fixture records must be synthetic.
