import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { exchangeCode } from "@/lib/site-accounts/exchange"
import { sweepCodes } from "@/lib/site-accounts/codes"
import {
  cookieFrom,
  HINT_COOKIE,
  hintCookie,
  hostOf,
  SESSION_COOKIE,
  sessionCookie,
  STATE_COOKIE,
  stateCookie,
} from "@/lib/site-accounts/session"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE CODE FROM STORELIB.COM, TURNED INTO THIS WEBSITE'S OWN COOKIE
 * ===========================================================================
 * The last hop of signing in to a creator's website, on the website's host.
 * Every check is in lib/site-accounts/exchange.ts: signed here and not
 * expired, made for THIS host, carrying the state this browser was given
 * when it pressed Sign in, for the creator this host belongs to now, and
 * never exchanged before. A refusal says which kind of problem it was
 * (the sign in page turns that into a sentence) and nothing about the
 * account.
 *
 * What it gives is a session for this website only: httpOnly, on this host,
 * fourteen days. It lets this website show the visitor their purchases from
 * this creator and keep their saved items here, and nothing else.
 */
export async function GET(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)
  const db = createAdminClient()

  const result = await exchangeCode(db, {
    code: new URL(request.url).searchParams.get("code"),
    host,
    state: cookieFrom(request, STATE_COOKIE),
  })

  if (result.ok === false) {
    const res = NextResponse.redirect(new URL(`/account/login?error=${result.why}`, origin), 303)
    res.cookies.set(STATE_COOKIE, "", { ...stateCookie(host), maxAge: 0 })
    return privateResponse(res)
  }

  /* Now and then, the ids nothing can present again (codes live two minutes). */
  if (Math.random() < 0.05) await sweepCodes(db)

  /* A path (checked when the code was read), so this stays on this host. */
  const res = NextResponse.redirect(new URL(result.returnPath, origin), 303)
  res.cookies.set(SESSION_COOKIE, result.session, sessionCookie(host))
  res.cookies.set(HINT_COOKIE, "1", hintCookie(host))
  res.cookies.set(STATE_COOKIE, "", { ...stateCookie(host), maxAge: 0 })
  return privateResponse(res)
}
