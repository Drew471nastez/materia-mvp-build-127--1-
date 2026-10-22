import { NextResponse } from "next/server"
import { chatRoute, ok, refusal } from "@/lib/communities/server/chat-routes"
import { readJson } from "@/lib/communities/server/feed"
import { createGroup, listGroups } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET: { ready, groups (newest first) }, only the groups the viewer is in. */
export async function GET(_request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view")
  if (r instanceof NextResponse) return r
  return ok(await listGroups(r.db, r.gate.community, r.gate.viewer))
}

/** POST { name, userIds }: { group: { id, name } }. As the community's Chat settings allow; 10 an hour. */
export async function POST(request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "chat", "groupMake")
  if (r instanceof NextResponse) return r
  const made = await createGroup(r.db, r.gate.community, r.gate.viewer, await readJson(request))
  return made.ok ? ok({ group: made.value }, 201) : refusal(made)
}
