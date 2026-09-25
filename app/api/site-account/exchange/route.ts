import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { mintSession, readCode, sameState } from "@/lib/site-accounts/token"
import { claimCode, sweepCodes } from "@/lib/site-accounts/codes"
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
 * A code is accepted only when every one of these holds, and a refusal says
 * which kind of problem it was without saying anything about the account:
 *
 *   signed by this server, and not expired           (two minutes)
 *   made for THIS host                               (a code copied to another
 *                                                     website is nothing there)
 *   carrying the state this browser was given when   (a stranger's link cannot
 *   it pressed Sign in                               sign this browser in as
 *                                                     the stranger)
 *   for the creator this host belongs to, now        (looked up again)
 *   never exchanged before                           (claimed in Postgres)
 *
 * What it gives is a session for this website only: httpOnly, on this host,
 * fourteen days. See lib/site-accounts/token.ts for what it can and cannot
 * do, which is show this visitor their purchases from this creator and keep
 * their saved items here, and nothing else.
 */
export async function GET(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)

  const refuse = (why: "expired" | "used" | "unavailable" | "mismatch") => {
    const res = NextResponse.redirect(new URL(`/account/login?error=${why}`, origin), 303)
    res.cookies.set(STATE_COOKIE, "", { ...stateCookie(host), maxAge: 0 })
    return privateResponse(res)
  }

  const code = readCode(new URL(request.url).searchParams.get("code"))
  if (!code) return refuse("expired")
  if (code.h !== host) return refuse("mismatch")
  if (!sameState(cookieFrom(request, STATE_COOKIE), code.s)) return refuse("mismatch")

  const db = createAdminClient()
  const owner = await siteOwnerOfHost(db, host)
  if (!owner || owner.creatorId !== code.c) return refuse("mismatch")

  const claim = await claimCode(db, code)
  if (claim === "used") return refuse("used")
  if (claim !== "claimed") return refuse("unavailable")
  /* Now and then, the ids nothing can present again (codes live two minutes). */
  if (Math.random() < 0.05) await sweepCodes(db)

  const session = mintSession({ userId: code.u, creatorId: code.c, host })
  if (!session) return refuse("unavailable")

  /* `code.r` is a path (checked when the code was read), so this stays on this host. */
  const res = NextResponse.redirect(new URL(code.r, origin), 303)
  res.cookies.set(SESSION_COOKIE, session, sessionCookie(host))
  res.cookies.set(HINT_COOKIE, "1", hintCookie(host))
  res.cookies.set(STATE_COOKIE, "", { ...stateCookie(host), maxAge: 0 })
  return privateResponse(res)
}
