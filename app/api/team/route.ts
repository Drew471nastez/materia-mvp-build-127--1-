import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser, signedOutAnswer } from "@/lib/businesses/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isProPlan } from "@/lib/home/progress"
import { seatLimit } from "@/lib/team/roles"
import { OPEN_TO_TEAM } from "@/lib/team/permissions"
import { actingStore, inviteMember, listTeam, storesOf, teamScope, type TeamMemberRow } from "@/lib/team/server"

/**
 * GET  /api/team   the team this account manages (its own store's, or the
 *                  store it works in when it was given Team), the stores it
 *                  is on, and which it is working in
 * POST /api/team   { email, permissions }: invite someone to that team
 *
 * Nothing in the request names a store: the owner manages their own, and a
 * member the store they work in, only when their permissions include Team
 * and only up to their own access (lib/team/server teamScope).
 */
export async function GET(req: Request) {
  const user = await requestUser(req)
  if (!user) return signedOutAnswer(req, NextResponse.json({ error: "Sign in again." }, { status: 401 }))
  const db = createAdminClient()
  const [scoped, stores, acting, { data: me }] = await Promise.all([
    teamScope(db, user.id),
    storesOf(db, user.id),
    actingStore(db, user.id),
    db.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
  ])
  let team: { members: unknown[]; limit: number; byOwner: boolean; grant: string[]; self: string | null; open: string[] } | null = null
  let ready = true
  if (scoped.ok) {
    const { store, byOwner, grant, selfMemberId } = scoped.scope
    const listed = await listTeam(db, store.id)
    if (listed.ok) team = { members: await withPeople(db, listed.members), limit: seatLimit(isProPlan(store.subscription_plan_id)), byOwner, grant, self: selfMemberId, open: [...OPEN_TO_TEAM] }
    else if (listed.missing) ready = false
    else return NextResponse.json({ error: listed.error }, { status: 500 })
  }
  const self = (me ?? {}) as { display_name?: string | null; avatar_url?: string | null }
  return NextResponse.json(
    { ready, team, stores, acting, me: { name: self.display_name?.trim() || null, avatarUrl: self.avatar_url || null, email: user.email } },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}

export async function POST(req: Request) {
  const user = await requestUser(req)
  if (!user) return signedOutAnswer(req, NextResponse.json({ error: "Sign in again." }, { status: 401 }))
  const limited = await rateLimit({ bucket: "team-invite", subjects: [`user:${user.id}`], windows: LIMITS.teamInvite, message: "Too many invites in a short time. Wait a few minutes and try again." })
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as { email?: unknown; permissions?: unknown; role?: unknown } | null
  const out = await inviteMember(createAdminClient(), { owner: user, email: body?.email, permissions: body?.permissions, role: body?.role })
  if (out.ok === false) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ member: out.member, emailed: out.emailed })
}

/** Each member who has joined, with their name and photo from their profile, so the list shows people, not only addresses. */
async function withPeople(db: ReturnType<typeof createAdminClient>, members: TeamMemberRow[]) {
  const ids = members.map((m) => m.user_id).filter((v): v is string => !!v)
  if (ids.length === 0) return members.map((m) => ({ ...m, name: null, avatar_url: null }))
  const { data } = await db.from("profiles").select("id, display_name, avatar_url").in("id", ids)
  const byId = new Map(((data ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]))
  return members.map((m) => {
    const p = m.user_id ? byId.get(m.user_id) : undefined
    return { ...m, name: p?.display_name?.trim() || null, avatar_url: p?.avatar_url || null }
  })
}
