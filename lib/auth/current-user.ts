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
