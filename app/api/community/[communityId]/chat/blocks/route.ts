import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { iBlocked, setBlock } from "@/lib/communities/server/chat-settings"
import { chatLimit, ok, refusal } from "@/lib/communities/server/chat-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET ?userId=: { blocked } (whether the viewer blocked them). */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const other = new URL(request.url).searchParams.get("userId") ?? ""
  return ok({ blocked: await iBlocked(db, String(gate.viewer.userId), other) })
}

/** POST { userId, on }: the viewer blocks (or unblocks) a person. Blocked, neither can message the other or add the other to a group. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "chatPrefs")
  if (limited) return limited
  const body = await readJson(request)
  const done = await setBlock(db, String(gate.viewer.userId), body.userId, body.on !== false)
  return done.ok ? ok({ blocked: done.value }) : refusal(done)
}
