import { NextResponse } from "next/server"
import { handoffDeps } from "@/lib/handoff/deps"
import { readClaim } from "@/lib/handoff/server"
import { CLAIM_COOKIE, CLAIM_COOKIE_MAX_AGE_SECONDS, claimPath, claimSignInPath, tokenShapeOk } from "@/lib/handoff/rules"

/**
 * GET /api/handoff/claim/sign-in?token=<claim>&to=login|signup
 *
 * Create account and Log in on a claim link. Keeps the link in a short lived
 * httpOnly cookie (lib/handoff/rules CLAIM_COOKIE says why), then opens sign
 * in with the email the link was sent to filled in and the claim as `next`.
 * Changes nothing about the link itself; a made up token is not kept.
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token") ?? ""
  const signup = url.searchParams.get("to") === "signup"
  if (!tokenShapeOk(token)) return NextResponse.redirect(new URL(signup ? "/signup" : "/login", url.origin), 303)
  const read = await readClaim(handoffDeps(), token, null).catch(() => null)
  const state = read && read.ok ? read.state : null
  const email = state?.kind === "signed_out" ? state.email : null
  const target = !state || state.kind === "signed_out" ? claimSignInPath(token, { signup, email }) : claimPath(token)
  const res = NextResponse.redirect(new URL(target, url.origin), 303)
  if (!state || state.kind === "signed_out") {
    res.cookies.set(CLAIM_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: CLAIM_COOKIE_MAX_AGE_SECONDS })
  }
  res.headers.set("Cache-Control", "private, no-store")
  res.headers.set("Referrer-Policy", "no-referrer")
  return res
}
