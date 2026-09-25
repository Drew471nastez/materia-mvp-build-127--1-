/**
 * A connected domain's robots.txt when it shows the creator page: a creator
 * page domain, or a website domain whose creator has no website published.
 * Open, except the platform's own paths that answer on every host, and
 * naming the domain's own sitemap when it has one (the creator page's live
 * primary domain). proxy.ts sends `/robots.txt` here; the Host header, which
 * a rewrite keeps, says which domain asked. See lib/seo/creator-domain.ts.
 */
import { creatorDomainRobots } from "@/lib/seo/creator-domain"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Held by the crawler for five minutes, and NOT at the edge (no s-maxage).
 * The answer depends on the Host header, and one creator's website domain
 * and creator page domain are both rewritten to this one path: an edge
 * copy filed under the rewritten path would hand one domain the other's
 * file. A crawler reads these a few times a day.
 */
const CACHE = "public, max-age=300"

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const body = await creatorDomainRobots(username, request.headers.get("host"))
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE,
    },
  })
}
