/**
 * ===========================================================================
 *  ONE LOOKUP PER HOST, HOWEVER MANY VISITORS ASK AT ONCE (round 48)
 * ===========================================================================
 * The proxy's connected domain lookup (proxy.ts resolveCustomDomain) kept
 * each host's answer for a minute, but it had no read in flight to share: a
 * cold server hit by a spike to one connected domain asked the database the
 * same three to five questions once per waiting visitor, and every minute
 * after that the first visitors past the minute each asked again, waiting
 * for it.
 *
 * Here:
 *   - a fresh answer (younger than `freshMs`) is returned as it is;
 *   - an older one, up to `staleMs`, is returned at once while one read
 *     refreshes it behind (the visitor never waits for the refresh);
 *   - with nothing usable held, every caller shares the one read in flight;
 *   - a read that failed keeps what was held (a database blink is not
 *     "not connected"), and with nothing held the caller is told `failed`.
 *
 * Pure apart from the clock, which is passed in, so the suite pins it.
 */
export interface HeldLookupOptions {
  /** How long an answer is used without asking again. */
  freshMs: number
  /** How long past that it is still served while a read refreshes it. */
  staleMs: number
  /** At most this many hosts held; past it the oldest are let go. */
  max?: number
}

export interface LookupRead<T> {
  value: T
  failed: boolean
}

export interface HeldLookup<T> {
  /** The answer for `key`: `failed` only when the read failed and nothing was held. */
  get(key: string, read: () => Promise<LookupRead<T>>, now?: number): Promise<{ value: T | null; failed: boolean }>
  /** Reads started, for the suite. */
  readonly reads: number
  forget(key?: string): void
}

export function heldLookup<T>(opts: HeldLookupOptions): HeldLookup<T> {
  const held = new Map<string, { at: number; value: T }>()
  const asking = new Map<string, Promise<{ value: T | null; failed: boolean }>>()
  const max = opts.max ?? 5000
  let reads = 0

  const start = (key: string, read: () => Promise<LookupRead<T>>, clock: () => number) => {
    const before = held.get(key)
    reads++
    const p = (async () => {
      const fresh = await read().catch(() => ({ value: null as T | null, failed: true }))
      if (fresh.failed) return before ? { value: before.value, failed: false } : { value: null, failed: true }
      if (!held.has(key) && held.size >= max) {
        /* Insertion order: the first key is the oldest written. */
        const oldest = held.keys().next().value
        if (oldest !== undefined) held.delete(oldest)
      }
      held.delete(key)
      held.set(key, { at: clock(), value: fresh.value as T })
      return { value: fresh.value as T, failed: false }
    })().finally(() => asking.delete(key))
    asking.set(key, p)
    return p
  }

  return {
    get(key, read, now) {
      const clock = () => (now === undefined ? Date.now() : now)
      const t = clock()
      const hit = held.get(key)
      const age = hit ? t - hit.at : Infinity
      if (hit && age < opts.freshMs) return Promise.resolve({ value: hit.value, failed: false })
      const inFlight = asking.get(key)
      if (hit && age < opts.freshMs + opts.staleMs) {
        if (!inFlight) void start(key, read, clock).catch(() => {})
        return Promise.resolve({ value: hit.value, failed: false })
      }
      return inFlight ?? start(key, read, clock)
    },
    get reads() {
      return reads
    },
    forget(key) {
      if (key === undefined) held.clear()
      else held.delete(key)
    },
  }
}
