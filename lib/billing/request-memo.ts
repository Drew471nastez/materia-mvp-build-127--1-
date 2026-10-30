/**
 * Per request sharing for server reads, with no server imports so the suite
 * can drive it (tests/billing-resilience.test.ts). lib/billing/request-reads
 * builds the billing reads on it.
 *
 *   - In a server component render, React's `cache`: one answer per request,
 *     nothing kept between requests or people.
 *   - In a route handler React has no request scope (its `cache` calls
 *     straight through), so the route runs inside withRequestMemo, which
 *     gives that one request its own map, dropped when it ends.
 *   - Outside both, every call reads afresh.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { cache } from "react"

const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

/** Run one request's work with its own memo. */
export function withRequestMemo<T>(work: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), work)
}

/** `load`, shared within one request by its key, never across requests. A failed read is not kept. */
export function perRequest<T>(name: string, load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const inRender = cache(load)
  return (key: string) => {
    const map = scope.getStore()
    if (!map) return inRender(key)
    const k = `${name}:${key}`
    let found = map.get(k) as Promise<T> | undefined
    if (!found) {
      found = load(key)
      found.catch(() => {
        if (map.get(k) === found) map.delete(k)
      })
      map.set(k, found)
    }
    return found
  }
}
