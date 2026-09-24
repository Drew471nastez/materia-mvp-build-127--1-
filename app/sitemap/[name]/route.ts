import { creatorsSitemap, pagesSitemap, parseSitemapName, productsSitemap, websitesSitemap } from "@/lib/seo/sitemaps"
import { urlsetXml } from "@/lib/seo/indexing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * One file of storelib.com's sitemap: /sitemap/pages.xml,
 * /sitemap/products-0.xml, /sitemap/creators-0.xml, /sitemap/websites-0.xml.
 * The index at /sitemap.xml names the ones that exist.
 */
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params
  const wanted = parseSitemapName(name)
  if (!wanted) return new Response("Not found", { status: 404 })
  const entries =
    wanted.kind === "pages"
      ? await pagesSitemap()
      : wanted.kind === "products"
        ? await productsSitemap(wanted.chunk)
        : wanted.kind === "creators"
          ? await creatorsSitemap(wanted.chunk)
          : await websitesSitemap(wanted.chunk)
  return new Response(urlsetXml(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
