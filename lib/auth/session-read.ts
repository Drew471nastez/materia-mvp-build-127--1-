"use client"

import type { SupabaseClient, Session } from "@supabase/supabase-js"
import { parseCookieHeader, storedSessionKey } from "@/lib/supabase/session-jar"

/**
 * ===========================================================================
 *  A TIMEOUT IS NOT A SIGNED-OUT
 * ===========================================================================
 * This file exists because the app kept making the same mistake in four
 * different places, and that mistake is the "randomly it just logs me out for
 * no reason" report.
 *
 * The pattern was always the same. Some screen needs to know whether you are
 * signed in, so it calls `supabase.auth.getSession()`. That call can be slow or
 * can hang outright — it reads Capacitor Preferences, and when the access token
 * has expired it goes to the network to refresh. So each screen wrapped it in a
 * safety timeout, which is correct. And then every one of those timeouts did
 * this:
 *
 *     setTimeout(() => router.replace("/login"), 10_000)
 *
 * That is not a safety net. That is a signed-in person being thrown out of the
 * app because a promise was slow. Their session is still sitting in Preferences,
 * completely valid — nothing logged them out, the app simply gave up asking and
 * assumed the worst. It matches the report exactly, including the part that
 * makes no sense otherwise: "it doesn't really log me out, I click Conectează
 * and it takes forever" — of course it does, /login then has to resolve the
 * same slow read that just failed.
 *
 * lib/auth/current-user.ts already draws this distinction on the SERVER, and is
 * explicit about it: "anonymous" and "indeterminate" both mean no id to work
 * with, but callers that sign people out must not conflate them. The client had
 * no equivalent. This is it.
 *
 * ---------------------------------------------------------------------------
 * The two things a caller gets
 * ---------------------------------------------------------------------------
 *  readSessionBounded  — never hangs, and says WHY it has no session
 *  hasStoredSessionToken — synchronous, durable evidence, no network
 *
 * The second is the tiebreaker. A stored `sb-<ref>-auth-token` is proof a
 * session was established on this device and not signed out of — it survives
 * restarts, it needs no network, and it cannot hang. So "the read timed out but
 * the token is right there" has an obvious correct answer, and it is not
 * /login.
 */

/** The key supabase-js stores the session under. Derived, never hardcoded; lib/supabase/session-jar.ts. */
export { storedSessionKey }

/**
 * Is there a session stored on this device?
 *
 * Synchronous, no network, cannot hang or throw — which is the whole point,
 * because it is used precisely when the async read has already failed to
 * answer.
 *
 * localStorage rather than Capacitor Preferences even on native: the storage
 * adapter in lib/supabase/client.ts mirrors every write to localStorage FIRST,
 * synchronously, for exactly this kind of read. app/native-start/page.tsx has
 * relied on that since long before this file existed.
 *
 * A large session is split into `<key>.0`, `<key>.1`, … so the chunked form
 * counts too. Missing that is a signed-in user with a big session being told
 * they are signed out — the bug this file is about, reintroduced by a detail.
 *
 * This is EVIDENCE, never authorisation. It says a session exists, not that it
 * is valid, and nothing is unlocked by it: it only ever decides whether to keep
 * showing the app or to bounce somebody to /login. Every actual permission is
 * still enforced by Postgres row-level security against a real JWT.
 */
export function hasStoredSessionToken(): boolean {
  const key = storedSessionKey()
  if (!key || typeof window === "undefined") return false
  try {
    if (localStorage.getItem(key)) return true
    if (localStorage.getItem(`${key}.0`)) return true
  } catch {
    /* Storage disabled or private mode: the cookie below may still say so. */
  }
  /**
   * THE WEB KEEPS ITS SESSION IN A COOKIE, NOT IN localStorage. This used to
   * look in localStorage only, which the browser client never writes, so on
   * the web it always answered "no session" and every caller that asked it
   * as a tiebreaker (the gate's ten second timeout among them) sent a signed
   * in person to /login. The cookie is readable here by design.
   */
  try {
    const jar = parseCookieHeader(document.cookie)
    /* The `__Host-` name first (lib/supabase/host-session.ts, round AX), the old one while a browser still has it. */
    return Boolean(jar.get(`__Host-${key}`) || jar.get(`__Host-${key}.0`) || jar.get(key) || jar.get(`${key}.0`))
  } catch {
    // No cookie jar either: no evidence either way. `false` is right, this
    // function answers "do we have proof", and we do not.
    return false
  }
}

