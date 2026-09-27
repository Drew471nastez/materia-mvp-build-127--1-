/**
 * ===========================================================================
 *  A REFUSED REFRESH IS A SIGN OUT, NOT AN ERROR
 * ===========================================================================
 * "r1 [AuthApiError]: Invalid Refresh Token: Already Used", from the proxy.
 *
 * Nothing threw. @supabase/ssr's createServerClient registers listeners on
 * the auth client, and when the session in the cookie has expired each
 * listener's first event asks for a refresh; when Supabase refuses it (the
 * refresh token was already spent, by a request that raced this one or by a
 * response the browser never kept) supabase-js writes the error with
 * console.error, once per listener, and Vercel lists it as an error. `r1` is
 * the class's name after minifying. Measured with the real client and a
 * refusal: two console.error lines, then getUser() answers
 * refresh_token_already_used and the cookies are cleared.
 *
 * The request is already handled right: lib/auth/current-user.ts reads
 * that answer as "nobody is signed in" (lib/auth/auth-error.ts), the proxy
 * sends /app to the login page with the cleared cookies, and the next
 * request has no dead token to try again, so there is no loop.
 *
 * So those lines become one: which refusal, and that the request went on as
 * signed out. Only an auth error whose code is a definite sign out is
 * touched; every other console.error is passed through as it was.
 */
import { DEFINITELY_SIGNED_OUT } from "./auth-error"

type Sink = { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }

const MARK = Symbol.for("storelib.auth.quiet-refusals")

/** The refusal supabase-js logs for a dead session, and its code. */
export function refusalCode(args: unknown[]): string | null {
  if (args.length !== 1) return null
  const e = args[0] as { __isAuthError?: unknown; name?: unknown; code?: unknown } | null
  if (!e || typeof e !== "object") return null
  if (e.__isAuthError !== true && !/^Auth\w*Error$/.test(String(e.name ?? ""))) return null
  const code = String(e.code ?? "")
  return (DEFINITELY_SIGNED_OUT as readonly string[]).includes(code) ? code : null
}

export function quietAuthRefusals(sink: Sink = console): boolean {
  const s = sink as Sink & { [MARK]?: boolean }
  if (s[MARK]) return false
  const error = sink.error.bind(sink)
  const warn = sink.warn.bind(sink)
  /* Each listener logs the same refusal: said once. */
  const said = new WeakSet<object>()
  sink.error = (...args: unknown[]) => {
    const code = refusalCode(args)
    if (!code) return error(...args)
    if (said.has(args[0] as object)) return
    said.add(args[0] as object)
    warn(`[auth] Supabase refused the session's refresh (${code}); the request went on as signed out`)
  }
  Object.defineProperty(s, MARK, { value: true })
  return true
}
