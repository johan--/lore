---
name: lore-dev-verification
description: Verifies changes to the Lore repo and Lore workflow skills. Use when working on Lore PRs, issue slices, recall/brief/handoff skills, CLI/MCP retrieval, store migrations, adapters, privacy/destructive-memory behavior, packaging, or any change that needs proof before it is called done.
---

# Lore Dev Verification

Use this before calling Lore work complete. Lore is memory infrastructure, so
verification must prove behavior without leaking private transcripts.

## Quick Start

1. Classify the change with `references/verification-matrix.md`.
2. Run the targeted checks for that row.
3. For skill changes, run the bundle and test-report validators:
   ```bash
   node skills/lore-dev-verification/scripts/validate-workflow-skill.mjs skills/<skill-name>
   ```
4. Run `npm run check` before merge unless the issue explicitly narrows the gate.
5. Record what ran in the issue or skill `evals/test-report.md`.

## Rules

- Current files, tests, and runtime artifacts beat old transcript memory.
- CLI and MCP surfaces must preserve JSON-envelope parity when they expose the
  same operation.
- Fixtures must be synthetic or scrubbed. Never commit real transcript excerpts,
  credentials, private project text, or personal memory.
- Real-store smoke checks are local proof only. Summarize counts/outcomes, not
  private message contents.
- A workflow skill is not done until `evals/test-report.md` contains concrete
  eval evidence, validator output, trigger checks when relevant, privacy notes,
  and remaining risks.

## References

- `references/verification-matrix.md` maps change type to required checks.
- `references/skill-review.md` explains workflow-skill review and report gates.
- `examples/` contains example verification plans for common Lore changes.
