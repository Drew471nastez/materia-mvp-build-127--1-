import { sitemapIndex } from "@/lib/seo/sitemaps"
import { sitemapIndexXml } from "@/lib/seo/indexing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * storelib.com/sitemap.xml: the index of every sitemap file storelib.com
 * serves, one per ten thousand pages (lib/seo/sitemaps.ts). This is the one
 * address to give Google Search Console; robots.txt names it too.
 *
 * Held at the edge for an hour. A page published a minute ago reaches the
 * engines that take IndexNow at once (lib/seo/indexnow.ts), and Google on
 * its next read of this.
 */
export async function GET() {
  const xml = sitemapIndexXml(await sitemapIndex())
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
