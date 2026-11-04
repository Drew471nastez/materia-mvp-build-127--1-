import { NextResponse, after } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, checkPostInput, createPost, feedSort, listFeed, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { announcePost } from "@/lib/communities/server/realtime"
import { announceAddresses } from "@/lib/seo/announce-pages"
import { publicPostAddresses } from "@/lib/seo/announce-posts"
import { HELD_MESSAGE, isHeld } from "@/lib/communities/server/safety"
import { blurPostVideos } from "@/lib/communities/server/video-posters"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/community/<id>/posts?space=<spaceId>&sort=latest|popular&cursor=
 * A page of the feed for an active member: { pinned, posts, nextCursor }.
 * Pinned posts come with the first page only. Spaces the member may not see
 * are never in it (lib/communities/server/feed.ts).
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const space = url.searchParams.get("space")
  const page = await listFeed(db, gate.community, gate.viewer, {
    sort: feedSort(url.searchParams.get("sort")),
    cursor: url.searchParams.get("cursor"),
    spaceId: space && UUID.test(space) ? space : null,
  })
  return NextResponse.json(page, { headers: NO_STORE })
}

/**
 * POST /api/community/<id>/posts
 * Body { spaceId, title?, body?, media?: PostMedia[], poll?: { question, options, multiple?, closesAt? } }
 * Answers { post }. 10 posts in 10 minutes and 50 a day per member.
 * Once answered, the members with the community open hear of it by id
 * (lib/communities/server/realtime.ts) and read it through GET above.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "post")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("post"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.post,
    message: "That is a lot of posts in a short time. Try again a little later.",
  })
  if (limited) return limited
  const input = checkPostInput(await readJson(request))
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400, headers: NO_STORE })
  const result = await createPost({ db, community: gate.community, viewer: gate.viewer }, input.value)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  const post = result.value
  if (isHeld(result)) return NextResponse.json({ post, held: true, message: HELD_MESSAGE }, { status: 202, headers: NO_STORE })
  after(() => announcePost(communityId, { id: post.id, spaceId: post.space?.id ?? null, authorId: post.author?.id ?? null }))
  /* Round 45: a public post's page, told to search engines (lib/seo/announce-posts.ts); a members only post is not. */
  after(async () => announceAddresses(await publicPostAddresses(communityId, post.id)))
  /* Round 33: each video still gets its 16px copy once the post is up, so nobody waits for it (video-posters.ts). */
  if (post.media.some((m) => m.type === "video")) after(() => blurPostVideos(db, communityId, post.id))
  return NextResponse.json({ post }, { status: 201, headers: NO_STORE })
}
