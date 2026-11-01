import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { classifyAuthError } from "./auth-error"
import { canVerifyLocally, forgetSigningKeys, userFromClaims, verifyAccessToken } from "./verify-token"

/**
 * ===========================================================================
 *  "IT LOGS ME OUT AND I DID NOT DO ANYTHING"
 * ===========================================================================
 * lib/auth/session-read.ts says it on the client, in its own words: a timeout
 * is not a signed-out. Its header even points at a server-side equivalent
 * that draws the same distinction.
 *
 * THAT FILE DID NOT EXIST. This is it, and the mistake it names is live in
 * about twenty places right now:
 *
 *     const { data: { user } } = await supabase.auth.getUser()
 *     if (!user) redirect("/login")
 *
 * Read what that discards. `getUser()` returns `{ data, error }`, and every
 * caller in this codebase throws `error` away — so THREE different outcomes
 * collapse into one:
 *
 *   1. Supabase said "nobody is signed in".           Correct to redirect.
 *   2. Supabase said "this refresh token is revoked". Correct to redirect.
 *   3. SUPABASE DID NOT ANSWER.                       Not a sign-out at all.
 *
 * The third is a network blip between Vercel and Supabase, a 502 from the
 * auth service, a cold start that took too long. The person's session is
 * intact, in their cookies, valid. The app throws them out anyway, because
 * `user` was null and nothing looked at why.
 *
 * And it is in proxy.ts, which runs on EVERY request that matches, so the
 * dice are rolled continuously all day. That is the shape of the report:
 * rare, random, correlated with nothing the person did, and impossible to
 * reproduce on purpose.
 *
 * ---------------------------------------------------------------------------
 *  THE ASYMMETRY, SPELLED OUT
 * ---------------------------------------------------------------------------
 * Being wrong in one direction costs a signed-out person one extra page that
 * renders and then redirects properly, or one request that row-level security
 * refuses. Being wrong in the other direction costs a signed-in person their
 * session, their place in the product, and their belief that it works.
 *
 * Those are not equal, so this does not treat them as equal. NOTHING HERE
 * GRANTS ACCESS: it decides only whether to keep somebody where they are or
 * bounce them to a login form. Every real permission is still a JWT checked
 * by Postgres row-level security, and an indeterminate answer produces no
 * JWT at all, so a query made in this state returns nothing rather than
 * somebody else's rows.
 */

export type AuthState =
  /** Supabase returned a user. */
  | "authenticated"
  /** Supabase answered, and the answer was nobody. Safe to redirect. */
  | "anonymous"
  /** Supabase did not answer. NOT a sign-out. */
  | "indeterminate"

export interface CurrentUser {
  user: User | null
  state: AuthState
  /** Present when the state is indeterminate. For logs, never for a screen. */
  reason?: string
  /**
   * How an authenticated answer was verified: "user" by Supabase Auth itself
   * (getUser), "claims" by the access token's signature against Supabase's
   * public keys when Auth did not answer (readCurrentUser's fallback).
   */
  verifiedBy?: "user" | "claims"
}

/**
 * What counts as a real sign-out is decided in lib/auth/auth-error.ts, which
 * the client screens ask too, so the server and the browser cannot disagree
 * about what a 502 means.
 */
const classify = classifyAuthError

/** getUser(), with a ceiling, because it goes to the network. With `jwt`, that token is asked about and supabase-js's session lock is not taken. */
async function getUserBounded(supabase: SupabaseClient, ms: number, jwt?: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms)
  })
  try {
    return await Promise.race([
      (jwt ? supabase.auth.getUser(jwt) : supabase.auth.getUser()).then((r) => ({ ...r, timedOut: false as const })),
      timeout,
    ])
  } catch (error) {
    return { data: { user: null }, error, timedOut: false as const }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** getSession(), with a ceiling: no request unless the access token ran out and is renewed. */
async function getSessionBounded(supabase: SupabaseClient, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms)
  })
  try {
    return await Promise.race([supabase.auth.getSession().then((r) => ({ ...r, timedOut: false as const })), timeout])
  } catch (error) {
    return { data: { session: null }, error, timedOut: false as const }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * How long Supabase Auth is given when the token can be checked here
 * instead (lib/auth/verify-token.ts): one try, short, then the signature.
 * Without that, the old three seconds and one retry.
 */
export const AUTH_FIRST_TRY_MS = 2_500

/**
 * Who is making this request, and how sure are we.
 *
 * ONE RETRY, and only for the indeterminate case. Most blips are over in
 * well under a second, and retrying costs one request on a path that was
 * already failing. A definite answer is never retried: re-asking a question
 * that was answered only makes every page slower.
 */
export async function readCurrentUser(
  supabase: SupabaseClient,
  {
    timeoutMs = 3_000,
    retries = 1,
    /** The Supabase URL: when Auth does not answer, the token is checked here (lib/auth/verify-token.ts). Off unless given. */
    fallbackClaims = null,
    /** Auth's one try when the fallback can check the token. */
    firstTryMs = AUTH_FIRST_TRY_MS,
  }: { timeoutMs?: number; retries?: number; fallbackClaims?: string | null; firstTryMs?: number } = {},
): Promise<CurrentUser> {
  if (fallbackClaims && typeof (supabase.auth as { getSession?: unknown }).getSession === "function") {
    return readWithFallback(supabase, fallbackClaims, { timeoutMs, retries, firstTryMs })
  }

  let reason = "unknown"

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await getUserBounded(supabase, timeoutMs)

    if ("timedOut" in result && result.timedOut) {
      reason = "timed out"
    } else {
      const { data, error } = result as { data: { user: User | null }; error: unknown }
      if (data?.user) return { user: data.user, state: "authenticated", verifiedBy: "user" }

      if (!error) return { user: null, state: "anonymous" }

      const verdict = classify(error)
      if (verdict.signedOut) return { user: null, state: "anonymous" }
      reason = verdict.reason
    }

    /** A short pause, with jitter, so the retry lands after the blip rather than inside it, and not in step with every other request that hit it. */
    if (attempt < retries) await new Promise((r) => setTimeout(r, 200 + Math.round(Math.random() * 150)))
  }

  return { user: null, state: "indeterminate", reason }
}

