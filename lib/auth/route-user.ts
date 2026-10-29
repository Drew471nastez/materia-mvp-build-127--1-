import "server-only"

import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"

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
 * `fresh` (the default) asks Supabase Auth itself and never accepts the
 * token's signature alone: a change, a payment, a key saved. A read may pass
 * `fresh: false`, and when Auth does not answer the access token's signature
 * is checked against Supabase's public keys instead (lib/auth/current-user.ts
 * readCurrentUser fallbackClaims), the same check row level security makes
 * on every query.
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

export async function routeUser({ fresh = true }: { fresh?: boolean } = {}): Promise<RouteUser> {
  try {
    const supabase = await createClient()
    return routeUserFrom(await readCurrentUser(supabase, { fallbackClaims: fresh ? null : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? null) }))
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
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } },
  )
}
