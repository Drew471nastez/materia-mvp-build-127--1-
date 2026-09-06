/**
 * `await someQuery.catch(...)` DOES NOT WORK ON A SUPABASE QUERY.
 *
 * A PostgREST query builder is a THENABLE, not a Promise: it implements
 * `then()` and nothing else — no `catch`, no `finally`. So
 *
 *     await supabase.from("x").delete().eq("id", id).catch(() => {})
 *
 * does not swallow an error; it throws `TypeError: ... .catch is not a
 * function` before the query is even sent, and it throws EVERY time, not just
 * when something goes wrong. The pattern looks like defensive code and is the
 * opposite of it.
 *
 * It is easy to miss because it type-checks (the builder is assignable to
 * PromiseLike) and because the failure is silent in exactly the places people
 * write it: fire-and-forget cleanup, best-effort counters — the calls nobody
 * watches.
 *
 * This helper is what that line was trying to be. `Promise.resolve` adopts the
 * thenable into a real Promise, and the await is wrapped so a rejection
 * genuinely is ignored.
 *
 * Use it ONLY where failing really is acceptable. `null` comes back on error,
 * so a caller that needs to know can still check.
 */
export async function ignoreError<T>(query: PromiseLike<T>): Promise<T | null> {
  try {
    return await query
  } catch {
    return null
  }
}
