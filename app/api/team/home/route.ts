import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { hasSellerAccess, readSellerAccess } from "@/lib/account/seller-access"
import { TEAM_STORE_COOKIE, memberRowsOf } from "@/lib/team/server"
import { UUID, safeAppNext, teamHomeDecision } from "@/lib/team/landing"

export const dynamic = "force-dynamic"

/**
 * GET ?next=/app/...&store=<id>: back into the team store this account
 * works in, then the dashboard page it was opening (lib/team/landing).
 *
 * The dashboard sends a member here when the cookie naming their store is
 * missing (another device, the app, Back to my account), and /sell's Not now
 * does too, so neither ends on seller onboarding. Only a store this account
 * is an active member of is ever set, and only for an account with no
 * dashboard of its own: an owner is sent on to the page untouched. Every page
 * still asks the database again whether the member may work there, and as
 * what (lib/team/server actingStore). `next` is only ever an /app path.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const wantedRaw = url.searchParams.get("store")
  const wanted = wantedRaw && UUID.test(wantedRaw) ? wantedRaw : null
  const user = await requestUser(req)
  const db = createAdminClient()
  const [access, rows] = user ? await Promise.all([readSellerAccess(db as never, user.id), memberRowsOf(db, user.id).catch(() => [])]) : [null, []]
  let cookie: string | null = null
  try {
    cookie = (await cookies()).get(TEAM_STORE_COOKIE)?.value ?? null
  } catch {
    cookie = null
  }
  const decision = teamHomeDecision({ signedIn: !!user, ownAccess: hasSellerAccess(access), rows, wanted, cookie, next: url.searchParams.get("next") ?? "/app" })
  const to = (path: string) => new URL(path, url.origin)
  if (decision.kind === "login") return NextResponse.redirect(to(`/login?next=${encodeURIComponent(safeAppNext(url.searchParams.get("next")))}`), 303)
  if (decision.kind === "sell") return NextResponse.redirect(to("/sell"), 303)
  if (decision.kind === "go") return NextResponse.redirect(to(decision.to), 303)
  const res = NextResponse.redirect(to(decision.to), 303)
  res.cookies.set(TEAM_STORE_COOKIE, decision.store, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 })
  res.headers.set("cache-control", "no-store")
  return res
}
