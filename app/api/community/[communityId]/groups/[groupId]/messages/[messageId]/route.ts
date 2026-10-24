import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit, notFound, ok, refusal } from "@/lib/communities/server/chat-routes"
import { deleteGroupMessage, editGroupMessage, groupOf } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; groupId: string; messageId: string }> }

/** PATCH { body }: the author edits their message. */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId, messageId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "dmTouch")
  if (limited) return limited
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await editGroupMessage(db, gate.community, gate.viewer, opened, messageId, await readJson(request))
  return done.ok ? ok({ message: done.value }) : refusal(done)
}

/** DELETE: the author deletes it, or the group's owner or the community's team removes it. */
export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId, messageId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "dmTouch")
  if (limited) return limited
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  const done = await deleteGroupMessage(db, gate.community, gate.viewer, opened, messageId)
  return done.ok ? ok({ ok: true }) : refusal(done)
}
