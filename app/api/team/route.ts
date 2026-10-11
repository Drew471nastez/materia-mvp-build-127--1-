import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isProPlan } from "@/lib/home/progress"
import { seatLimit } from "@/lib/team/roles"
import { actingStore, inviteMember, listTeam, ownStore, storesOf } from "@/lib/team/server"

/**
 * GET  /api/team   your store's team (if you own one), the stores you are on, and which you are working in
 * POST /api/team   { email, role }: invite someone to your store's team
 *
 * The owner is whoever's account the store is: nothing in the request names
 * a store (lib/team/server.ts).
 */
export async function GET(req: Request) {
  const user = await requestUser(req)
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 })
  const db = createAdminClient()
  const [store, stores, acting] = await Promise.all([ownStore(db, user.id), storesOf(db, user.id), actingStore(db, user.id)])
  let team: { members: unknown[]; limit: number } | null = null
  let ready = true
  if (store) {
    const listed = await listTeam(db, store.id)
    if (listed.ok) team = { members: listed.members, limit: seatLimit(isProPlan(store.subscription_plan_id)) }
    else if (listed.missing) ready = false
    else return NextResponse.json({ error: listed.error }, { status: 500 })
  }
  return NextResponse.json({ ready, team, stores, acting }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: Request) {
  const user = await requestUser(req)
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 })
  const limited = await rateLimit({ bucket: "team-invite", subjects: [`user:${user.id}`], windows: LIMITS.teamInvite, message: "Too many invites in a short time. Wait a few minutes and try again." })
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as { email?: unknown; role?: unknown } | null
  const out = await inviteMember(createAdminClient(), { owner: user, email: body?.email, role: body?.role })
  if (out.ok === false) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ member: out.member, emailed: out.emailed })
}
