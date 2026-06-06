/**
 * Response-size budgeting. Every MCP response must respect a char budget so a
 * single oversized message can't blow the caller's context. Oversized content
 * is elided with a marker telling the agent how to fetch the full text.
 */

export const DEFAULT_SNIPPET_CHARS = 2000;

export function elisionMarker(elidedChars: number, messageId: string): string {
  return `…[${elidedChars} chars elided — fetch full via get_message(message_id="${messageId}", full=true)]`;
}

/**
 * Elide `text` to at most `maxChars`, appending the marker when truncated.
 * Returns the original text unchanged when it fits.
 */
export function elide(text: string, messageId: string, maxChars = DEFAULT_SNIPPET_CHARS): string {
  if (text.length <= maxChars) return text;
  const kept = text.slice(0, maxChars);
  return kept + elisionMarker(text.length - maxChars, messageId);
}
