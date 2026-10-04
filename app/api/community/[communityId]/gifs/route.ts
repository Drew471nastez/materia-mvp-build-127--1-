import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { cleanGifQuery, giphyKey, searchGifs } from "@/lib/communities/server/gifs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 10

/**
 * GET /api/community/<id>/gifs?q=<words>&offset=<n>
 *   -> { connected: true, gifs: [{ id, url, still, w, h, title }], next }   (trending with no q)
 *   -> { connected: false, gifs: [] }   when GIPHY_API_KEY is not set
 * For a member who may post. 60 searches a minute.
 */
export async function GET(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "post")
  if (gate instanceof NextResponse) return gate
  const key = giphyKey()
  if (!key) return NextResponse.json({ connected: false, gifs: [], next: null }, { headers: NO_STORE })
  const limited = await rateLimit({ bucket: "community-gif", subjects: [memberSubject(String(gate.viewer.userId))], windows: [{ limit: 60, seconds: 60 }] })
  if (limited) return limited
  const url = new URL(request.url)
  const found = await searchGifs(cleanGifQuery(url.searchParams.get("q")), Number(url.searchParams.get("offset")) || 0, key)
  if (!found.ok) return NextResponse.json({ error: "GIFs did not load. Try again." }, { status: 502, headers: NO_STORE })
  return NextResponse.json({ connected: true, gifs: found.gifs, next: found.next }, { headers: { "Cache-Control": "private, max-age=60" } })
}
