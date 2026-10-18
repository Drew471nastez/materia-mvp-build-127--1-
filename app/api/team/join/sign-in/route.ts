import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readInvite } from "@/lib/team/server"
import { tokenShapeOk } from "@/lib/team/invite-state"
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_SECONDS, invitePath, inviteSignInPath } from "@/lib/team/invite-links"

/**
 * GET /api/team/join/sign-in?token=<invite>&to=login|signup
 *
 * Log in to accept, and Create account to accept, on the invite page. Keeps
 * the invite in a short lived httpOnly cookie (lib/team/invite-links.ts says
 * why), then opens sign in with the invited email filled in and the invite
 * as `next`. Changes nothing about the invite itself; a made up token is
 * not kept.
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token") ?? ""
  const to = url.searchParams.get("to") === "signup" ? "signup" : "login"
  if (!tokenShapeOk(token)) return NextResponse.redirect(new URL("/team/join", url.origin), 303)

  const read = await readInvite(createAdminClient(), token, null).catch(() => null)
  const state = read && read.ok ? read.state : null
  const target =
    state && state.kind === "signed_out"
      ? inviteSignInPath({ token, email: state.email, hasAccount: to === "login" })
      : state
        ? invitePath(token)
        : `/${to}?next=${encodeURIComponent(invitePath(token))}`
  const res = NextResponse.redirect(new URL(target, url.origin), 303)
  if (!state || state.kind === "signed_out") {
    res.cookies.set(INVITE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: INVITE_COOKIE_MAX_AGE_SECONDS })
  }
  res.headers.set("Cache-Control", "private, no-store")
  res.headers.set("Referrer-Policy", "no-referrer")
  return res
}
