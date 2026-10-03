import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { createCreatorPost, loadFeedRows } from "@/lib/communities/server/creator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/posts?cursor=&show=all|removed -> { rows, next }
 * POST /api/app/community/<id>/posts { spaceId, title?, body, pin? } -> { id }
 *      A post from the creator's Feed screen, in a space they may post in;
 *      in the Announcements space it is an announcement members hear about.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "moderate_content")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const show = url.searchParams.get("show") === "removed" ? "removed" : "all"
  return NextResponse.json(await loadFeedRows(gate.ctx.admin, gate.community.id, { cursor: url.searchParams.get("cursor"), show }), { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "post")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("post"), subjects: [`user:${gate.ctx.userId}`], windows: RATE_LIMITS.post, message: "That is a lot of posts at once. Try again in a few minutes." })
  if (limited) return limited
  const body = await readJson(request)
  const done = await createCreatorPost(gate.ctx.admin, { community: gate.community, role: gate.role, actorId: gate.ctx.userId, spaceId: body.spaceId, title: body.title, body: body.body, pin: body.pin === true })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ id: done.id }, { status: 201, headers: noStore })
}
