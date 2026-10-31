import { legacyCategoryTarget } from "@/lib/blog/article"

/*
  THE OLD CATEGORY ADDRESS. /blog/explore/categories/<slug> moved to
  /blog/category/<slug> (round 45); this answers a 308 Permanent Redirect
  there, so links and search results that still name the old address keep
  their reader and their ranking. A category that does not exist is a 404
  here as it was before, never a redirect to a page that would 404 too.
  next.config's /blog/:path* rule lets the CDN hold the answer.
*/
export async function GET(_req: Request, { params }: { params: Promise<{ category: string }> }) {
  const target = legacyCategoryTarget((await params).category)
  if (!target) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  return new Response(null, { status: 308, headers: { Location: target } })
}