/*
  ===========================================================================
   SUPABASE AUTH DID NOT ANSWER: THE TOKEN CAN STILL BE CHECKED
  ===========================================================================
  This is what put "Cannot reach the server" over /app: getUser() is a round
  trip to Supabase Auth on every page, and when it timed out the layout
  handed the screen to the browser's recovery (components/native-auth-gate),
  which went through /auth/sync-session (the same Auth again) and gave up.

  The fallback that was meant to stop it never ran in production, twice
  over: it verified only with public keys, and this project signs with the
  shared secret (its JWKS is empty); and it read the token through
  getClaims(), which takes supabase-js's session lock, which the hung
  getUser() was still holding, so it waited out its own ceiling.

  So the token is read FIRST (getSession: the cookie, renewed only when it
  ran out, exactly what getUser() reads), Auth is asked about that token
  (getUser(jwt), no lock), and when Auth does not answer the same token is
  checked here (lib/auth/verify-token.ts: HS256 with SUPABASE_JWT_SECRET, or
  the JWKS). Same three answers as before: a definite "no" from Auth is
  still a sign out, a forged or expired token is never a yes, and when the
  token cannot be checked here it is "could not tell" exactly as before.
  When it can, Auth gets one short try instead of two long ones.
*/
async function readWithFallback(
  supabase: SupabaseClient,
  supabaseUrl: string,
  { timeoutMs, retries, firstTryMs }: { timeoutMs: number; retries: number; firstTryMs: number },
): Promise<CurrentUser> {
  const read = await getSessionBounded(supabase, timeoutMs)
  if (read.timedOut) return { user: null, state: "indeterminate", reason: "timed out" }
  const { data: sessionData, error: sessionError } = read as { data: { session: { access_token?: string } | null }; error: unknown }
  if (sessionError) {
    const verdict = classify(sessionError)
    if (verdict.signedOut) return { user: null, state: "anonymous" }
    return { user: null, state: "indeterminate", reason: verdict.reason }
  }
  const token = sessionData?.session?.access_token
  /* No token: what getUser() answers with AuthSessionMissingError. */
  if (!token) return { user: null, state: "anonymous" }

  const local = await canVerifyLocally(supabaseUrl)
  const tries = local ? 0 : retries
  const ms = local ? Math.min(timeoutMs, firstTryMs) : timeoutMs
  let reason = "unknown"
  for (let attempt = 0; attempt <= tries; attempt++) {
    const result = await getUserBounded(supabase, ms, token)
    if ("timedOut" in result && result.timedOut) {
      reason = "timed out"
    } else {
      const { data, error } = result as { data: { user: User | null }; error: unknown }
      if (data?.user) return { user: data.user, state: "authenticated", verifiedBy: "user" }
      if (!error) return { user: null, state: "anonymous" }
      const verdict = classify(error)
      if (verdict.signedOut) return { user: null, state: "anonymous" }
      reason = verdict.reason
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 200 + Math.round(Math.random() * 150)))
  }

  if (local) {
    const claims = await verifyAccessToken(token, supabaseUrl)
    if (claims) return { user: userFromClaims(claims), state: "authenticated", verifiedBy: "claims", reason }
  }
  return { user: null, state: "indeterminate", reason }
}

/**
 * "Is it correct to send this person to a login form?"
 *
 * The single question every guard in this codebase is actually asking, with
 * the only answer that does not throw signed-in people out: yes when Supabase
 * said so, never when Supabase said nothing.
 */
export function shouldSendToLogin(current: CurrentUser): boolean {
  return current.state === "anonymous"
}

