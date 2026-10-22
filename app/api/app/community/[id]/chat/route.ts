import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { manageLimit } from "@/lib/communities/server/creator"
import { can } from "@/lib/communities/permissions"
import { SLOW_MODE_CHOICES, channelPostColumns, channelPostOf } from "@/lib/communities/chat-rules"
import { pinnedLine } from "@/lib/communities/server/chat"
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
 * GET   -> { ready, ready272, chatEnabled, settings, channels: [{ id, name, slug, slowMode, post, minLevel, pinned }], restricted: [...], canEdit, canModerate }
 *          The owner, admins and moderators (a moderator sees who is kept out of chat and why).
 *          ?recent=<channel id> -> { messages: [{ id, authorName, text, createdAt }] }, the channel's last 20, to pick one to pin.
 * PATCH { dmPolicy?, dmMinLevel?, dmMinDays?, dmToStaff?, groupsPolicy?, attachmentsEnabled?, pushPreviews?, rules?, chatTab?, mainSpaceId? } -> { settings }. manage_settings.
 * POST  { action: "slow_mode", spaceId, seconds }      a channel's slow mode. manage_spaces.
 *       { action: "channel_post", spaceId, post: "everyone" | "level" | "team", minLevel? }
 *                                                     who can post in a channel (round 38). manage_spaces.
 *       { action: "pin", spaceId, messageId | null }  a channel's pinned message (round 38). manage_spaces.
 *       { action: "restrict", userId, mode: "mute" | "ban" | "clear", minutes?, reason? }
 *                                                     keep a member out of chat, or let them back. mute (and ban for a ban).
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  /* Round 38: a channel's last messages, to pick the one to pin. */
  const recent = new URL(request.url).searchParams.get("recent")
  if (recent) {
    const { data } = await db.from("community_messages").select("id, author_id, body, created_at").eq("community_id", gate.community.id).eq("space_id", recent).eq("status", "published").order("created_at", { ascending: false }).limit(20)
    const rows = (data as { id: string; author_id: string | null; body: string; created_at: string }[] | null) ?? []
    const people = await authorViews(db, gate.community.id, rows.map((r) => r.author_id))
    return NextResponse.json({ messages: rows.map((r) => ({ id: r.id, authorName: r.author_id ? (people.get(r.author_id)?.name ?? "Member") : "Former member", text: r.body.replace(/\s+/g, " ").trim().slice(0, 140) || "Picture or file", createdAt: r.created_at })) }, { headers: noStore })
  }
  const [settings, spaces, restricted] = await Promise.all([
    loadChatSettings(db, gate.community.id),
    db.from("community_spaces").select("id, name, slug, slow_mode_seconds, post_role, post_min_level, pinned_message_id, archived_at, position").eq("community_id", gate.community.id).eq("kind", "chat").is("archived_at", null).order("position", { ascending: true }),
    chatRestricted(db, gate.community.id),
  ])
  let channels = (spaces.data as { id: string; name: string; slug: string; slow_mode_seconds?: number; post_role?: string; post_min_level?: number; pinned_message_id?: string | null }[] | null) ?? []
  if (spaces.error && missing(spaces.error)) {
    let plain = await db.from("community_spaces").select("id, name, slug, slow_mode_seconds, post_role, position").eq("community_id", gate.community.id).eq("kind", "chat").is("archived_at", null).order("position", { ascending: true })
    if (plain.error && missing(plain.error)) plain = await db.from("community_spaces").select("id, name, slug, post_role, position").eq("community_id", gate.community.id).eq("kind", "chat").is("archived_at", null).order("position", { ascending: true })
    channels = (plain.data as typeof channels | null) ?? []
  }
  const pins = await Promise.all(channels.map((c) => pinnedLine(db, gate.community.id, c.id, c.pinned_message_id ?? null)))
  const people = await authorViews(db, gate.community.id, restricted.map((r) => r.userId))
  return NextResponse.json(
    {
      ready: settings.ready,
      ready272: !!settings.ready272,
      chatEnabled: gate.community.chat_enabled,
      settings: {
        dmPolicy: settings.dmPolicy,
        dmMinLevel: settings.dmMinLevel,
        dmMinDays: settings.dmMinDays,
        dmToStaff: settings.dmToStaff,
        groupsPolicy: settings.groupsPolicy,
        attachmentsEnabled: settings.attachmentsEnabled,
        pushPreviews: settings.pushPreviews,
        rules: settings.rules,
        rulesVersion: settings.rulesVersion,
        chatTab: settings.chatTab,
        mainSpaceId: settings.mainSpaceId,
      },
      channels: channels.map((c, i) => ({ id: c.id, name: c.name, slug: c.slug, slowMode: c.slow_mode_seconds ?? 0, ...channelPostOf(c.post_role, c.post_min_level), pinned: pins[i] })),
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
  if (body.action === "channel_post" || body.action === "pin") {
    const gate = await requireCreatorCommunity(id, "manage_spaces")
    if (gate instanceof NextResponse) return gate
    const limited = await manageLimit(gate.ctx.userId)
    if (limited) return limited
    if (typeof body.spaceId !== "string") return NextResponse.json({ error: "That channel is gone." }, { status: 404, headers: noStore })
    let patch: Record<string, unknown>
    if (body.action === "channel_post") {
      const cols = channelPostColumns({ post: body.post, minLevel: body.minLevel })
      if ("error" in cols) return NextResponse.json({ error: cols.error }, { status: 400, headers: noStore })
      patch = cols.columns
    } else {
      const messageId = typeof body.messageId === "string" ? body.messageId : null
      if (messageId) {
        const { data: m } = await gate.ctx.admin.from("community_messages").select("id, status").eq("id", messageId).eq("space_id", body.spaceId).eq("community_id", gate.community.id).maybeSingle()
        if (!m || (m as { status: string }).status !== "published") return NextResponse.json({ error: "That message is gone." }, { status: 404, headers: noStore })
      }
      patch = { pinned_message_id: messageId, pinned_at: messageId ? new Date().toISOString() : null, pinned_by: messageId ? gate.ctx.userId : null }
    }
    const { data, error } = await gate.ctx.admin.from("community_spaces").update(patch).eq("id", body.spaceId).eq("community_id", gate.community.id).eq("kind", "chat").select("id, name").maybeSingle()
    if (error) return NextResponse.json({ error: missing(error) ? "This needs the database update for chat (part 272)." : "That did not save. Try again." }, { status: missing(error) ? 503 : 500, headers: noStore })
    if (!data) return NextResponse.json({ error: "That channel is gone." }, { status: 404, headers: noStore })
    await audit(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, actorKind: "member", action: body.action === "pin" ? "space.pinned_message" : "space.post_rule", targetType: "space", targetId: body.spaceId, targetLabel: (data as { name: string }).name, detail: patch })
    const pinned = body.action === "pin" ? await pinnedLine(gate.ctx.admin, gate.community.id, body.spaceId, (patch.pinned_message_id as string | null) ?? null) : undefined
    return NextResponse.json({ spaceId: body.spaceId, ...(body.action === "pin" ? { pinned } : channelPostOf(patch.post_role as string, patch.post_min_level)) }, { headers: noStore })
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
