import "server-only"

import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"
import { AUTH_UNAVAILABLE_HEADER } from "@/lib/auth/recovery-backoff"
import { currentUserForRequest, fullUserForRequest, oncePerRequest } from "@/lib/auth/request-scope"
import { verifierKind } from "@/lib/auth/verify-token"
import { AUTH_CHECK_HEADER } from "@/lib/auth/auth-check-header"

export { AUTH_CHECK_HEADER }

/*
  ===========================================================================
   AUTH SLOW: ASK AGAIN, WITH A PAUSE, BEFORE SAYING "COULD NOT CHECK"
  ===========================================================================
  Round 49. Production, Nov 2 07:52-07:54 UTC: /app pages rendered from the
  locally verified token ("auth_degraded","outcome":"claims"), while the API
  routes behind the same screens (Send analytics, markets, translations)
  asked Supabase Auth on their own, strictly, and answered 503 "We could not
  check your sign in just now".

  One first read per request (currentUserForRequest: Auth, then the
  token's own signature when Auth is slow). Then:

    a read     takes that answer, as a page does. When nothing could check
               the token (no local verifier), Auth is asked once more after
               a pause instead of failing at once.
    a change   needs Supabase Auth itself to have answered (wave 3, kept).
               When the first read had only the token's signature, or no
               answer, Auth is asked again: twice more, or once more when
               the first read already gave it two tries, with backoff.
               Still nothing: 503, and nothing was done.

  The extra tries ask about the token read from the cookie (getUser(jwt)),
  so a try that hung does not hold up the next one (lib/auth/current-user
  tokenFirst).

  Changed on purpose (round 52): "a change" above now means only a change
  where revocation matters (routeUser `fresh: true`, strictUserForRequest).
  Every other read and change takes the token's verified signature first and
  does not wait on Auth at all (lib/auth/request-scope currentUserForRequest).
*/
export const STRICT_EXTRA_TIMEOUT_MS = 3_000
export const AUTH_RETRY_PAUSES_MS = [400, 1_000] as const
const retryPause = (attempt: number) => {
  const base = AUTH_RETRY_PAUSES_MS[Math.min(attempt, AUTH_RETRY_PAUSES_MS.length) - 1] ?? 1_000
  return Math.round(base + base * 0.25 * Math.random())
}

/* A read's one extra try is shorter: it follows two 3s tries already, and the browser's read waits 15s in all (lib/net/request WAIT_MS). */
export const READ_EXTRA_TIMEOUT_MS = 2_500

async function askAuthAgain(tries: number, timeoutMs = STRICT_EXTRA_TIMEOUT_MS): Promise<CurrentUser> {
  const supabase = await createClient()
  await new Promise((r) => setTimeout(r, retryPause(1)))
  return readCurrentUser(supabase, { tokenFirst: true, retries: tries - 1, timeoutMs, pauseMs: (a) => retryPause(a + 1) })
}

/**
 * For an ordinary read or change: the page's answer (round 52: the token's
 * signature, checked here, with no Supabase Auth round trip), and when
 * nothing could check the token, one more Auth try after a pause.
 */
export const readerForRequest = cache(
  (): Promise<CurrentUser> =>
    oncePerRequest("reader", async () => {
      const first = await currentUserForRequest()
      if (first.user || first.state === "anonymous") return first
      const again = await askAuthAgain(1, READ_EXTRA_TIMEOUT_MS)
      return again.user || again.state === "anonymous" ? again : first
    }),
)

/** The same, Supabase Auth first: for a route that needs email_confirmed_at or identities (lib/auth/request-scope fullUserForRequest). */
export const fullReaderForRequest = cache(
  (): Promise<CurrentUser> =>
    oncePerRequest("full-reader", async () => {
      const first = await fullUserForRequest()
      if (first.user || first.state === "anonymous") return first
      const again = await askAuthAgain(1, READ_EXTRA_TIMEOUT_MS)
      return again.user || again.state === "anonymous" ? again : first
    }),
)

/**
 * For a read-only GET that asked `supabase.auth.getUser()` itself: the same
 * shape (`{ data: { user } }`), from the request's one read. Those routes
 * waited up to 10s on a slow Auth and then answered 401 to a signed in
 * person; now they take a page's answer (round 49). Row level security still
 * applies to every query, through the token in the cookie.
 */
export async function readUserForRoute({ full = false }: { full?: boolean } = {}): Promise<{ data: { user: CurrentUser["user"] } }> {
  try {
    return { data: { user: (await (full ? fullReaderForRequest() : readerForRequest())).user } }
  } catch {
    return { data: { user: null } }
  }
}

