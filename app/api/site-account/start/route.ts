import { NextResponse } from "next/server"
import { getMainDomain } from "@/lib/url-helpers"
import { classifySiteHost, returnPathOf } from "@/lib/site-accounts/hosts"
import { newState } from "@/lib/site-accounts/token"
import { hostOf, STATE_COOKIE, stateCookie } from "@/lib/site-accounts/session"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SIGN IN, PRESSED ON A CREATOR'S WEBSITE
 * ===========================================================================
 * Runs on the website's own host (every /api path is served there, see
 * proxy.ts), which is the only place that can set a cookie for it.
 *
 *   1. A random state, kept in this browser in an httpOnly cookie that only
 *      /api/site-account is sent.
 *   2. The visitor goes to storelib.com/account/site with where to come back
 *      to (this host and a path on it) and the state. The platform checks
 *      that address against the creator's own hosts in the database before
 *      it does anything with it.
 *
 * `return` is a PATH on this website; anything else becomes /account. The
 * host is never taken from the query: it is the host this request arrived
 * on, so a link cannot name some other place to come back to.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const host = hostOf(request)
  const platform = `https://${getMainDomain()}`

  /* Not a website's host (storelib.com itself, a preview deployment): there
     is no website to sign in to, and the account is in the Library. */
  if (!classifySiteHost(host)) return privateResponse(NextResponse.redirect(`${platform}/library`, 303))

  const path = returnPathOf(url.searchParams.get("return"))
  const state = newState()
  const to = new URL("/account/site", platform)
  to.searchParams.set("return", `${originOf(host)}${path}`)
  to.searchParams.set("state", state)
  if (url.searchParams.get("mode") === "signup") to.searchParams.set("mode", "signup")

  const res = NextResponse.redirect(to, 303)
  res.cookies.set(STATE_COOKIE, state, stateCookie(host))
  return privateResponse(res)
}
