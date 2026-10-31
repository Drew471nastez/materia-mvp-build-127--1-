/**
 * ===========================================================================
 *  WHAT A SITE SERVES WHEN THE DATABASE DOES NOT ANSWER
 * ===========================================================================
 * Production, Oct 24 to 31: "site unavailable" 716 times against "served the
 * last good copy" 199. Two reasons the copy was not there:
 *
 *   THE COPY KEPT ON THIS SERVER WAS FIRST IN, FIRST OUT. A site written
 *   early was dropped after 200 (or 500) others, however often it was being
 *   served. LastGood keeps the most recently USED instead: a site that is
 *   being visited stays.
 *
 *   THE COPY HELD FOR EVERY SERVER (Next's data cache) WAS KEYED BY THE
 *   FUNCTION'S TEXT. unstable_cache names an entry by `cb.toString()` plus
 *   its key parts, and the production build is minified, so a deploy that
 *   renamed `() => lookUpName(lower)` started every name cold: the first
 *   visitor of each site read the database in the foreground, and during
 *   slowness got "One moment". keyedAs gives the function a fixed name, so an
 *   entry outlives a deploy and is served stale (revalidated behind) when a
 *   read fails. The label carries a version: change it when what the entry
 *   holds changes shape.
 */
export class LastGood<T> {
  private readonly held = new Map<string, T>()
  constructor(private readonly max: number) {}

  /** Kept as the newest. */
  remember(key: string, value: T): void {
    this.held.delete(key)
    this.held.set(key, value)
    while (this.held.size > this.max) {
      const oldest = this.held.keys().next().value
      if (oldest === undefined) break
      this.held.delete(oldest)
    }
  }

  /** The copy, if any, marked as just used. */
  get(key: string): T | undefined {
    const value = this.held.get(key)
    if (value !== undefined) this.remember(key, value)
    return value
  }

  get size(): number {
    return this.held.size
  }
}

/** The same function, named for unstable_cache by `label` instead of by its (minified) text. */
export function keyedAs<A extends unknown[], R>(label: string, fn: (...args: A) => R): (...args: A) => R {
  const named = (...args: A) => fn(...args)
  Object.defineProperty(named, "toString", { value: () => `storelib-held:${label}` })
  return named
}
