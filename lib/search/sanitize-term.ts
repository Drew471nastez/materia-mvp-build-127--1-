// Shared search-term sanitiser. Safe to import from server components, route handlers
// and client components alike - no imports, no side effects.

export const MAX_SEARCH_TERM_LENGTH = 100

/**
 * Strip characters that are grammar in a PostgREST filter (`,` `.` `(` `)` `:` `"` `*`)
 * or wildcards in a LIKE pattern (`%`, and the `\` escape). Replaced with a space rather
 * than removed so "st. john" still matches "St. John".
 *
 * `_` is deliberately kept: it is a single-character LIKE wildcard, so it can only ever
 * widen the match (usernames legitimately contain it) and carries no injection risk.
 *
 * Values are URL-encoded by supabase-js and parameterised by PostgREST, so this is not a
 * defence against SQL injection - it is a defence against a *broken filter*. An
 * unsanitised `,` in `.or("title.ilike.%a,b%,description.ilike.%a,b%")` makes PostgREST
 * fail to parse the whole expression, and a query as ordinary as "nike, size 9" then
 * returns an error instead of results.
 */
export function sanitizeSearchTerm(raw: string, maxLength: number = MAX_SEARCH_TERM_LENGTH): string {
  return raw
    .slice(0, maxLength)
    .replace(/[%\\]/g, " ")
    .replace(/[,().:"*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