/** For a change: Supabase Auth itself must say who this is. A token's signature alone is never enough here. */
export const strictUserForRequest = cache(
  (): Promise<CurrentUser> =>
    oncePerRequest("strict", async () => {
      /* Auth first (round 52: the ordinary read no longer asks it at all). */
      const first = await fullUserForRequest()
      if (first.verifiedBy === "user" || first.state === "anonymous") return first
      /* Claims: Auth had one short try, so two more. No answer at all: it already had two, so one more. */
      const again = await askAuthAgain(first.verifiedBy === "claims" ? 2 : 1)
      if (again.verifiedBy === "user" || again.state === "anonymous") return again
      return { user: null, state: "indeterminate", reason: again.reason ?? first.reason ?? "unknown" }
    }),
)

/** How this request's identity was checked, for X-Storelib-Auth-Check and the log (never a key, never a token). */
export type AuthCheck = "network" | "local" | "none" | "anonymous"
export function authCheckOf(current: CurrentUser): AuthCheck {
  if (current.verifiedBy === "user") return "network"
  if (current.verifiedBy === "claims") return "local"
  if (current.state === "anonymous") return "anonymous"
  return "none"
}

/** The header value: how this answer was reached and which local check this server has, e.g. "local; verifier=hs256". */
export async function authCheckHeader(current: CurrentUser): Promise<string> {
  return `${authCheckOf(current)}; verifier=${await verifierKind(process.env.NEXT_PUBLIC_SUPABASE_URL ?? null).catch(() => "none")}`
}


/**
 * ===========================================================================
 *  AN API ROUTE'S "WHO IS ASKING", WITH THREE ANSWERS
 * ===========================================================================
 * Routes asked `supabase.auth.getUser()` and read only `data.user`, so a
 * request Supabase Auth did not answer (a timeout, a 502, a cold start) came
 * back as 401 "Sign in again", and the screen told a signed in person their
 * session had ended. The request was refused, which is the safe direction,
 * but the reason given was false and the person went to sign in again for
 * nothing.
 *
 *   user          Supabase Auth said who this is
 *   anonymous     Supabase Auth said nobody (401, as before)
 *   unavailable   Supabase Auth did not answer, twice: 503 with Try again.
 *                 NOTHING IS ALLOWED on this answer. The action is refused,
 *                 only with a true reason.
 *
 * Round 52: the default checks the access token here, by its signature,
 * expiry, issuer, audience and role (lib/auth/verify-token.ts), with no
 * round trip to Supabase Auth, for reads and ordinary changes alike: the
 * same check row level security makes on every query. A slow or down Auth
 * no longer refuses a save.
 *
 * `fresh: true` asks Supabase Auth itself and never accepts the token's
 * signature alone. It is for where a session ended within the token's life
 * must not act: password, email and phone changes, account deletion,
 * payouts and bank details, API and AI keys, team roles, Stripe Connect and
 * billing, security and sessions. tests/auth-strict-r52.test.ts lists them.
 *
 * `full: true` is a read that needs email_confirmed_at or identities, which
 * a token does not carry: Auth first, the signature when Auth is slow.
 */
export type RouteUser =
  | { kind: "user"; user: User }
  | { kind: "anonymous" }
  | { kind: "unavailable"; reason: string }

export function routeUserFrom(current: CurrentUser): RouteUser {
  if (current.user) return { kind: "user", user: current.user }
  if (current.state === "anonymous") return { kind: "anonymous" }
  return { kind: "unavailable", reason: current.reason ?? "unknown" }
}

/*
  Round 49: one answer per request, shared with the page's own read
  (lib/auth/request-scope). The default (round 52, was `fresh: false` for a
  read only) takes what a page takes: the token's verified signature, or
  Supabase Auth when it cannot be checked here, and one more Auth try when
  nothing could check the token. `fresh: true` still needs Auth itself to
  answer, and asks it again with backoff before refusing
  (strictUserForRequest).
*/
export async function routeUser({ fresh = false, full = false }: { fresh?: boolean; full?: boolean } = {}): Promise<RouteUser> {
  try {
    return routeUserFrom(await (fresh ? strictUserForRequest() : full ? fullReaderForRequest() : readerForRequest()))
  } catch {
    /* No cookie store (called outside a request) or a client that would not build: not an answer about anybody. */
    return { kind: "unavailable", reason: "threw" }
  }
}

export const AUTH_UNAVAILABLE_MESSAGE = "We could not check your sign in just now. Try again in a moment."

/** 503, never cached, with a short Retry-After: the request was refused because nobody could say who sent it. */
export function authUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: AUTH_UNAVAILABLE_MESSAGE, retry: true },
    /* X-Storelib-Auth: refused before anything was done, so lib/net/request.ts may ask again by itself (AUTH_UNAVAILABLE_HEADER). */
    /* X-Storelib-Auth-Check: "none" here, since nothing could say who this is (authCheckHeader above). */
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2", [AUTH_UNAVAILABLE_HEADER]: "unavailable", [AUTH_CHECK_HEADER]: "none" } },
  )
}
