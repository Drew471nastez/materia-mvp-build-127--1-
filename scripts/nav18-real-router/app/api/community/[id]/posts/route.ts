import { ALL_POSTS } from "../../../../../fix/data"
export async function GET(req: Request) {
  const u = new URL(req.url)
  await new Promise((r) => setTimeout(r, 200))
  let list = ALL_POSTS
  const space = u.searchParams.get("space"); if (space) list = list.filter((p) => p.space?.id === space)
  return new Response(JSON.stringify({ pinned: list.filter((p) => p.pinned), posts: list.filter((p) => !p.pinned), nextCursor: null }), { headers: { "Content-Type": "application/json" } })
}
