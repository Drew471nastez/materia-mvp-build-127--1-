import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { TEAM_STORE_COOKIE, acceptInvite, declineInvite, joinPath } from "@/lib/team/server"
import { fromOwnPage } from "@/lib/team/own-page"
import { INVITE_COOKIE } from "@/lib/team/invite-links"

/**
 * ===========================================================================
 *  THE BUTTONS ON AN INVITE
 * ===========================================================================
 * GET  is the address older invite emails carry. The invite is a page now
 *      (app/team/join), so it goes there, token and all.
 * POST is the page's Accept and Decline. Opening the link changes nothing,
 *      so an email scanner that opens every link accepts nobody; only a
 *      press on Storelib's own page does (lib/team/own-page.ts).
 *
 *      accept  for the signed in account (lib/team/server.ts acceptInvite):
 *              the invited email, or another account of whoever holds the
 *              link, which the page names first; then straight into the
 *              store, on the first page their permissions open (homeFor)
 *      decline the invite is removed and the owner told
 *
 * Every refusal goes back to the invite page, which reads the invite again
 * and says what is wrong in its own words, with the next step. Nothing here
 * answers with JSON: these are form posts, and whatever the route says is
 * what the browser shows.
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token") ?? ""
  return NextResponse.redirect(new URL(token ? joinPath(token) : "/team/join", url.origin), 308)
}

function back(req: Request, token: string, note?: string): NextResponse {
  const to = new URL(token ? joinPath(token) : "/team/join", req.url)
  if (note) to.searchParams.set("note", note)
  return NextResponse.redirect(to, 303)
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")
  /* Only this page's own button: a form on another site changes nothing and lands on the invite page, which asks again. */
  if (!fromOwnPage(req.headers, req.url)) return back(req, token, "again")
  const action = String(form?.get("action") ?? "accept")

  if (action === "decline") {
    const limited = await rateLimit({ bucket: "team-decline", subjects: [`token:${token.slice(0, 12)}`], windows: LIMITS.claim, message: "Too many tries." })
    if (limited) return back(req, token, "slow")
    const out = await declineInvite(createAdminClient(), token)
    if (out.ok === false) return back(req, token, "failed")
    return NextResponse.redirect(new URL("/team/join?declined=1", req.url), 303)
  }

  const user = await requestUser(req)
  if (!user) return back(req, token)
  const limited = await rateLimit({ bucket: "team-accept", subjects: [`user:${user.id}`], windows: LIMITS.claim, message: "Too many tries." })
  if (limited) return back(req, token, "slow")
  const out = await acceptInvite(createAdminClient(), token, user)
  if (out.ok === false) return back(req, token, out.status >= 500 ? "failed" : undefined)
  /* The first page they may use, which can carry its own query (Settings › Team): joined=1 is added to it, never a second "?". */
  const landing = new URL(out.home, req.url)
  landing.searchParams.set("joined", "1")
  const res = NextResponse.redirect(landing, 303)
  res.cookies.set(TEAM_STORE_COOKIE, out.creatorId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 })
  res.cookies.set(INVITE_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}
