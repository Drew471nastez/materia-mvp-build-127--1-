import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { deleteMessage, editMessage } from "@/lib/communities/server/chat"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; messageId: string }> }

/** PATCH { body }: the author edits their message. */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, messageId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("chat"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.chat })
  if (limited) return limited
  const result = await editMessage({ db, community: gate.community, viewer: gate.viewer }, messageId, await readJson(request))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ message: result.value }, { headers: NO_STORE })
}

/**
 * DELETE { reason? }: the author deletes their message, or a moderator
 * (moderate_content) removes it, written to the audit log. Either way the
 * body is blanked in the same update.
 */
export async function DELETE(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, messageId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("chat"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.chat })
  if (limited) return limited
  const body = await readJson(request)
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null
  const result = await deleteMessage({ db, community: gate.community, viewer: gate.viewer }, messageId, reason)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
