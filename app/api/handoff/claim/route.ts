import { NextResponse } from "next/server"
import { LIMITS, addressSubject } from "@/lib/api/rate-limit"
import { handoffDeps } from "@/lib/handoff/deps"
import { acceptClaim, metaOf } from "@/lib/handoff/server"
import { claimPath, tokenShapeOk } from "@/lib/handoff/rules"
import { fromOwnPage } from "@/lib/team/own-page"
import { requestUserUnavailable } from "@/lib/businesses/server"

/**
 * ===========================================================================
 *  ACCEPT, ON A CLAIM LINK (app/(storelib)/team/claim/[token])
 * ===========================================================================
 * A plain form post from the claim page, so it works before any script has
 * loaded. Opening the link changes nothing; only a press on Storelib's own
 * page does (lib/team/own-page.ts), so an email scanner that opens every
 * link accepts nothing.
 *
 * Signed in, rate limited per account and per address, then lib/handoff/
 * server acceptClaim: every check, then the one transaction. Whatever
 * happens, the browser goes back to the claim page, which reads the link
 * again and says in its own words what happened (`note` names a refusal the
 * page cannot see for itself). Never JSON: whatever a form post answers is
 * what the browser shows.
 */
export const dynamic = "force-dynamic"

function back(request: Request, token: string, note?: string): NextResponse {
  const to = new URL(tokenShapeOk(token) ? claimPath(token) : "/team/claim/invalid", request.url)
  if (note) to.searchParams.set("note", note)
  const res = NextResponse.redirect(to, 303)
  res.headers.set("Cache-Control", "private, no-store")
  return res
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")
  if (!fromOwnPage(request.headers, request.url)) return back(request, token, "again")
  const deps = handoffDeps()
  const user = await deps.requestUser(request)
  /* Auth could not say who pressed: back to the link with "Try again", never to sign in (round rel2-auth). */
  if (!user) return back(request, token, requestUserUnavailable(request) ? "failed" : undefined)
  const limited = await deps.rateLimit({
    bucket: "handoff-claim",
    subjects: [`user:${user.id}`, addressSubject(request)],
    windows: LIMITS.claim,
    message: "Too many tries.",
  })
  if (limited) return back(request, token, "slow")
  const out = await acceptClaim(deps, token, user, metaOf(request))
  /* A link somebody else already used is refused as "used": "accepted" is only ever this press's own success (the page opens the business on it). */
  if (out.ok === false) return back(request, token, out.code === "failed" || out.code === "not_set_up" || out.status >= 500 ? "failed" : out.code === "accepted" ? "used" : out.code)
  return back(request, token, "accepted")
}
