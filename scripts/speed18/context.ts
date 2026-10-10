/**
 * ===========================================================================
 *  ONE MEASURED REQUEST, AND WHAT IT ASKED THE DATABASE
 * ===========================================================================
 * The harness in scripts/measure-speed18.mjs runs the real route code in
 * Node. Each visit it measures runs inside `visit()`, which gives it what
 * Next gives a request: its own cookies and headers, its own React `cache()`
 * scope, and a list that every database round trip is written to (by
 * ./fake-postgrest.ts). Round trips started after the answer (stale entries
 * refreshed in the background, `after()` work) are counted apart, because a
 * visitor does not wait on them.
 */
import { AsyncLocalStorage } from "node:async_hooks"

export interface Trip {
  table: string
  method: string
  query: string
  at: number
  background: boolean
  /** Which key asked: "anon" (a stranger's), "service" (the server's own) or "user". */
  key?: string
}

export interface VisitState {
  cookies: Map<string, string>
  headers: Map<string, string>
  memo: Map<unknown, unknown>
  trips: Trip[]
  background: boolean
  after: (() => unknown)[]
  started: number
}

export const als = new AsyncLocalStorage<VisitState>()

/** Trips made outside any visit (a cache refreshed after its visit ended). */
export const orphanTrips: Trip[] = []

export function current(): VisitState | undefined {
  return als.getStore()
}

export interface VisitResult<T> {
  value: T | undefined
  error: unknown
  ms: number
  trips: Trip[]
  foreground: number
  background: number
}

/** Runs `fn` as one request. `after()` work runs once the answer is in, as Next runs it. */
export async function visit<T>(fn: () => Promise<T>, opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<VisitResult<T>> {
  const state: VisitState = {
    cookies: new Map(Object.entries(opts.cookies ?? {})),
    headers: new Map(Object.entries({ host: "storelib.com", ...(opts.headers ?? {}) })),
    memo: new Map(),
    trips: [],
    background: false,
    after: [],
    started: performance.now(),
  }
  let value: T | undefined
  let error: unknown
  const t0 = performance.now()
  await als.run(state, async () => {
    try {
      value = await fn()
    } catch (e) {
      error = e
    }
  })
  const ms = performance.now() - t0
  /* The work after the answer: counted, never timed into the answer. */
  await als.run({ ...state, background: true, memo: new Map() }, async () => {
    for (const task of state.after) {
      try {
        await task()
      } catch {
        /* after() work that fails does not fail the page */
      }
    }
  })
  const foreground = state.trips.filter((t) => !t.background).length
  return { value, error, ms, trips: state.trips, foreground, background: state.trips.length - foreground }
}
