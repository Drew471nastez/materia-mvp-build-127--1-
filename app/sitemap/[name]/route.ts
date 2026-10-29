import {
  SitemapReadFailed,
  communitiesSitemap,
  creatorsSitemap,
  onePagesSitemap,
  onePagesSitemapIndex,
  pagesSitemap,
  parseSitemapName,
  productsSitemap,
  sitemapUnavailable,
  urlsetWithinLimit,
  websitesSitemap,
} from "@/lib/seo/sitemaps"
import { sitemapIndexXml } from "@/lib/seo/indexing"
import { onePageOrigin } from "@/lib/onepage/address"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * One file of storelib.com's sitemap: /sitemap/pages.xml,
 * /sitemap/products-0-of-1.xml, /sitemap/creators-0-of-1.xml,
 * /sitemap/websites-0-of-1.xml. And storelib.me's: /sitemap/onepages.xml
 * (its index, which storelib.me/sitemap.xml is sent to) and
 * /sitemap/onepages-0-of-1.xml. N-of-M is a slice of the id space
 * (lib/seo/indexing.ts chunkIdRange); a name without "-of-M", from an index
 * read before round 44, is counted afresh and still answers.
 * The index at /sitemap.xml names the ones that exist. A read that failed is
 * a 503, never a shorter file held at the edge for an hour.
 */
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params
  const wanted = parseSitemapName(name)
  if (!wanted) return new Response("Not found", { status: 404 })
  try {
    /* storelib.me/sitemap.xml, which the proxy sends here: an index of the OnePage files, on storelib.me. */
    if (wanted.kind === "onepages-index") {
      return new Response(sitemapIndexXml(await onePagesSitemapIndex(onePageOrigin())), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      })
    }
    const entries =
      wanted.kind === "pages"
        ? await pagesSitemap()
        : wanted.kind === "products"
          ? await productsSitemap(wanted.chunk, wanted.of)
          : wanted.kind === "creators"
            ? await creatorsSitemap(wanted.chunk, wanted.of)
            : wanted.kind === "onepages"
              ? await onePagesSitemap(wanted.chunk, wanted.of)
              : wanted.kind === "communities"
                ? await communitiesSitemap(wanted.chunk, wanted.of)
                : await websitesSitemap(wanted.chunk, wanted.of)
    /* Inside the protocol's 50 MB whatever the pictures come to (lib/seo/sitemaps.ts urlsetWithinLimit). */
    return new Response(urlsetWithinLimit(entries), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (e) {
    if (e instanceof SitemapReadFailed) return sitemapUnavailable()
    throw e
  }
}
