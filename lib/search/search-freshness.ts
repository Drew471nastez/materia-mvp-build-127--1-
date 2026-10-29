/**
 * ===========================================================================
 *  THE /app SEARCH KNOWS WHEN SOMETHING WAS SAVED
 * ===========================================================================
 * Round 42, the owner: results for orders, products and the rest must show
 * a change made a moment ago, without a reload. The search keeps answers for
 * a few seconds (components/app/app-search.tsx ANSWER_KEEP_MS) and the
 * server keeps a store's orders while somebody types (lib/search/app-search
 * ORDER_INDEX_MS), so a product renamed and searched for at once could still
 * come back with its old name.
 *
 * So a change marks the search stale, wherever it was made. The browser's
 * fetch is watched once: any request that writes (anything but GET, HEAD or
 * OPTIONS) to Storelib's own API or to the database's REST API, answered
 * with a 2xx, is a change. Nothing about the request is kept or read, only
 * its method, its address's path and its status. The next search then
 * forgets the answers it kept and asks the server for fresh ones, which
 * forgets that store's kept orders too.
 *
 * Pages that save without fetch (a form post) can say so themselves with
 * markSearchStale().
 */

type Listener = () => void

let stale = false
const listeners = new Set<Listener>()

/** Something was saved: the next search reads everything again. */
export function markSearchStale(): void {
  stale = true
  for (const fn of [...listeners]) fn()
}

/** Whether something was saved since the last call, and forget it. */
export function takeSearchStale(): boolean {
  const was = stale
  stale = false
  return was
}

/** Hear every change as it happens (the open search asks again). */
export function onSearchStale(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The search's own route reads, and a read never makes anything stale. */
const OWN = /^\/api\/app\/search(?:$|[/?#])/

/**
 * Whether a request writes something a search can find: a method that writes,
 * to /api/... or a Supabase REST, storage or RPC path, other than the
 * search's own route. Pure, for the tests.
 */
export function isWrite(method: string | null | undefined, url: string, origin = "https://storelib.com"): boolean {
  const m = (method || "GET").toUpperCase()
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false
  let path: string
  try {
    path = new URL(url, origin).pathname
  } catch {
    return false
  }
  if (OWN.test(path)) return false
  return path.startsWith("/api/") || path.startsWith("/rest/v1/") || path.startsWith("/storage/v1/")
}

let watching = false

/**
 * Watch the browser's fetch for writes, once for the page's life. The
 * request and its answer pass through untouched: the same promise is
 * returned, and the status is read off it only after the caller has it.
 */
export function watchWrites(): void {
  if (watching || typeof window === "undefined" || typeof window.fetch !== "function") return
  watching = true
  const original = window.fetch
  const watched = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const answer = original.call(this ?? window, input, init)
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")
      if (isWrite(method, url, window.location.origin)) {
        answer.then(
          (res) => {
            if (res.ok) markSearchStale()
          },
          () => {},
        )
      }
    } catch {
      /* Never in the way of the request. */
    }
    return answer
  } as typeof window.fetch
  window.fetch = watched
}
