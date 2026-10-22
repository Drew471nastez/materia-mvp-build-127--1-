import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit, ok, refusal } from "@/lib/communities/server/chat-routes"
import { sharePostToChats, shareTargets } from "@/lib/communities/server/chat-people"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET: { ready, chats }, where a post may be sent: the member's latest conversations and groups, then the chat channels they may post in. */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  return ok(await shareTargets(db, gate.community, gate.viewer))
}

/**
 * POST { postId, note?, targets: [{ kind: "person" | "dm" | "group" | "space", id }], clientId? }:
 * { results }, one per chat. The post must be one the sender may see; each
 * chat's own send decides the rest. Sending to a person may start a
 * conversation, so it counts as one opened from Message too (dmOpen).
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "chatShare")
  if (limited) return limited
  const body = await readJson(request)
  if (Array.isArray(body.targets) && body.targets.some((t) => (t as { kind?: unknown } | null)?.kind === "person")) {
    const opening = await chatLimit(gate, "dmOpen")
    if (opening) return opening
  }
  const done = await sharePostToChats(db, gate.community, gate.viewer, body)
  return done.ok ? ok(done.value, 201) : refusal(done)
}
