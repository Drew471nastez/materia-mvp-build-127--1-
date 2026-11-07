import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { claimPath, claimSignInPath, handoffEmail, tokenShapeOk } from "@/lib/handoff/rules"
import { fromOwnPage } from "@/lib/team/own-page"

/**
 * Switch account, on a claim link sent to another email: sign this browser
 * out, then Log in with the email the link names, coming straight back to
 * the claim. POST only, from Storelib's own page, as the team invite's
 * Switch account (app/api/team/join/switch): a link or another site's form
 * signs nobody out. The browser side clears the app's device store first
 * (components/handoff/claim-actions).
 */
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")
  const email = handoffEmail(form?.get("email"))
  const target = tokenShapeOk(token) ? claimSignInPath(token, { signup: false, email }) : "/login"
  if (!fromOwnPage(request.headers, request.url)) {
    const to = new URL(tokenShapeOk(token) ? claimPath(token) : "/login", request.url)
    to.searchParams.set("note", "again")
    return NextResponse.redirect(to, 303)
  }
  try {
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: "local" })
  } catch {
    /* Already signed out, or Supabase is away: the cookies still go below. */
  }
  const res = NextResponse.redirect(new URL(target, request.url), 303)
  try {
    const jar = await cookies()
    for (const c of jar.getAll()) if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 })
  } catch {
    /* no cookie store outside a request */
  }
  res.headers.set("Cache-Control", "private, no-store")
  return res
}
