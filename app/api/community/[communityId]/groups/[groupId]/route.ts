import { NextResponse } from "next/server"
import { chatRoute, notFound, ok, refusal } from "@/lib/communities/server/chat-routes"
import { readJson } from "@/lib/communities/server/feed"
import { groupDetail, groupOf, leaveGroup, listGroupMessages, sendGroupMessage, updateGroup } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; groupId: string }> }

/** GET ?before=<iso> | ?after=<iso> [&detail=1]: { messages (oldest first), hasMore, group? }. Only a group the viewer is in. */
export async function GET(request: Request, { params }: Params) {
  const { communityId, groupId } = await params
  const r = await chatRoute(communityId, "view")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  const sp = new URL(request.url).searchParams
  const [page, group] = await Promise.all([listGroupMessages(r.db, opened, r.gate.viewer, { before: sp.get("before"), after: sp.get("after") }), sp.get("detail") ? groupDetail(r.db, r.gate.community, r.gate.viewer, opened) : Promise.resolve(undefined)])
  return ok({ ...page, ...(group ? { group } : {}) })
}

/** POST { body, attachments?, replyToId?, clientId? }: { message }. As fast as a conversation: 30 a minute, 500 a day. */
export async function POST(request: Request, { params }: Params) {
  const { communityId, groupId } = await params
  const r = await chatRoute(communityId, "chat", "dm")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  const sent = await sendGroupMessage(r.db, r.gate.community, r.gate.viewer, opened, await readJson(request))
  return sent.ok ? ok({ message: sent.value }, 201) : refusal(sent)
}

/** PATCH { name? , add?: userIds, remove?: userId }: the group's owner or the community's team. */
export async function PATCH(request: Request, { params }: Params) {
  const { communityId, groupId } = await params
  const r = await chatRoute(communityId, "chat", "groupChange")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await updateGroup(r.db, r.gate.community, r.gate.viewer, opened, await readJson(request))
  if (!done.ok) return refusal(done)
  const again = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  return ok({ group: again ? await groupDetail(r.db, r.gate.community, r.gate.viewer, again) : null })
}

/** DELETE: the viewer leaves the group. */
export async function DELETE(_request: Request, { params }: Params) {
  const { communityId, groupId } = await params
  const r = await chatRoute(communityId, "view", "groupChange")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await leaveGroup(r.db, r.gate.community, r.gate.viewer, opened)
  return done.ok ? ok({ ok: true }) : refusal(done)
}
