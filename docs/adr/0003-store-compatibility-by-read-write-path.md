# Store compatibility is split by read and write path

Lore treats read compatibility and write compatibility differently. Read-only retrieval may query a store produced by a newer Lore build when the required memory surfaces are present, because search should not be blocked by unrelated newer schema additions. Write paths must not assume compatibility with a newer store: setup, sync, index, push, migration, and deletion commands must either explicitly understand the newer shape they are mutating or refuse before changing it. This prevents an older CLI from silently corrupting or staling newer derived data while still letting agents recover memories from a compatible store.

When a write path refuses a newer store, the user-facing instruction should be short: update Lore before running the write command.

MCP tools follow the same split. Retrieval tools open the store through the read-compatible path; `push` opens through the write-compatible path and refuses newer stores.
