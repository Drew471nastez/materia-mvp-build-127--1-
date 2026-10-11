import { ALL_POSTS } from "../../../../../fix/data"
export async function GET(req: Request) {
  const u = new URL(req.url)
  await new Promise((r) => setTimeout(r, 200))
  let list = ALL_POSTS
  const space = u.searchParams.get("space"); if (space) list = list.filter((p) => p.space?.id === space)
  return new Response(JSON.stringify({ pinned: list.filter((p) => p.pinned), posts: list.filter((p) => !p.pinned), nextCursor: null }), { headers: { "Content-Type": "application/json" } })
}
/* A post written in the composer (round 21's compose flow): the first post's shape, with the words sent and a new id. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  await new Promise((r) => setTimeout(r, 200))
  const like = ALL_POSTS[ALL_POSTS.length - 1]
  const space = (ALL_POSTS.find((p) => p.space?.id === body.spaceId) ?? like).space
  const post = { ...like, id: `new-${Date.now()}`, title: body.title || "", bodyText: body.body || "", media: [], poll: null, pinned: false, likeCount: 0, commentCount: 0, liked: false, bookmarked: false, createdAt: new Date().toISOString(), space }
  return new Response(JSON.stringify({ post }), { headers: { "Content-Type": "application/json" } })
}
