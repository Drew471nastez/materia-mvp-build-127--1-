/**
 * ===========================================================================
 *  ONE READ FOR EVERY PART OF A PAGE THAT ASKS THE SAME THING AT ONCE (round 54)
 * ===========================================================================
 * Storelib's product page draws its buy box twice (one for a phone, one for
 * a wide screen, one of them hidden), and each copy asked the server for the
 * same answers after load: /api/wishlist/check and /api/offers went out twice
 * per page view (scripts/check-cdn-r54.mjs, a product page in a phone
 * browser). Two requests, two function invocations, one answer.
 *
 * So a GET for JSON is shared while it is on its way and for a moment after
 * it lands: every caller with the same address in that window gets the same
 * answer. The moment is two seconds, short enough that a change the visitor
 * makes (a wishlist tap, an offer saved in the editor) is never hidden by it:
 * the components keep their own state after a tap, and a later mount asks
 * again. A failed read is null, as each caller already treated one.
 */
type Entry = { settledAt: number | null; answer: Promise<unknown> }

const reads = new Map<string, Entry>()
const KEEP = 40
export const SHARED_READ_MS = 2000

/** The JSON at `url` (null when it failed), one request for every caller within SHARED_READ_MS. */
export function sharedJson<T>(url: string, init?: RequestInit, now: () => number = Date.now): Promise<T | null> {
  const hit = reads.get(url)
  if (hit && (hit.settledAt === null || now() - hit.settledAt < SHARED_READ_MS)) return hit.answer as Promise<T | null>
  const entry: Entry = { settledAt: null, answer: Promise.resolve(null) }
  entry.answer = fetch(url, init)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((v) => {
      entry.settledAt = now()
      return v
    })
  reads.delete(url)
  reads.set(url, entry)
  while (reads.size > KEEP) {
    const oldest = reads.keys().next().value
    if (oldest === undefined) break
    reads.delete(oldest)
  }
  return entry.answer as Promise<T | null>
}

/** For the tests: forget every shared read. */
export function forgetSharedReads(): void {
  reads.clear()
}
