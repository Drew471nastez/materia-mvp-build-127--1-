import { NextResponse } from "next/server"
import {
  HINT_COOKIE,
  hintCookie,
  hostOf,
  pendingCookie,
  pendingCookieName,
  sessionCookie,
  sessionCookieName,
} from "@/lib/site-accounts/session"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SIGN OUT OF A CREATOR'S WEBSITE
 * ===========================================================================
 * Ends this website's session and nothing else: the customer stays signed
 * in to any other website they signed in to, the way leaving one shop does
 * not sign anybody out of another. The account page's button posts here; a
 * GET does the same, for a link in a theme (Shopify's /account/logout is a
 * link too).
 *
 * Every cookie of the sign in goes: the session, the hint the page reads,
 * and a code step left half way, so the next page is drawn for a guest. The
 * browser's copy of the account's saved items is removed by the page itself
 * when it finds the hint gone (components/website-builder/site-wishlist).
 */
function signOut(request: Request) {
  const host = hostOf(request)
  const res = NextResponse.redirect(new URL("/", originOf(host)), 303)
  res.cookies.set(sessionCookieName(host), "", { ...sessionCookie(host), maxAge: 0 })
  res.cookies.set(pendingCookieName(host), "", { ...pendingCookie(host), maxAge: 0 })
  res.cookies.set(HINT_COOKIE, "", { ...hintCookie(host), maxAge: 0 })
  return privateResponse(res)
}

export async function POST(request: Request) {
  return signOut(request)
}

export async function GET(request: Request) {
  return signOut(request)
}
