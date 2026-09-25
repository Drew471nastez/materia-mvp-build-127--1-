import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { verifyCode } from "@/lib/site-accounts/sign-in"
import { sweepCodes } from "@/lib/site-accounts/codes"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import {
  cookieFrom,
  HINT_COOKIE,
  hintCookie,
  hostOf,
  pendingCookie,
  pendingCookieName,
  sessionCookie,
  sessionCookieName,
} from "@/lib/site-accounts/session"
import { originOf, privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SIGN IN, STEP TWO: THE CODE, AND THE WEBSITE'S OWN SESSION
 * ===========================================================================
 * The code form on the sign in page posts here. Every check is in
 * lib/site-accounts/sign-in.ts and ./codes.ts: the note this browser kept
 * (signed here, this host, this creator), the code (ten minutes, five tries,
 * once), then the customer for that email on this website, made now when
 * there is none. A new email is a new account; there is no other form.
 *
 * What it gives is a session for this website only: httpOnly, __Host-, this
 * host, fourteen days. It lets this website show the customer their orders
 * from this creator and keep their saved items here, and nothing else. It is
 * not a Storelib login and nothing on storelib.com reads it.
 *
 * A refusal goes back to the sign in page with a fixed reason and says
 * nothing about whether the email has an account.
 */
export async function POST(request: Request) {
  const host = hostOf(request)
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }

  /* The per-code count is the real limit on guessing; this stops one visitor walking through many. */
  const limited = await rateLimit({
    bucket: "site-signin-verify",
    subjects: [addressSubject(request)],
    windows: [{ limit: 30, seconds: 600 }, { limit: 200, seconds: 86400 }],
  })
  const origin = originOf(host)
  if (limited) return privateResponse(NextResponse.redirect(new URL("/account/login?error=limit", origin), 303))

  const db = createAdminClient()
  const result = await verifyCode(
    { host, pending: cookieFrom(request, pendingCookieName(host)), code: form?.get("code") },
    { db, owner: (h) => siteOwnerOfHost(db, h) },
  )

  if (result.ok === false) {
    return privateResponse(NextResponse.redirect(new URL(`/account/login?error=${result.why}`, origin), 303))
  }

  /* Now and then, the rows nothing can present again (codes live ten minutes). */
  if (Math.random() < 0.05) await sweepCodes(db)

  /* A path, checked when the note was made, so this stays on this host. */
  const res = NextResponse.redirect(new URL(result.returnPath, origin), 303)
  res.cookies.set(sessionCookieName(host), result.session, sessionCookie(host))
  res.cookies.set(HINT_COOKIE, "1", hintCookie(host))
  res.cookies.set(pendingCookieName(host), "", { ...pendingCookie(host), maxAge: 0 })
  return privateResponse(res)
}
