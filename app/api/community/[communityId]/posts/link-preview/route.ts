import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, fetchLinkPreview, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 15

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST { url }: the link's card for the composer, { preview } or { preview: null }.
 * Fetched by the server from public addresses only, 512 KB and 4 seconds at
 * most (lib/communities/server/feed.ts fetchLinkPreview). Counted with posts'
 * window, since a preview is only ever asked for while writing one.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "post")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("comment"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.comment })
  if (limited) return limited
  const body = await readJson(request)
  const preview = typeof body.url === "string" ? await fetchLinkPreview(body.url) : null
  return NextResponse.json({ preview }, { headers: NO_STORE })
}
