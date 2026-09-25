/**
 * ===========================================================================
 *  IS THIS ERROR A SIGN-OUT, OR JUST A BAD MOMENT?
 * ===========================================================================
 * The one question every auth check in the app has to answer before it sends
 * somebody to /login. It used to live inside lib/auth/current-user.ts, which
 * is server only, so the client had no way to ask it and every client screen
 * guessed instead: `if (!user) router.push("/login")`, with the error thrown
 * away. A dropped connection read as a sign-out.
 *
 * Pure, no imports, safe in a server bundle and a client bundle alike.
 *
 * NOTHING HERE GRANTS ACCESS. It decides only whether to keep somebody where
 * they are or to send them to a login form. Every real permission is a JWT
 * checked by Postgres row level security.
 */

/**
 * Errors that mean the session is really finished.
 *
 * A revoked or reused refresh token IS a sign-out and must redirect, or a dead
 * session would keep somebody in a broken app for ever. Everything outside
 * this list is treated as "we could not tell", which is the safe direction.
 */
export const DEFINITELY_SIGNED_OUT = [
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
  "user_banned",
  "bad_jwt",
] as const

export interface AuthErrorVerdict {
  /** Supabase answered, and the answer was: nobody is signed in. */
  signedOut: boolean
  /** For a log line, never for a screen. */
  reason: string
}

export function classifyAuthError(error: unknown): AuthErrorVerdict {
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
   * supabase-js raises AuthRetryableFetchError when the request never
   * completed, and a 5xx is the auth service having a bad moment. Neither
   * says anything about whether this person is signed in.
   */
  if (name === "AuthRetryableFetchError") return { signedOut: false, reason: "network" }
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) {
    return { signedOut: false, reason: `status ${e.status}` }
  }
  if (message.includes("fetch failed") || message.includes("network") || message.includes("timeout") || message.includes("load failed")) {
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

/**
 * For a client screen holding the result of `getUser()` or `getSession()`:
 * is it right to send this person to /login?
 *
 * Yes when there is no user AND Supabase said so (no error, or an error that
 * means signed out). No when the call failed for any other reason: the
 * session is still in the cookie or on the device, and the next request will
 * very likely work.
 */
export function isSignedOutAnswer(hasUser: boolean, error: unknown): boolean {
  if (hasUser) return false
  if (!error) return true
  return classifyAuthError(error).signedOut
}
