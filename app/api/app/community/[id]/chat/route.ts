import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { manageLimit } from "@/lib/communities/server/creator"
import { can } from "@/lib/communities/permissions"
import { SLOW_MODE_CHOICES } from "@/lib/communities/chat-rules"
import { audit } from "@/lib/communities/server/audit"
import { chatRestricted, loadChatSettings, saveChatSettings, setChatRestriction } from "@/lib/communities/server/chat-settings"
import { authorViews } from "@/lib/communities/server/directory"
import { missing } from "@/lib/communities/server/db"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * THE COMMUNITY'S CHAT, FOR ITS ADMINS (round 37, Settings > Chat).
 *
 * GET   -> { ready, chatEnabled, settings, channels: [{ id, name, slug, slowMode }], restricted: [...], canEdit, canModerate }
 *          The owner, admins and moderators (a moderator sees who is kept out of chat and why).
 * PATCH { dmPolicy?, groupsPolicy?, attachmentsEnabled?, pushPreviews?, rules? } -> { settings }. manage_settings.
 * POST  { action: "slow_mode", spaceId, seconds }      a channel's slow mode. manage_spaces.
 *       { action: "restrict", userId, mode: "mute" | "ban" | "clear", minutes?, reason? }
 *                                                     keep a member out of chat, or let them back. mute (and ban for a ban).
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const [settings, spaces, restricted] = await Promise.all([
    loadChatSettings(db, gate.community.id),
    db.from("community_spaces").select("id, name, slug, slow_mode_seconds, archived_at, position").eq("community_id", gate.community.id).eq("kind", "chat").is("archived_at", null).order("position", { ascending: true }),
    chatRestricted(db, gate.community.id),
  ])
  let channels = (spaces.data as { id: string; name: string; slug: string; slow_mode_seconds?: number }[] | null) ?? []
  if (spaces.error && missing(spaces.error)) {
    const plain = await db.from("community_spaces").select("id, name, slug, position").eq("community_id", gate.community.id).eq("kind", "chat").is("archived_at", null).order("position", { ascending: true })
    channels = (plain.data as typeof channels | null) ?? []
  }
  const people = await authorViews(db, gate.community.id, restricted.map((r) => r.userId))
  return NextResponse.json(
    {
      ready: settings.ready,
      chatEnabled: gate.community.chat_enabled,
      settings: { dmPolicy: settings.dmPolicy, groupsPolicy: settings.groupsPolicy, attachmentsEnabled: settings.attachmentsEnabled, pushPreviews: settings.pushPreviews, rules: settings.rules, rulesVersion: settings.rulesVersion },
      channels: channels.map((c) => ({ id: c.id, name: c.name, slug: c.slug, slowMode: c.slow_mode_seconds ?? 0 })),
      restricted: restricted.map((r) => ({ ...r, name: people.get(r.userId)?.name ?? "Member", avatarUrl: people.get(r.userId)?.avatarUrl ?? null })),
      canEdit: can(gate.role, "manage_settings", gate.viewer.perms),
      canModerate: can(gate.role, "mute", gate.viewer.perms),
    },
    { headers: noStore },
  )
}

export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const saved = await saveChatSettings(gate.ctx.admin, gate.community.id, gate.ctx.userId, await readJson(request))
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status, headers: noStore })
  return NextResponse.json({ settings: saved.value }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const body = await readJson(request)
  if (body.action === "slow_mode") {
    const gate = await requireCreatorCommunity(id, "manage_spaces")
    if (gate instanceof NextResponse) return gate
    const limited = await manageLimit(gate.ctx.userId)
    if (limited) return limited
    const seconds = Number(body.seconds)
    if (!(SLOW_MODE_CHOICES as readonly number[]).includes(seconds)) return NextResponse.json({ error: "Pick a slow mode." }, { status: 400, headers: noStore })
    if (typeof body.spaceId !== "string") return NextResponse.json({ error: "That channel is gone." }, { status: 404, headers: noStore })
    const { data, error } = await gate.ctx.admin.from("community_spaces").update({ slow_mode_seconds: seconds }).eq("id", body.spaceId).eq("community_id", gate.community.id).eq("kind", "chat").select("id, name").maybeSingle()
    if (error) return NextResponse.json({ error: missing(error) ? "Slow mode for a channel needs the database update (part 270)." : "That did not save. Try again." }, { status: missing(error) ? 503 : 500, headers: noStore })
    if (!data) return NextResponse.json({ error: "That channel is gone." }, { status: 404, headers: noStore })
    await audit(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, actorKind: "member", action: "space.slow_mode", targetType: "space", targetId: body.spaceId, targetLabel: (data as { name: string }).name, detail: { seconds } })
    return NextResponse.json({ spaceId: body.spaceId, slowMode: seconds }, { headers: noStore })
  }
  if (body.action === "restrict") {
    const gate = await requireCreatorCommunity(id, body.mode === "ban" ? "ban" : "mute")
    if (gate instanceof NextResponse) return gate
    const limited = await manageLimit(gate.ctx.userId)
    if (limited) return limited
    const done = await setChatRestriction(gate.ctx.admin, gate.community, { userId: gate.ctx.userId, role: gate.role }, body.userId, { action: body.mode, minutes: body.minutes, reason: body.reason })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ userId: body.userId, ...done.value }, { headers: noStore })
  }
  return NextResponse.json({ error: "Nothing to change." }, { status: 400, headers: noStore })
}
