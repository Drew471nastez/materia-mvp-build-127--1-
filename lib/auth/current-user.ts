import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"

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
}

/**
 * Errors that mean the session is genuinely finished.
 *
 * A revoked or reused refresh token IS a real sign-out and must redirect, or
 * a dead session would keep somebody in a broken app forever. Everything
 * outside this list is treated as "we could not tell", which is the safe
 * direction for the reasons above.
 */
const DEFINITELY_SIGNED_OUT = [
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
  "user_banned",
  "bad_jwt",
]

function classify(error: unknown): { signedOut: boolean; reason: string } {
  const e = error as { code?: string; status?: number; name?: string; message?: string } | null
  if (!e) return { signedOut: false, reason: "unknown" }

  const code = String(e.code ?? "").toLowerCase()
  const name = String(e.name ?? "")
  const message = String(e.message ?? "").toLowerCase()

  if (DEFINITELY_SIGNED_OUT.some((c) => code === c || message.includes(c.replace(/_/g, " ")))) {
    return { signedOut: true, reason: code || name }
  }

  /**
   * "Auth session missing" is supabase-js saying there was no token to check
   * in the first place, which is an answer and not a failure.
   */
  if (name === "AuthSessionMissingError" || message.includes("auth session missing")) {
    return { signedOut: true, reason: "no session" }
  }

  /**
   * THE ONE THAT WAS COSTING PEOPLE THEIR SESSIONS. supabase-js raises
   * AuthRetryableFetchError when the request never completed, and a 5xx is
   * the auth service having a bad moment. Neither says anything about
   * whether this person is signed in.
   */
  if (name === "AuthRetryableFetchError") return { signedOut: false, reason: "network" }
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) {
    return { signedOut: false, reason: `status ${e.status}` }
  }
  if (message.includes("fetch failed") || message.includes("network") || message.includes("timeout")) {
    return { signedOut: false, reason: "network" }
  }

  /**
   * A 401 or 403 from the auth endpoint is the token being rejected, which is
   * a real sign-out. Anything else unrecognised is not assumed to be one.
   */
  if (typeof e.status === "number" && (e.status === 401 || e.status === 403)) {
    return { signedOut: true, reason: `status ${e.status}` }
  }
  return { signedOut: false, reason: code || name || "unrecognised" }
}

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
  { timeoutMs = 3_000, retries = 1 }: { timeoutMs?: number; retries?: number } = {},
): Promise<CurrentUser> {
  let reason = "unknown"

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await getUserBounded(supabase, timeoutMs)

    if ("timedOut" in result && result.timedOut) {
      reason = "timed out"
    } else {
      const { data, error } = result as { data: { user: User | null }; error: unknown }
      if (data?.user) return { user: data.user, state: "authenticated" }

      if (!error) return { user: null, state: "anonymous" }

      const verdict = classify(error)
      if (verdict.signedOut) return { user: null, state: "anonymous" }
      reason = verdict.reason
    }

    /** A short pause, so the retry lands after the blip rather than inside it. */
    if (attempt < retries) await new Promise((r) => setTimeout(r, 250))
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
