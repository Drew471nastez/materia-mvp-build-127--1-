/**
 * ===========================================================================
 *  A RETRY IS A LOAN, AND AN OUTAGE CANNOT BORROW WITHOUT LIMIT
 * ===========================================================================
 * Round 50. A read to Supabase is asked again after a blip, and that is
 * right for a blip. It is wrong for a database that is already struggling:
 * "Timed out acquiring connection from connection pool" (production, 10-27)
 * is PostgREST with every connection busy, and every request that met it was
 * sent again, up to three times in deadlineFetch, inside up to three tries
 * of mediaFetch's whole read, inside the editor's three tries of the route.
 * One editor opening could put a few hundred requests on a pool that had no
 * room for the first fifteen, and the slowdown kept itself going.
 *
 * So retries come out of one budget per server instance (and per tab in a
 * browser): every first try pays a small deposit, every retry spends one,
 * and there is a floor that refills with time so a quiet instance can still
 * ride out a blip. In a blip there is plenty, and every read is asked again
 * as before. In an outage the budget runs dry within seconds, the first try
 * of each request still goes, and the extra load stops.
 *
 * Browser safe, no imports, nothing that can itself be down.
 */

export interface RetryBudgetOptions {
  /** Tokens the bucket holds at most, and starts with. */
  cap?: number
  /** Added for every first try: 0.2 lets retries be a fifth of traffic. */
  ratio?: number
  /** Added per second whatever the traffic, so a quiet instance can still retry a blip. */
  perSecond?: number
  now?: () => number
}

export const RETRY_BUDGET_DEFAULTS = { cap: 60, ratio: 0.2, perSecond: 5 } as const

export class RetryBudget {
  private tokens: number
  private last: number
  private readonly cap: number
  private readonly ratio: number
  private readonly perSecond: number
  private readonly now: () => number
  /** Retries refused since the last reset: for the log line and the tests. */
  refused = 0

  constructor(opts: RetryBudgetOptions = {}) {
    this.cap = opts.cap ?? RETRY_BUDGET_DEFAULTS.cap
    this.ratio = opts.ratio ?? RETRY_BUDGET_DEFAULTS.ratio
    this.perSecond = opts.perSecond ?? RETRY_BUDGET_DEFAULTS.perSecond
    this.now = opts.now ?? Date.now
    this.tokens = this.cap
    this.last = this.now()
  }

  private refill(): void {
    const t = this.now()
    const elapsed = Math.max(0, t - this.last) / 1000
    this.last = t
    this.tokens = Math.min(this.cap, this.tokens + elapsed * this.perSecond)
  }

  /** A first try went out. */
  deposit(): void {
    this.refill()
    this.tokens = Math.min(this.cap, this.tokens + this.ratio)
  }

  /** May a retry go out? Takes one token when it may. */
  spend(): boolean {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    this.refused++
    return false
  }

  get available(): number {
    this.refill()
    return this.tokens
  }

  reset(): void {
    this.tokens = this.cap
    this.last = this.now()
    this.refused = 0
  }
}

/** The one budget for reads to Supabase in this instance (lib/net/deadline.ts, lib/storage/media-url.ts). */
export const supabaseRetryBudget = new RetryBudget()
