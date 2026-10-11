import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { TEAM_STORE_COOKIE, acceptInvite } from "@/lib/team/server"

/** POST { token }: accept an invite, signed in with the email it was sent to. Opens that store straight away. */
export async function POST(req: Request) {
  const user = await requestUser(req)
  if (!user) return NextResponse.json({ error: "Sign in to accept the invite." }, { status: 401 })
  const limited = await rateLimit({ bucket: "team-accept", subjects: [`user:${user.id}`], windows: LIMITS.claim, message: "Too many tries. Wait a few minutes and open the link again." })
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null
  const out = await acceptInvite(createAdminClient(), body?.token, user)
  if (out.ok === false) return NextResponse.json({ error: out.error }, { status: out.status })
  const res = NextResponse.json({ ok: true, role: out.role })
  res.cookies.set(TEAM_STORE_COOKIE, out.creatorId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 })
  return res
}