export interface BoundedSession {
  session: Session | null
  /**
   * True when the read did not finish in time. The session may well exist.
   *
   * A caller that treats this as "signed out" has reintroduced the bug at the
   * top of this file. Pair it with hasStoredSessionToken().
   */
  timedOut: boolean
  /** True when getSession() rejected. Also not a signed-out. */
  failed: boolean
}

/**
 * getSession(), with a ceiling.
 *
 * The underlying promise is NOT cancellable — supabase-js gives us no way to
 * abort a refresh in flight, and if it is stuck behind a lock it may never
 * settle at all. So this does not try to cancel it; it stops WAITING on it.
 * The call is left to finish or not, harmlessly, and its result reaches the app
 * through onAuthStateChange like any other refresh would.
 *
 * That distinction is what makes this a real guarantee rather than a hope: no
 * UI in this app awaits an unbounded auth promise, whatever supabase-js, the
 * network, or a suspended web view happens to be doing.
 */
export async function readSessionBounded(
  supabase: SupabaseClient,
  ms = 4_000,
): Promise<BoundedSession> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<BoundedSession>((resolve) => {
    timer = setTimeout(() => resolve({ session: null, timedOut: true, failed: false }), ms)
  })

  const read = supabase.auth
    .getSession()
    .then(({ data }): BoundedSession => ({
      session: data.session ?? null,
      timedOut: false,
      failed: false,
    }))
    .catch((): BoundedSession => ({ session: null, timedOut: false, failed: true }))

  try {
    return await Promise.race([read, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * "Should this screen behave as though somebody is signed in?"
 *
 * The single question every caller in this codebase actually has, answered
 * once so nobody has to remember the rule again:
 *
 *   read succeeded, session present   → yes
 *   read succeeded, no session        → no        ← the ONLY no
 *   read timed out or failed          → yes, if a token is stored on the device
 *
 * The last line is the fix. It is deliberately optimistic, and the asymmetry is
 * intentional: wrongly keeping somebody in the app costs them one failed
 * request that redirects properly; wrongly throwing them out costs them their
 * session and their trust in the app.
 */
export function treatAsSignedIn(r: BoundedSession): boolean {
  if (!r.timedOut && !r.failed) return !!r.session
  return hasStoredSessionToken()
}

/**
 * ===========================================================================
 *  A FAILED READ OF THE USER IS NOT A SIGNED-OUT EITHER
 * ===========================================================================
 * `supabase.auth.getUser()` asks Supabase Auth over the network. When that
 * request fails (a 504 from its gateway, a dropped connection, the
 * AuthRetryableFetchError production logs show at busy moments) it comes
 * back with an error and no user, the same shape as a real signed-out. The
 * header read both the same way: it cleared the snapshot and drew Log in
 * for somebody who was signed in the whole time.
 *
 * True only when Auth itself said there is no valid session: no session at
 * all, a token it refused (401, 403), or a session, refresh token or user it
 * no longer has. Anything else is "could not tell", and the screen keeps
 * what it showed.
 */
export function signedOutForSure(error: unknown, user: unknown): boolean {
  if (user) return false
  if (!error) return true
  const e = error as { name?: unknown; status?: unknown; code?: unknown }
  if (e.name === "AuthSessionMissingError") return true
  if (e.name === "AuthRetryableFetchError") return false
  if (e.status === 401 || e.status === 403) return true
  return typeof e.code === "string" && ["session_not_found", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "user_not_found", "no_authorization"].includes(e.code)
}
