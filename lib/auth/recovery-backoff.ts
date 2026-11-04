/**
 * ===========================================================================
 *  TRY AGAIN BY ITSELF, AND NEVER HOT
 * ===========================================================================
 * "Cannot reach the server" used to appear on the first failure and stay
 * until somebody pressed Try again, though most of these are a slow minute
 * at Supabase Auth and over in seconds. Now the screen that shows it
 * (components/native-auth-gate.tsx):
 *
 *   before      tries three more times over about six seconds, with jitter,
 *               behind the loading screen, and shows nothing if one works
 *   while shown keeps asking in the background, further apart each time
 *               (2s, 4s, 8s ... capped at 30s, ten tries, about 3 minutes),
 *               and puts the page back by itself when the server can tell
 *               who this is again; the button still works at any moment
 *
 * Jitter so a thousand screens that failed in the same second do not all
 * come back in the same second. Browser safe, no imports.
 */

/** The header on a 503 that means "Supabase Auth did not answer, nothing was done" (lib/auth/route-user, lib/net/request). */
export const AUTH_UNAVAILABLE_HEADER = "X-Storelib-Auth"

/** Waits before each of the three quiet tries: about 6s in all with jitter. */
export const PRE_SCREEN_DELAYS_MS = [700, 1_700, 3_000] as const

/** Background tries while the screen is up. */
export const BACKGROUND_MAX_TRIES = 10
export const BACKGROUND_BASE_MS = 2_000
export const BACKGROUND_CAP_MS = 30_000

/** One wait, with up to a quarter of it again as jitter. */
export function jittered(ms: number, random: () => number = Math.random): number {
  return Math.round(ms + ms * 0.25 * random())
}

/** The wait before background try `attempt` (0-based). */
export function backgroundDelayMs(attempt: number, random: () => number = Math.random): number {
  return jittered(Math.min(BACKGROUND_BASE_MS * 2 ** attempt, BACKGROUND_CAP_MS), random)
}

/**
 * `attempt` after each wait in `delays` until it answers true. True when one
 * did. Stops early when `stopped()` says so (the screen went away).
 */
export async function retryQuietly(
  attempt: () => Promise<boolean>,
  {
    delays = PRE_SCREEN_DELAYS_MS,
    random = Math.random,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    stopped = () => false,
  }: { delays?: readonly number[]; random?: () => number; sleep?: (ms: number) => Promise<void>; stopped?: () => boolean } = {},
): Promise<boolean> {
  for (const d of delays) {
    await sleep(jittered(d, random))
    if (stopped()) return false
    try {
      if (await attempt()) return true
    } catch {
      /* a try that threw is a try that did not work */
    }
  }
  return false
}

/** What the server says about this person's session, or null when it did not answer (GET /api/auth/state). */
export async function askServerState(timeoutMs = 8_000): Promise<"authenticated" | "anonymous" | "indeterminate" | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch("/api/auth/state", { cache: "no-store", credentials: "same-origin", signal: ctl.signal })
    if (!res.ok) return null
    const body = (await res.json()) as { state?: unknown }
    return body.state === "authenticated" || body.state === "anonymous" || body.state === "indeterminate" ? body.state : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
