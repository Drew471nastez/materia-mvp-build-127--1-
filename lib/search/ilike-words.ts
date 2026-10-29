/**
 * The words of a search as an ilike pattern inside PostgREST's or(): a
 * comma, a bracket or a quote there ends the condition and starts another,
 * so `x,status.neq.y` was a filter of the caller's own. Those and the
 * pattern's own wildcards are taken out; what is left is searched for as
 * typed.
 */
export function ilikeWords(query: string): string {
  return query.replace(/[,()"'\\%*_:.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
}
