/**
 * sitemap.xml for a connected domain showing the creator page or the
 * OnePage: the page itself, the OnePage and every indexable product, at the
 * domain's own addresses. The proxy sends `<domain>/sitemap.xml` here with
 * ?shows=. See lib/custom-domain/seo.ts.
 */
import { urlsetXml } from "@/lib/seo/indexing"
import { domainSeo } from "@/lib/custom-domain/seo"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const shows = new URL(request.url).searchParams.get("shows") === "onepage" ? "onepage" : "creator_page"
  const seo = await domainSeo(username, shows)
  if (!seo) return new Response("Not found", { status: 404 })
  return new Response(urlsetXml(seo.entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
