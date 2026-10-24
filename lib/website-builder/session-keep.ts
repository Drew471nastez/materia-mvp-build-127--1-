/**
 * ===========================================================================
 *  A 401 IN THE EDITOR IS ASKED ABOUT BEFORE ANYBODY IS SIGNED OUT
 * ===========================================================================
 * The owner: "sometimes randomly in the website builder editor I get You
 * signed out". The editor showed "You're signed out" for any save answered
 * 401, and a 401 is not a sign out: the access token in the cookie can have
 * expired a moment before the browser's client renewed it, another tab can
 * have renewed it first (a refresh token is used once), or Auth can have
 * been slow for the server while it was fine for the browser.
 *
 * So a request the editor makes that is answered 401 asks the browser's own
 * session first (one renewal at a time, shared by every request waiting on
 * it), and:
 *
 *   renewed     the request is sent again, once, with the renewed cookie
 *   signed-out  the browser holds no session, or Auth refused it and the
 *               user as well: the 401 is handed back, and the editor says so
 *               (a real sign out, in this tab or another, still signs out)
 *   unsure      Auth did not answer: handed back as a 503, which the editor
 *               tries again on its own and never calls a sign out
 *
 * Nothing here grants anything: the request sent again is checked by the
 * server like any other.
 */
import { createClient } from "@/lib/supabase/client"
import { readSessionBounded, signedOutForSure } from "@/lib/auth/session-read"

export type SessionVerdict = "renewed" | "signed-out" | "unsure"

type AuthLike = {
  auth: {
    getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>
    refreshSession: () => Promise<{ data: { session: unknown | null }; error: unknown }>
    getUser: () => Promise<{ data: { user: unknown | null }; error: unknown }>
  }
}

const TIMEOUT = Symbol("timeout")
function bounded<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(TIMEOUT), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      () => { clearTimeout(t); resolve(TIMEOUT) },
    )
  })
}

/** The decision, on any client shaped like Supabase's (tests pass their own). */
export async function decideSession(supabase: AuthLike): Promise<SessionVerdict> {
  const before = await readSessionBounded(supabase as never, 4_000)
  /* The browser answered and holds no session: signed out, here or in another tab. */
  if (!before.timedOut && !before.failed && !before.session) return "signed-out"
  if (!before.session) return "unsure"
  const token = (before.session as { access_token?: string }).access_token
  const refreshed = await bounded(supabase.auth.refreshSession(), 6_000)
  if (refreshed === TIMEOUT) return "unsure"
  if (refreshed.data?.session) return "renewed"
  /* Another tab renewed it first: its new token is in the shared cookie now. */
  const after = await readSessionBounded(supabase as never, 4_000)
  const now = (after.session as { access_token?: string } | null)?.access_token
  if (now && now !== token) return "renewed"
  if (!signedOutForSure(refreshed.error, null)) return "unsure"
  /* Auth refused the renewal: asked once more about the user before saying so. */
  const user = await bounded(supabase.auth.getUser(), 4_000)
  if (user === TIMEOUT) return "unsure"
  if (user.data?.user) return "renewed"
  return signedOutForSure(user.error, user.data?.user) ? "signed-out" : "unsure"
}

let pending: Promise<SessionVerdict> | null = null

/** One renewal at a time: every request answered 401 meanwhile waits on the same one. */
export function renewSession(client?: AuthLike): Promise<SessionVerdict> {
  if (pending) return pending
  let supabase: AuthLike
  try {
    supabase = client ?? (createClient() as unknown as AuthLike)
  } catch {
    return Promise.resolve("unsure")
  }
  const run = decideSession(supabase).catch((): SessionVerdict => "unsure")
  pending = run
  void run.finally(() => {
    if (pending === run) pending = null
  })
  return run
}

/** Said for a request whose 401 could not be told apart from a blip: the editor tries again on its own. */
export const UNSURE_BODY = { error: "Storelib could not check your sign in just now. Your changes are still here; it tries again on its own." }

/**
 * `run`, and once more after the session is renewed if it was answered 401.
 * A real sign out comes back as the 401 it was; a blip as a 503.
 */
export async function fetchSignedIn(run: () => Promise<Response>, client?: AuthLike): Promise<Response> {
  const res = await run()
  if (res.status !== 401) return res
  const verdict = await renewSession(client)
  if (verdict === "renewed") return run()
  if (verdict === "unsure") return new Response(JSON.stringify(UNSURE_BODY), { status: 503, headers: { "content-type": "application/json" } })
  return res
}
