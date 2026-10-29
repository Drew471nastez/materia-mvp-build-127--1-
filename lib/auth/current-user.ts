import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { classifyAuthError } from "./auth-error"

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

/** getUser(), with a ceiling, because it goes to the network. */
async function getUserBounded(supabase: SupabaseClient, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms)
  })
  try {
    return await Promise.race([
      supabase.auth.getUser().then((r) => ({ ...r, timedOut: false as const })),
      timeout,
    ])
  } catch (error) {
    return { data: { user: null }, error, timedOut: false as const }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

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
    /** The Supabase URL, whose public keys verify the token when Auth does not answer. Off unless given. */
    fallbackClaims = null,
  }: { timeoutMs?: number; retries?: number; fallbackClaims?: string | null } = {},
): Promise<CurrentUser> {
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

  /*
    SUPABASE AUTH DID NOT ANSWER: THE TOKEN CAN STILL BE CHECKED. This is
    what put "Cannot reach the server" over /app/settings: getUser() is a
    round trip to Supabase Auth on every page, every soft navigation and
    every prefetch, and when it timed out the layout handed the screen to the
    browser's recovery (components/native-auth-gate.tsx), which went through
    /auth/sync-session (the same Auth again) and, twice later, gave up.

    The access token in the cookie is a JWT Supabase signed. Checked against
    Supabase's public keys (kept per instance, signingKeys below) it says who
    this is without asking Auth: a forged, altered or expired token fails.
    That is the same check Postgres row level security makes on every query,
    so nothing is readable here that the token would not open anyway. What it
    cannot see is a session revoked in the last hour (the token's life),
    which row level security cannot see either; and user_metadata is as of
    the token, which is why getUser stays the first question.

    Only with asymmetric keys: on the shared secret getClaims would call
    getUser again, which is the call that just failed.
  */
  if (fallbackClaims) {
    const claimed = await userFromClaims(supabase, fallbackClaims)
    if (claimed) return { user: claimed, state: "authenticated", verifiedBy: "claims", reason }
  }

  return { user: null, state: "indeterminate", reason }
}

/** The fallback's own ceiling: the keys are normally in memory, so this is a signature check, not a request. */
const CLAIMS_FALLBACK_MS = 1_500

async function userFromClaims(supabase: SupabaseClient, supabaseUrl: string): Promise<User | null> {
  try {
    const jwks = await signingKeys(supabaseUrl)
    if (!jwks.keys.length) return null
    const result = await getClaimsBounded(supabase, jwks, CLAIMS_FALLBACK_MS)
    if (result.timedOut) return null
    const claims = (result as { data: { claims?: Record<string, unknown> } | null }).data?.claims
    const sub = typeof claims?.sub === "string" ? claims.sub : null
    if (!claims || !sub || (result as { error?: unknown }).error) return null
    return {
      id: sub,
      aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
      role: typeof claims.role === "string" ? claims.role : undefined,
      email: typeof claims.email === "string" ? claims.email : undefined,
      phone: typeof claims.phone === "string" ? claims.phone : undefined,
      app_metadata: (claims.app_metadata as User["app_metadata"]) ?? {},
      user_metadata: (claims.user_metadata as User["user_metadata"]) ?? {},
      is_anonymous: claims.is_anonymous === true,
      created_at: "",
    } as User
  } catch {
    return null
  }
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
 * proxy.ts asks readCurrentUser on every matched request: each page, each
 * prefetch the router makes of a link on screen, each /api call. getUser()
 * is a round trip to Supabase Auth, so for anybody signed in every one of
 * those waited on Supabase before the page could start, and the page then
 * asked again (lib/auth/request-scope). On a slow minute for Supabase Auth
 * the proxy alone held a request for 3s, a pause, and 3s again.
 *
 * getClaims() checks the access token's signature with Supabase's public
 * signing keys when the project signs with asymmetric keys, which needs no
 * round trip once the keys are known. It is still a verification: a forged
 * or altered token fails it. A project that signs with the old shared
 * secret has no public key to check against, and getClaims falls back to
 * getUser() itself, so this is never weaker than readCurrentUser, only
 * faster where it can be.
 *
 * The keys are kept here, per server instance, because the proxy makes a
 * new Supabase client per request and the client's own copy would be
 * fetched again every time. Fetched with a ceiling; a failed fetch is
 * remembered briefly so a slow key endpoint is not asked on every request.
 */
type Jwks = { keys: Array<Record<string, unknown> & { kid?: string }> }
const JWKS_FRESH_MS = 10 * 60_000
const JWKS_FAILED_MS = 60_000
let jwksCache: { jwks: Jwks; until: number } | null = null
let jwksLoading: Promise<Jwks> | null = null

async function signingKeys(supabaseUrl: string): Promise<Jwks> {
  const now = Date.now()
  if (jwksCache && jwksCache.until > now) return jwksCache.jwks
  if (jwksLoading) return jwksLoading
  jwksLoading = (async () => {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(2_000) })
      const body = res.ok ? ((await res.json()) as Partial<Jwks>) : null
      const keys = body?.keys
      const jwks: Jwks = { keys: Array.isArray(keys) ? keys : [] }
      jwksCache = { jwks, until: Date.now() + (jwks.keys.length ? JWKS_FRESH_MS : JWKS_FAILED_MS) }
      return jwks
    } catch {
      jwksCache = { jwks: { keys: [] }, until: Date.now() + JWKS_FAILED_MS }
      return jwksCache.jwks
    } finally {
      jwksLoading = null
    }
  })()
  return jwksLoading
}

/** For tests: forget the keys. */
export function forgetSigningKeys() {
  jwksCache = null
  jwksLoading = null
}

async function getClaimsBounded(supabase: SupabaseClient, jwks: Jwks, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms)
  })
  try {
    return await Promise.race([
      supabase.auth.getClaims(undefined, jwks.keys.length ? ({ jwks } as Parameters<SupabaseClient["auth"]["getClaims"]>[1]) : {}).then((r) => ({ ...r, timedOut: false as const })),
      timeout,
    ])
  } catch (error) {
    return { data: null, error, timedOut: false as const }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * The proxy's read: who is signed in, verified, with the same three answers
 * and the same one retry as readCurrentUser. `user` is always null here; the
 * proxy only decides whether to send a request to sign in, and the layouts
 * read the person themselves.
 */
export async function readVerifiedSession(
  supabase: SupabaseClient,
  supabaseUrl: string,
  { timeoutMs = 3_000, retries = 1 }: { timeoutMs?: number; retries?: number } = {},
): Promise<CurrentUser> {
  let reason = "unknown"
  const jwks = await signingKeys(supabaseUrl)

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await getClaimsBounded(supabase, jwks, timeoutMs)

    if (result.timedOut) {
      reason = "timed out"
    } else {
      const { data, error } = result as { data: { claims?: { sub?: string } } | null; error: unknown }
      if (data?.claims?.sub) return { user: null, state: "authenticated" }
      if (!error) return { user: null, state: "anonymous" }
      const verdict = classify(error)
      if (verdict.signedOut) return { user: null, state: "anonymous" }
      reason = verdict.reason
    }

    if (attempt < retries) await new Promise((r) => setTimeout(r, 250))
  }

  return { user: null, state: "indeterminate", reason }
}
