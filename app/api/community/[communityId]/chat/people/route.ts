import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit, ok } from "@/lib/communities/server/chat-routes"
import { searchPeople, suggestPeople } from "@/lib/communities/server/chat-people"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET ?q=: { people } for New message (round 39). With no q, the Suggested
 * list (the team, the people the member deals with, the top and the recently
 * here, only people they may write to); with q, active members by name or
 * @handle, blocked people left out either way, anybody the rules refuse
 * greyed with the reason. A member only; a search is rate limited.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const q = new URL(request.url).searchParams.get("q") ?? ""
  if (!q.trim()) return ok({ people: await suggestPeople(db, gate.community, gate.viewer) })
  const limited = await chatLimit(gate, "chatPeople")
  if (limited) return limited
  return ok({ people: await searchPeople(db, gate.community, gate.viewer, q) })
}
