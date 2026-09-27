/**
 * TOKEN BUCKETS IN MEMORY, ONE A KEY.
 *
 * A bucket holds up to `capacity` tokens and refills at `perMinute` a minute.
 * A request takes one; an empty bucket answers with how many seconds until
 * the next token. In memory is enough for one scanner process: the limit is
 * there to keep one runaway caller from starving the others, not to bill.
 *
 * The map is swept of full buckets (callers that have gone quiet) and never
 * grows past `maxKeys`, so a flood of made up addresses cannot fill memory.
 */
export function createRateLimiter({ perMinute, capacity = perMinute, maxKeys = 10_000, now = () => Date.now() }) {
  const perMs = perMinute / 60_000
  const buckets = new Map()

  function refill(b, t) {
    b.tokens = Math.min(capacity, b.tokens + (t - b.at) * perMs)
    b.at = t
  }

  function take(key) {
    const t = now()
    let b = buckets.get(key)
    if (!b) {
      if (buckets.size >= maxKeys) sweep(true)
      b = { tokens: capacity, at: t }
      buckets.set(key, b)
    } else {
      refill(b, t)
    }
    if (b.tokens >= 1) {
      b.tokens -= 1
      return { ok: true, retryAfterSec: 0 }
    }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / perMs / 1000)) }
  }

  /** Drop buckets that have refilled; with `force`, also the oldest half. */
  function sweep(force = false) {
    const t = now()
    for (const [k, b] of buckets) {
      refill(b, t)
      if (b.tokens >= capacity) buckets.delete(k)
    }
    if (force && buckets.size >= maxKeys) {
      const drop = Math.ceil(buckets.size / 2)
      let i = 0
      for (const k of buckets.keys()) {
        if (i++ >= drop) break
        buckets.delete(k)
      }
    }
  }

  return { take, sweep, size: () => buckets.size }
}
