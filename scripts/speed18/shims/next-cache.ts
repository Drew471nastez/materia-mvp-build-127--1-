/**
 * ===========================================================================
 *  NEXT'S DATA CACHE, AS NEXT 16 KEEPS IT, IN MEMORY
 * ===========================================================================
 * Stands in for `next/cache` in the speed harness and in
 * tests/perf-speed18.test.ts, so a measurement or a correctness check sees
 * what production sees:
 *
 *   - the key is the function's source, the key parts and the arguments,
 *     as in next/dist/server/web/spec-extension/unstable-cache.js;
 *   - a value comes back as JSON, as it does from the real cache, so a Set
 *     or a Date that would not survive the trip does not survive here;
 *   - an entry older than its `revalidate`, or carrying a tag revalidated
 *     after it was written, is served stale while it is refreshed behind
 *     the visitor (the refresh's round trips are counted as background);
 *   - a tag revalidated with `{ expire: 0 }` is a miss at once.
 *
 * The clock can be moved on (`clock.advance`) so a test can step past a TTL.
 */
import { current, als, orphanTrips } from "../context"

type Entry = { value: string; at: number; revalidate: number | false; tags: string[] }

const entries = new Map<string, Entry>()
const tagStale = new Map<string, { at: number; expireAt: number }>()
export const purgedPaths: { path: string; type?: string; at: number }[] = []
export const revalidatedTags: { tag: string; at: number }[] = []
const refreshing = new Set<string>()
export const pending: Promise<unknown>[] = []

let offset = 0
const realNow = Date.now.bind(Date)
export const clock = {
  now: () => realNow() + offset,
  advance: (ms: number) => {
    offset += ms
  },
}

export const cacheStats = { hits: 0, stale: 0, misses: 0 }
const CACHE_RTT = Number(process.env.CACHE_RTT ?? 0)

export function resetCache() {
  entries.clear()
  tagStale.clear()
  purgedPaths.length = 0
  revalidatedTags.length = 0
  refreshing.clear()
  cacheStats.hits = 0
  cacheStats.stale = 0
  cacheStats.misses = 0
}

/** Every key held right now with its tags, for a test that asks what a cache holds. */
export function cacheEntries(): { key: string; tags: string[]; value: unknown }[] {
  return [...entries.entries()].map(([key, e]) => ({ key, tags: e.tags, value: JSON.parse(e.value) }))
}

function freshness(e: Entry): "fresh" | "stale" | "expired" {
  const now = clock.now()
  for (const tag of e.tags) {
    const t = tagStale.get(tag)
    if (t && t.at >= e.at) {
      if (now >= t.expireAt) return "expired"
      return "stale"
    }
  }
  if (e.revalidate !== false && now - e.at >= e.revalidate * 1000) return "stale"
  return "fresh"
}

const encode = (v: unknown) => (v === undefined ? "__undefined__" : JSON.stringify(v))
const decode = (s: string) => (s === "__undefined__" ? undefined : JSON.parse(s))

export function unstable_cache<A extends unknown[], R>(
  cb: (...args: A) => Promise<R>,
  keyParts?: string[],
  options: { revalidate?: number | false; tags?: string[] } = {},
): (...args: A) => Promise<R> {
  if (options.revalidate === 0) throw new Error("Invariant revalidate: 0 can not be passed to unstable_cache()")
  const fixedKey = `${cb.toString()}-${Array.isArray(keyParts) && keyParts.join(",")}`
  const tags = options.tags ?? []
  const revalidate = typeof options.revalidate === "number" ? options.revalidate : false
  return async (...args: A) => {
    /* What one answer from the shared data cache costs (CACHE_RTT, ms): on Vercel each is a request to it. Nothing unless asked for. */
    if (CACHE_RTT > 0) await new Promise((r) => setTimeout(r, CACHE_RTT))
    const key = `${fixedKey}-${JSON.stringify(args)}`
    const held = entries.get(key)
    const write = (value: R) => {
      entries.set(key, { value: encode(value), at: clock.now(), revalidate, tags })
    }
    if (held) {
      const state = freshness(held)
      if (state === "fresh") {
        cacheStats.hits++
        return decode(held.value) as R
      }
      if (state === "stale") {
        cacheStats.stale++
        if (!refreshing.has(key)) {
          refreshing.add(key)
          const visitState = current()
          const run = async () => {
            try {
              write(await cb(...args))
            } catch {
              /* the stale value stays */
            } finally {
              refreshing.delete(key)
            }
          }
          /* Behind the visitor: its round trips are background ones. */
          const p = visitState ? als.run({ ...visitState, background: true }, run) : run()
          pending.push(p)
        }
        return decode(held.value) as R
      }
    }
    cacheStats.misses++
    const value = await cb(...args)
    write(value)
    return decode(encode(value)) as R
  }
}

export function revalidateTag(tag: string, profile?: string | { expire?: number }) {
  const now = clock.now()
  const expire = typeof profile === "object" && profile && typeof profile.expire === "number" ? profile.expire : Number.POSITIVE_INFINITY
  tagStale.set(tag, { at: now, expireAt: now + expire * 1000 })
  revalidatedTags.push({ tag, at: now })
}

export function updateTag(tag: string) {
  revalidateTag(tag, { expire: 0 })
}

export function revalidatePath(path: string, type?: string) {
  purgedPaths.push({ path, type, at: clock.now() })
}

export function unstable_noStore() {}
export function noStore() {}
export const unstable_cacheLife = () => {}
export const unstable_cacheTag = () => {}
export const cacheLife = () => {}
export const cacheTag = () => {}

export { orphanTrips }
