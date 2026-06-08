/**
 * Database-backed sources (Cursor, Hermes) store many logical sessions inside one
 * SQLite file. The shared writer recomputes a single session per batch, so each
 * session must be its own `DiscoveredFile` with a distinct `sourceFileId`. We
 * encode that as `<dbPath>#<sessionId>`: discovery mints one ref per session, and
 * `ingest` splits it back into the real file to open plus the session to filter.
 *
 * Session ids for these sources are `#`-free (Cursor uses composer UUIDs, Hermes
 * uses `<date>_<n>` ids), and we split on the LAST `#` so a `#` in the db path
 * can't corrupt the session id.
 */
export function makeDbRef(dbPath: string, sessionId: string): string {
  return `${dbPath}#${sessionId}`;
}

export interface DbRef {
  dbPath: string;
  sessionId: string;
}

export function splitDbRef(ref: string): DbRef {
  const hash = ref.lastIndexOf("#");
  if (hash === -1) return { dbPath: ref, sessionId: "" };
  return { dbPath: ref.slice(0, hash), sessionId: ref.slice(hash + 1) };
}
