import { NextResponse } from "next/server"
import { chatRoute, notFound, ok, refusal } from "@/lib/communities/server/chat-routes"
import { readJson } from "@/lib/communities/server/feed"
import { deleteGroupMessage, editGroupMessage, groupOf } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; groupId: string; messageId: string }> }

/** PATCH { body }: the author edits their message. */
export async function PATCH(request: Request, { params }: Params) {
  const { communityId, groupId, messageId } = await params
  const r = await chatRoute(communityId, "chat", "dmTouch")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await editGroupMessage(r.db, r.gate.community, r.gate.viewer, opened, messageId, await readJson(request))
  return done.ok ? ok({ message: done.value }) : refusal(done)
}

/** DELETE: the author deletes it, or the group's owner or the community's team removes it. */
export async function DELETE(_request: Request, { params }: Params) {
  const { communityId, groupId, messageId } = await params
  const r = await chatRoute(communityId, "view", "dmTouch")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await deleteGroupMessage(r.db, r.gate.community, r.gate.viewer, opened, messageId)
  return done.ok ? ok({ ok: true }) : refusal(done)
}
