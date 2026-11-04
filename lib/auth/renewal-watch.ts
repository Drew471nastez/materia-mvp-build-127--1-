/**
 * ===========================================================================
 *  A SESSION RENEWAL THE PROXY STARTED LEAVES WITH ITS RESPONSE
 * ===========================================================================
 * Round 50. proxy.ts reads the session with a 3s ceiling and one retry. The
 * renewal that read starts is not stopped by the ceiling: it goes on, and when
 * Supabase Auth answered it after the response had left, the refresh token had
 * been rotated and its replacement was written to a response nobody would send.
 * The browser kept the spent token. This is how the proxy knows a renewal is
 * still under way, and waits for it before the response leaves.
 *
 * Browser safe, no imports beyond the deadline helpers.
 */
import { isRefreshTokenRequest } from "@/lib/net/deadline"

/** How much longer a response waits for a session renewal that is still under way (see the read in proxy()). */
export const RENEWAL_WAIT_MS = 5_000

/**
 * A fetch that knows whether this request started a token renewal, and a wait for that renewal to end:
 * its session saved (`saved()`, called from setAll), or no renewal request open for a second (supabase-js
 * waits at most 800ms between its own tries), or `ms` gone, whichever is first.
 */
export function watchRenewals(base: typeof fetch): { fetch: typeof fetch; started: () => boolean; saved: () => void; settle: (ms: number) => Promise<void> } {
  let open = 0
  let began = false
  let done = false
  let lastEnd = 0
  return {
    fetch: (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (!isRefreshTokenRequest(url, (init?.method ?? "GET").toUpperCase())) return base(input, init)
      open++
      began = true
      const end = () => {
        open--
        lastEnd = Date.now()
      }
      const sent = base(input, init)
      void sent.then(end, end)
      return sent
    },
    started: () => began,
    saved: () => {
      done = true
    },
    settle: async (ms) => {
      const until = Date.now() + ms
      while (!done && Date.now() < until) {
        if (open === 0 && Date.now() - lastEnd >= 1_000) return
        await new Promise((r) => setTimeout(r, 50))
      }
    },
  }
}
