import "server-only"

import { verifyAccessToken, userFromClaims } from "@/lib/auth/verify-token"
import { AUTH_FIRST_TRY_MS } from "@/lib/auth/current-user"

/**
 * ===========================================================================
 *  /auth/sync-session WHEN SUPABASE AUTH DOES NOT ANSWER
 * ===========================================================================
 * The recovery screen (components/native-auth-gate.tsx) posts the session
 * the device holds to /auth/sync-session, which calls setSession(). For a
 * token still in date setSession asks Supabase Auth GET /auth/v1/user, and
 * during Auth's slow minute (Nov 1, 09:03 UTC) that ran into its 10s
 * deadline: no cookies were written, the page asked Auth again, and the
 * person got "Cannot reach the server" with a valid session on the device.
 *
 * This is the fetch for that one client. GET /auth/v1/user is given
 * AUTH_FIRST_TRY_MS; when it fails to answer in time, or answers 5xx, the
 * bearer token it was asking about is checked here (lib/auth/verify-token)
 * and, when it checks out, the user is answered from its verified claims.
 * Any other answer from Auth (a 401 or 403 for a revoked session, a 400) is
 * handed back as it is, so a token Auth refused is still refused. A token
 * that does not check out here gets Auth's failure as it was.
 *
 * Only setSession's own question is answered this way; every other request
 * (a renewal, a sign in) goes through untouched.
 */
export function claimsBackedUserFetch(
  base: typeof fetch,
  supabaseUrl: string,
  { budgetMs = AUTH_FIRST_TRY_MS, onFallback }: { budgetMs?: number; onFallback?: () => void } = {},
): typeof fetch {
  const userUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
    if (method !== "GET" || url.split("?")[0] !== userUrl) return base(input, init)

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const bearer = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "")?.[1] ?? null

    const ctl = new AbortController()
    const caller = init?.signal
    if (caller) {
      if (caller.aborted) ctl.abort(caller.reason)
      else caller.addEventListener("abort", () => ctl.abort(caller.reason), { once: true })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), budgetMs)
    })
    let failure: unknown = null
    let answer: Response | null = null
    try {
      const got = await Promise.race([base(input, { ...init, signal: ctl.signal }), timedOut])
      if (got === "timeout") ctl.abort(new Error(`auth/v1/user gave no answer in ${budgetMs}ms`))
      else answer = got
    } catch (e) {
      failure = e
    } finally {
      clearTimeout(timer)
    }
    if (answer && answer.status < 500) return answer

    const claims = bearer ? await verifyAccessToken(bearer, supabaseUrl) : null
    if (claims) {
      void answer?.body?.cancel().catch(() => {})
      onFallback?.()
      return new Response(JSON.stringify(userFromClaims(claims)), { status: 200, headers: { "content-type": "application/json" } })
    }
    if (answer) return answer
    if (failure) throw failure
    throw new TypeError("fetch failed: auth/v1/user gave no answer in time")
  }) as typeof fetch
}
