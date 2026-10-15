/**
 * ===========================================================================
 *  A PAGE READ AHEAD STAYS READ AHEAD (round 18)
 * ===========================================================================
 * The owner: "switching between Home and Profile in the nav bar takes too
 * much ... make it fast, prefetched and kept", and of the account's pills,
 * "it takes too much to load them". The router keeps a page it read ahead for
 * staleTimes (300s, next.config.mjs). Past that, a press asks the server
 * again and waits for it: the slow switch after a few minutes on one page,
 * or after the app comes back from the background.
 *
 * keepFresh(read) runs `read` again just after the router would hold those
 * pages stale (a read ahead of a page the router still holds fresh is not
 * made at all, so any sooner would do nothing), and at once whenever the page
 * is shown again. Never while the page is hidden. The caller's `read` goes
 * through lib/nav/prefetch-policy.ts, which never reads one address twice
 * inside its own KEEP_MS and follows the device's and network's plan.
 */

/** Just past the router's staleTimes (300s), so each pass really reads. */
export const KEEP_FRESH_MS = 300_000 + 5_000

/**
 * At most this many pages kept read by a list of read aheads (the profile's
 * pills): each pass is a whole dynamic page from the server, and six of them
 * every five minutes for a profile left open was most of what it cost. The
 * first two are the likely next press; the rest are read once on idle and the
 * moment a finger lands on them, as before. Changed on purpose (the owner:
 * lower Vercel costs).
 */
export const KEEP_FRESH_MAX = 2

/** Calls `read` every KEEP_FRESH_MS while the page is shown, and when it is shown again. Returns the stop. */
export function keepFresh(read: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const again = () => {
    if (document.visibilityState !== "visible") return
    read()
  }
  const timer = window.setInterval(again, KEEP_FRESH_MS)
  document.addEventListener("visibilitychange", again)
  window.addEventListener("pageshow", again)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener("visibilitychange", again)
    window.removeEventListener("pageshow", again)
  }
}
