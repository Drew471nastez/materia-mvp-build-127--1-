import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { TEAM_STORE_COOKIE, acceptInvite, declineInvite, joinPath } from "@/lib/team/server"

/**
 * ===========================================================================
 *  THE BUTTONS ON AN INVITE
 * ===========================================================================
 * GET  is the address older invite emails carry. The invite is a page now
 *      (app/team/join), so it goes there, token and all.
 * POST is the page's Accept and Decline. Opening the link changes nothing,
 *      so an email scanner that opens every link accepts nobody; only a
 *      press on Storelib's own page does (the Origin check below).
 *
 *      accept  for the signed in account, whose email has to be the one
 *              invited (lib/team/server.ts acceptInvite), then straight into
 *              the store where the role starts (roleHome)
 *      decline the invite is removed and the owner told
 *
 * Every refusal goes back to the invite page, which reads the invite again
 * and says what is wrong in its own words, with the next step.
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
  /* Only this page's own button: a form on another site is refused before anything is read. */
  const origin = req.headers.get("origin")
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Open the invite from your email." }, { status: 403 })
  const form = await req.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")
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
  const res = NextResponse.redirect(new URL(`${out.home}?joined=1`, req.url), 303)
  res.cookies.set(TEAM_STORE_COOKIE, out.creatorId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 })
  return res
}
