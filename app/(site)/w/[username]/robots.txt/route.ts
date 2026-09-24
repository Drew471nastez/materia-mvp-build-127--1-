import { siteSitemap } from "@/lib/seo/sitemaps"
import { SITE_DISALLOW, robotsTxt } from "@/lib/seo/indexing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * A built site's own robots.txt, for `<name>.storelib.com/robots.txt` and
 * `www.<their-domain>/robots.txt` (the proxy sends both here). Open to
 * crawling except the site's form API, previews, search results and the
 * basket, and naming the sitemap at the site's canonical origin.
 *
 * A site whose owner switched search indexing off is still crawlable: its
 * pages carry noindex, and a crawler that is refused at the door never
 * reads that, so pages already in an index would stay there.
 */
export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params
  const found = await siteSitemap(username)
  /**
   * No such site is a 404, never "Disallow: /". A lookup that failed for a
   * moment reads the same as a site that is not there, and Google keeps a
   * robots.txt for a day: a refusal served during a hiccup would close a
   * real site to it. A 404 robots.txt means "nothing is off limits".
   */
  if (!found) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  const body = robotsTxt({ disallow: SITE_DISALLOW, sitemaps: [`${found.origin}/sitemap.xml`] })
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  })
}
