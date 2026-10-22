import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit, notFound, ok, refusal } from "@/lib/communities/server/chat-routes"
import { groupDetail, groupOf, leaveGroup, listGroupMessages, sendGroupMessage, updateGroup } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; groupId: string }> }

/** GET ?before=<iso> | ?after=<iso> [&detail=1]: { messages (oldest first), hasMore, group? }. Only a group the viewer is in. */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  const sp = new URL(request.url).searchParams
  const [page, group] = await Promise.all([listGroupMessages(db, opened, gate.viewer, { before: sp.get("before"), after: sp.get("after") }), sp.get("detail") ? groupDetail(db, gate.community, gate.viewer, opened) : Promise.resolve(undefined)])
  return ok({ ...page, ...(group ? { group } : {}) })
}

/** POST { body, attachments?, replyToId?, clientId? }: { message }. As fast as a conversation: 30 a minute, 500 a day. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "dm")
  if (limited) return limited
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  const sent = await sendGroupMessage(db, gate.community, gate.viewer, opened, await readJson(request))
  return sent.ok ? ok({ message: sent.value }, 201) : refusal(sent)
}

/** PATCH { name? , add?: userIds, remove?: userId }: the group's owner or the community's team. */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "groupChange")
  if (limited) return limited
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await updateGroup(db, gate.community, gate.viewer, opened, await readJson(request))
  if (!done.ok) return refusal(done)
  const again = await groupOf(db, gate.community, gate.viewer, groupId)
  return ok({ group: again ? await groupDetail(db, gate.community, gate.viewer, again) : null })
}

/** DELETE: the viewer leaves the group. */
export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "groupChange")
  if (limited) return limited
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await leaveGroup(db, gate.community, gate.viewer, opened)
  return done.ok ? ok({ ok: true }) : refusal(done)
}
