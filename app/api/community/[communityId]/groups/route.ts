import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit, ok, refusal } from "@/lib/communities/server/chat-routes"
import { createGroup, listGroups } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET: { ready, groups (newest first) }, only the groups the viewer is in. */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  return ok(await listGroups(db, gate.community, gate.viewer))
}

/** POST { name, userIds }: { group: { id, name } }. As the community's Chat settings allow; 10 an hour. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "groupMake")
  if (limited) return limited
  const made = await createGroup(db, gate.community, gate.viewer, await readJson(request))
  return made.ok ? ok({ group: made.value }, 201) : refusal(made)
}
