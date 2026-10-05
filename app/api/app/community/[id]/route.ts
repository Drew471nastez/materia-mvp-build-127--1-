import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit, setPublished, updateMyNotify, updateSettings } from "@/lib/communities/server/creator"
import { savePolicies } from "@/lib/communities/server/creator-policies"
import { saveRolePermissions } from "@/lib/communities/server/creator-roles"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET   /api/app/community/<id>  -> { community } (its settings, for the owner, admins and moderators).
 * PATCH /api/app/community/<id>  { publish?: boolean } publishes or takes it back to a draft;
 *       { notify: { level, emailAnnouncements, emailEvents } } saves the caller's own notifications;
 *       anything else is settings (name, tagline, description, slug, logoUrl, coverUrl, category,
 *       rules, faq, benefits, links, onboarding, the on/off switches, seo, visibility, type), each
 *       checked against the permission it needs (who may join is the owner's: manage_pricing).
 *       { roles: { admin: {group: bool}, moderator: {group: bool} } } what admins and moderators may
 *       do (owner only, run-now part 100; 503 needs_update before it has run);
 *       { policies: { refundPolicy?, contactEmail?, contactEmailPublic? } } the refund policy and how
 *       members reach the owner (owner only, worker M's run-now part 101).
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ community: gate.community, role: gate.role }, { headers: noStore })
}

export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const body = await readJson(request)
  const action = body.publish !== undefined ? "manage_settings" : body.notify !== undefined ? "view" : "manage_settings"
  const gate = await requireCreatorCommunity(id, action)
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const db = gate.ctx.admin
  if (body.publish !== undefined) {
    if (typeof body.publish !== "boolean") return NextResponse.json({ error: "publish is true or false" }, { status: 400, headers: noStore })
    const done = await setPublished(db, { community: gate.community, actorId: gate.ctx.userId, publish: body.publish })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ status: done.community.status }, { headers: noStore })
  }
  if (body.roles !== undefined) {
    const done = await saveRolePermissions(db, { communityId: gate.community.id, communityName: gate.community.name, actorId: gate.ctx.userId, role: gate.role, body: body.roles })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true, roles: done.roles }, { headers: noStore })
  }
  if (body.policies !== undefined) {
    const done = await savePolicies(db, { community: gate.community, role: gate.role, actorId: gate.ctx.userId, body: body.policies })
    if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true, policies: done.policies }, { headers: noStore })
  }
  if (body.notify !== undefined) {
    const notify = body.notify && typeof body.notify === "object" ? (body.notify as Record<string, unknown>) : {}
    const done = await updateMyNotify(db, { communityId: gate.community.id, userId: gate.ctx.userId, body: notify })
    if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }
  const done = await updateSettings(db, { community: gate.community, role: gate.role, perms: gate.viewer.perms, actorId: gate.ctx.userId, creatorId: gate.ctx.creatorId, body })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true, slug: done.community.slug, status: done.community.status }, { headers: noStore })
}