/**
 * ===========================================================================
 *  THE SAME QUESTION, VERIFIED WITHOUT A ROUND TRIP WHEN IT CAN BE
 * ===========================================================================
 * proxy.ts asks this for /app, /dashboard and /sell, where a signed out
 * visitor is sent to sign in. It reads the token (getSession: the cookie,
 * renewed when it ran out, which only the proxy can write back) and checks
 * its signature here (lib/auth/verify-token.ts: HS256 with
 * SUPABASE_JWT_SECRET, or ES256 with the JWKS kept per instance). A token
 * that checks out is signed in with no request to Supabase Auth at all: the
 * proxy runs in the visitor's region (fra1) and Auth is across the Atlantic.
 *
 * A token that does NOT check out here is never called signed out on that
 * alone (a missing or wrong secret must not sign anybody out): it goes to
 * Supabase Auth, as before, and Auth's own answer decides. `user` is always
 * null here; the layouts read the person themselves.
 */
export { forgetSigningKeys }

export async function readVerifiedSession(
  supabase: SupabaseClient,
  supabaseUrl: string,
  { timeoutMs = 3_000, retries = 1 }: { timeoutMs?: number; retries?: number } = {},
): Promise<CurrentUser> {
  const read = await getSessionBounded(supabase, timeoutMs)
  if (read.timedOut) return { user: null, state: "indeterminate", reason: "timed out" }
  const { data: sessionData, error: sessionError } = read as { data: { session: { access_token?: string } | null }; error: unknown }
  if (sessionError) {
    const verdict = classify(sessionError)
    if (verdict.signedOut) return { user: null, state: "anonymous" }
    return { user: null, state: "indeterminate", reason: verdict.reason }
  }
  const token = sessionData?.session?.access_token
  if (!token) return { user: null, state: "anonymous" }

  if (await verifyAccessToken(token, supabaseUrl)) return { user: null, state: "authenticated", verifiedBy: "claims" }

  let reason = "unknown"
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await getUserBounded(supabase, timeoutMs, token)
    if ("timedOut" in result && result.timedOut) {
      reason = "timed out"
    } else {
      const { data, error } = result as { data: { user: User | null }; error: unknown }
      if (data?.user) return { user: null, state: "authenticated", verifiedBy: "user" }
      if (!error) return { user: null, state: "anonymous" }
      const verdict = classify(error)
      if (verdict.signedOut) return { user: null, state: "anonymous" }
      reason = verdict.reason
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 250))
  }

  return { user: null, state: "indeterminate", reason }
}

/**
 * ===========================================================================
 *  THE PROXY'S READ WHERE NOTHING IS DECIDED FROM IT
 * ===========================================================================
 * proxy.ts reads the session on every request for two reasons: to renew an
 * expired access token and write the new cookies (only the proxy can, a page
 * cannot), and to send a signed out visitor of /app, /dashboard or /sell to
 * sign in. Everywhere else (a storefront, the marketing site, every /api
 * call, a prefetch of /explore) the answer was never used for anything but
 * the renewal, and on a project that signs with the shared secret
 * readVerifiedSession is a getUser() round trip to Supabase Auth: one per
 * page, prefetch and API call, in front of a handler that asks Supabase Auth
 * itself anyway.
 *
 * getSession() renews the token when it has run out and otherwise reads the
 * cookie, with no request. Same three answers, same classification, same one
 * retry and ceiling as readVerifiedSession.
 *
 * NOT A VERIFICATION. The session it reports is the cookie's, unchecked.
 * NOTHING MAY BE ALLOWED FROM IT: the proxy uses it only off the guarded
 * paths, where it decides nothing. Every route and page still verifies the
 * person itself (lib/auth/route-user, lib/auth/request-scope), and row level
 * security still checks the token's signature on every query.
 */
export async function readSessionPresence(
  supabase: SupabaseClient,
  { timeoutMs = 3_000, retries = 1 }: { timeoutMs?: number; retries?: number } = {},
): Promise<CurrentUser> {
  let reason = "unknown"
  for (let attempt = 0; attempt <= retries; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
    })
    const result = await Promise.race([
      supabase.auth.getSession().then((r) => ({ ...r, timedOut: false as const })),
      timeout,
    ])
      .catch((error: unknown) => ({ data: { session: null }, error, timedOut: false as const }))
      .finally(() => timer && clearTimeout(timer))

    if (result.timedOut) {
      reason = "timed out"
    } else {
      const { data, error } = result as { data: { session: { access_token?: string } | null }; error: unknown }
      if (data?.session?.access_token) return { user: null, state: "authenticated" }
      if (!error) return { user: null, state: "anonymous" }
      const verdict = classify(error)
      if (verdict.signedOut) return { user: null, state: "anonymous" }
      reason = verdict.reason
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 250))
  }
  return { user: null, state: "indeterminate", reason }
}
