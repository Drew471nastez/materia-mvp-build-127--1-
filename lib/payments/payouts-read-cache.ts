/**
 * ===========================================================================
 *  THE PAYOUTS PAGE'S STRIPE READ, KEPT HALF A MINUTE PER PERSON
 * ===========================================================================
 * /api/stripe/payouts costs four Stripe reads on the connected account, and
 * the page asks on open, every two minutes, on focus and on coming back
 * (MEDIUM-4). An answer is kept for PAYOUTS_CACHE_MS per server instance,
 * keyed by the person asking AND the store AND its Stripe account, so it is
 * never handed to anybody else, and two requests at once share one read. An
 * answer with a part Stripe did not give (`unavailable`) is never kept.
 */
export const PAYOUTS_CACHE_MS = 30_000
const MAX_KEPT = 500

type Body = Record<string, unknown>
const g = globalThis as unknown as { __storelibPayoutsReads?: Map<string, { at: number; body: Body }>; __storelibPayoutsFlights?: Map<string, Promise<Body>> }
const kept = (g.__storelibPayoutsReads ??= new Map())
const flights = (g.__storelibPayoutsFlights ??= new Map())

export function payoutsReadKey(userId: string, creatorId: string, accountId: string): string {
  return `${userId}|${creatorId}|${accountId}`
}

/**
 * The kept answer for this key when it is younger than PAYOUTS_CACHE_MS
 * (unless `fresh`), else the read already in flight for it, else `read()`.
 * `cached` says which.
 */
export async function readPayoutsKept(key: string, read: () => Promise<Body>, opts: { fresh?: boolean; now?: () => number } = {}): Promise<{ body: Body; cached: boolean }> {
  const now = opts.now ?? Date.now
  const hit = kept.get(key)
  if (!opts.fresh && hit && now() - hit.at < PAYOUTS_CACHE_MS) return { body: hit.body, cached: true }
  const flying = flights.get(key)
  if (flying) return { body: await flying, cached: false }
  const p = read().finally(() => flights.delete(key))
  flights.set(key, p)
  const body = await p
  if (!body.unavailable && !body.error) {
    if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value as string)
    kept.set(key, { at: now(), body })
  }
  return { body, cached: false }
}

/** Forget what was kept for a store (a cash out, a payout event on this instance), for every person who reads it. */
export function forgetPayoutsRead(creatorId: string): void {
  for (const key of [...kept.keys()]) if (key.split("|")[1] === creatorId) kept.delete(key)
}
