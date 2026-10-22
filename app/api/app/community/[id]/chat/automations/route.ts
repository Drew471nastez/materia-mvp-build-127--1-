import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { manageLimit } from "@/lib/communities/server/creator"
import { can } from "@/lib/communities/permissions"
import { automationInput, renderAutomation } from "@/lib/communities/chat-automations"
import { audienceCount, automationSenders, changeAutomation, createAutomation, listAutomations, runChatAutomations, updateAutomation } from "@/lib/communities/server/chat-automations"
import { authorViews } from "@/lib/communities/server/directory"
import { pushSoon } from "@/lib/notifications/push-bridge"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * THE COMMUNITY'S AUTOMATED MESSAGES, FOR ITS ADMINS (round 38, Settings > Automated messages, part 272).
 *
 * GET   -> { ready, automations, senders, channels, tiers, canEdit }. The team (view).
 * POST  { action: "create", ...input }               a new one; a broadcast for now starts sending after the response.
 *       { action: "update", id, ...input }           what it says, who sends it, its level, days or time.
 *       { action: "pause" | "resume" | "delete", id }
 *       { action: "preview", ...input }              -> { text, audience }: the words as one member reads them, and how many
 *                                                    a broadcast reaches now. Nothing is saved or sent.
 *       Every action needs manage_settings and is rate limited (manageLimit).
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const [list, senders, spaces, tiers] = await Promise.all([
    listAutomations(db, gate.community.id),
    automationSenders(db, gate.community),
    db.from("community_spaces").select("id, name, slug, position").eq("community_id", gate.community.id).eq("kind", "chat").is("archived_at", null).order("position", { ascending: true }),
    db.from("community_tiers").select("id, name, position, archived_at").eq("community_id", gate.community.id).is("archived_at", null).order("position", { ascending: true }).limit(50),
  ])
  return NextResponse.json(
    {
      ready: list.ready,
      automations: list.automations,
      senders,
      channels: ((spaces.data as { id: string; name: string; slug: string }[] | null) ?? []).map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
      tiers: ((tiers.data as { id: string; name: string }[] | null) ?? []).map((t) => ({ id: t.id, name: t.name })),
      chatEnabled: gate.community.chat_enabled,
      canEdit: can(gate.role, "manage_settings", gate.viewer.perms),
    },
    { headers: noStore },
  )
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const db = gate.ctx.admin
  const body = await readJson(request)
  const fail = (r: { error: string; status: number }) => NextResponse.json({ error: r.error }, { status: r.status, headers: noStore })

  if (body.action === "preview") {
    const checked = automationInput({ name: "Preview", ...body }, Date.now())
    if ("error" in checked) return fail({ error: checked.error, status: 400 })
    const me = (await authorViews(db, gate.community.id, [gate.ctx.userId])).get(gate.ctx.userId)
    const text = renderAutomation(checked.value.body, { name: me?.name ?? "Ana Silva", community: gate.community.name, level: checked.value.triggerLevel ?? 2 })
    const audience = checked.value.trigger === "broadcast" && checked.value.target === "dm" ? await audienceCount(db, gate.community.id, checked.value.segment) : null
    return NextResponse.json({ text, audience }, { headers: noStore })
  }
  if (body.action === "create") {
    const made = await createAutomation(db, gate.community, gate.ctx.userId, body)
    if ("error" in made) return fail(made)
    /* A broadcast for now: its first members are queued and sent after the response; the cron carries the rest. */
    if (made.value.trigger === "broadcast" && (!made.value.sendAt || Date.parse(made.value.sendAt) <= Date.now() + 60_000)) {
      const communityId = gate.community.id
      await pushSoon(() => runChatAutomations(db, Date.now(), 10_000, communityId))
    }
    return NextResponse.json({ automation: made.value }, { status: 201, headers: noStore })
  }
  if (body.action === "update") {
    const saved = await updateAutomation(db, gate.community, gate.ctx.userId, body.id, body)
    if ("error" in saved) return fail(saved)
    return NextResponse.json({ automation: saved.value }, { headers: noStore })
  }
  if (body.action === "pause" || body.action === "resume" || body.action === "delete") {
    const done = await changeAutomation(db, gate.community, gate.ctx.userId, body.id, body.action)
    if ("error" in done) return fail(done)
    return NextResponse.json(done.value, { headers: noStore })
  }
  return fail({ error: "Nothing to change.", status: 400 })
}
