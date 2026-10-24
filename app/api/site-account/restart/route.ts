import { NextResponse } from "next/server"
import { returnPathOf } from "@/lib/site-accounts/hosts"
import { cookieFrom, hostOf, pendingCookie, pendingCookieName, pendingFrom } from "@/lib/site-accounts/session"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  "USE A DIFFERENT EMAIL", ON THE CODE STEP
 * ===========================================================================
 * The link used to open /account/login?step=email, which showed the email
 * step once but left this browser's note of the code it was waiting on in
 * place. The next visit to the sign in page (the header's Account link, a
 * reload, checkout's Sign in) was the code step again, for the address the
 * visitor had just said was the wrong one. And the place they were going
 * (checkout, a product) was lost, since the link carried no `return`.
 *
 * A page cannot change a cookie, so the link comes here: the note is ended,
 * and the visitor lands on the email step with the same place to go back to,
 * read from the note itself when the link does not say. Nothing is looked up
 * and nothing is sent: an ended note only means the code it pointed at can
 * no longer be typed in this browser, which is what the visitor asked for.
 */
export async function GET(request: Request) {
  const host = hostOf(request)
  const note = pendingFrom(cookieFrom(request, pendingCookieName(host)), host)
  const asked = new URL(request.url).searchParams.get("return")
  const path = returnPathOf(asked ?? note?.r)
  const to = new URL("/account/login", originOf(host))
  to.searchParams.set("step", "email")
  if (path !== "/account") to.searchParams.set("return", path)
  const res = NextResponse.redirect(to, 303)
  res.cookies.set(pendingCookieName(host), "", { ...pendingCookie(host), maxAge: 0 })
  return privateResponse(res)
}
