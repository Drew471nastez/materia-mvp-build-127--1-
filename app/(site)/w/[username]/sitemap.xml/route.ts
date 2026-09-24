/**
 * A published website's own sitemap: every published page and product, with
 * the pictures on each. The proxy sends `/sitemap.xml` on a site's own host
 * here. See lib/website-builder/site-seo.ts.
 */
import { sitemapXml } from "@/lib/website-builder/site-seo"
import { siteSeo } from "@/lib/website-builder/site-seo-data"

export const revalidate = 300

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const seo = await siteSeo(username)
  if (seo.kind !== "site") return new Response("Not found", { status: 404 })
  return new Response(sitemapXml(seo.entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
