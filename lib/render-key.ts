"use client"

/**
 * Did this payload come from the router cache, or was it rendered for me?
 *
 * The question every dynamic route rendered on the server has to be able to
 * answer, and the reason it exists is a bug that appeared twice, in the inbox
 * and then in the conversation, with the same shape both times.
 *
 * `experimental.staleTimes.dynamic` holds a rendered route in the CLIENT router
 * cache for three minutes, so tapping into a screen can serve a payload built
 * minutes ago — from before the message you are looking for was sent. Both
 * screens tried to detect that by having the server stamp `Date.now()` into a
 * prop and the client compare it against its own `Date.now()`.
 *
 * Those are two different machines. A phone whose clock is a few minutes off —
 * common, and nothing in an app controls it — gets the answer wrong, and wrong
 * in the direction that hurts: a clock running BEHIND the server makes the
 * difference negative, so a payload minutes old measures as "rendered a moment
 * ago", the client skips the refresh it was about to do, and the screen sits
 * showing what it showed last time until some later timer catches it.
 *
 * There is no clock in this. The server generates a fresh random value on every
 * render; this records the ones the tab has already mounted with. Next re-uses
 * a cached payload WITHOUT re-running the server component, so the same value
 * arriving twice can only mean the cache — and a full page load empties both
 * this set and that cache together, so the two can never disagree.
 */

const seen = new Set<string>()

/**
 * True if this render key has been mounted with before — i.e. the payload
 * carrying it was served from the router cache rather than rendered now.
 *
 * Records the key as a side effect, so it is only ever "new" once. Call it
 * exactly once per mount, during the first render.
 *
 * Bounded: a long session opening many screens would otherwise accumulate one
 * string per navigation forever. Two hundred is far past any real session, and
 * the cost of forgetting an old key is a single redundant refresh.
 */
export function wasServedFromCache(key: string | undefined): boolean {
  // No key at all means an older deployment that does not send one, or a render
  // path that could not produce one. Unable to prove freshness, assume the
  // worst and let the caller refresh: a redundant fetch is cheap, and stale
  // messages shown as current are the bug this whole file exists to prevent.
  if (!key) return true
  if (seen.has(key)) return true
  if (seen.size > 200) seen.clear()
  seen.add(key)
  return false
}
