/**
 * WHAT A SEARCH BOX MAY ASK THE DATABASE. A member search, and the ticket
 * holder search beside it, both put the typed words into a PostgREST `or`
 * filter, so what is left of them has to be letters, digits and the few
 * marks that appear in names and email addresses: nothing PostgREST would
 * read as syntax of its own.
 *
 * Pure and browser safe, so a screen may clean the words before it asks.
 */

/** Letters, digits, spaces and the few marks in names and emails; nothing PostgREST reads as syntax. */
export function safeSearch(q: string): string {
  return q.replace(/[^\p{L}\p{N}@.\-' ]/gu, "").trim().slice(0, 60)
}

/** The most matches one search reads: more than that asks the person to type more. */
export const SEARCH_CAP = 300
