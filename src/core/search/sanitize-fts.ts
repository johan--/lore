/**
 * Sanitize free text for safe FTS5 MATCH.
 *
 * FTS5 reserves `"` `*` `:` `(` `)` `-` `+` and others as syntax. A bareword
 * query like `trust-metadata` is parsed as `trust NOT metadata` and a column
 * filter, which throws. Daemion's sanitizer fixed the throw by replacing those
 * chars with spaces — but that ALSO splits `foo.bar.ts` into `foo bar ts`,
 * which never matches the single code-aware token `foo.bar.ts` indexed under
 * our `tokenchars '_-.'` tokenizer.
 *
 * Improvement: split on whitespace, strip embedded double-quotes from each
 * term, and wrap each surviving term in double quotes. Inside a quoted string
 * FTS5 treats `-` `.` `_` literally, so `"foo.bar.ts"` matches the whole token
 * while a plain word like `alamo` still matches normally. Terms are joined with
 * spaces (implicit AND). Returns "" when nothing searchable remains.
 */
export function sanitizeFtsQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .map((term) => term.replace(/"/g, "").trim())
    .filter((term) => term.length > 0);
  if (terms.length === 0) return "";
  return terms.map((term) => `"${term}"`).join(" ");
}
