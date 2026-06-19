# Example: Adapter Or Store Change Verification

Change: add an adapter field or store migration.

Plan:

- Run adapter conformance tests for the touched adapter.
- Run migration/open-store tests for schema changes.
- Verify missing fields are represented as `null`, not guessed values.
- Run `npm run check` before merge.
