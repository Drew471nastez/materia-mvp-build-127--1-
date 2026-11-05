/**
 * A creator page domain's own sitemap: the creator page, its products and
 * its OnePage at the domain's addresses. proxy.ts sends `/sitemap.xml` on a
 * connected domain here, and the Host header says which domain asked (a
 * rewrite keeps it); a host that is not the creator page's live primary
 * domain has none, and gets a 404. See lib/seo/creator-domain.ts.
 */
import { creatorDomainSitemap } from "@/lib/seo/creator-domain"
import { urlsetXml } from "@/lib/seo/indexing"
import { SitemapReadFailed, sitemapUnavailable } from "@/lib/seo/sitemaps"

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
  const host = request.headers.get("host")
  try {
    const entries = await creatorDomainSitemap(username, host)
    if (!entries) {
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": CACHE } })
    }
    return new Response(urlsetXml(entries), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": CACHE,
      },
    })
  } catch (e) {
    if (e instanceof SitemapReadFailed) return sitemapUnavailable()
    throw e
  }
}
