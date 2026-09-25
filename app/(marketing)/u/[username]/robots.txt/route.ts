/**
 * robots.txt for a connected domain showing the creator page or the
 * OnePage. The proxy sends `<domain>/robots.txt` here with ?shows=; the
 * website's own is app/(site)/w/[username]/robots.txt. See
 * lib/custom-domain/seo.ts.
 */
import { robotsTxt } from "@/lib/seo/indexing"
import { domainSeo } from "@/lib/custom-domain/seo"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const shows = new URL(request.url).searchParams.get("shows") === "onepage" ? "onepage" : "creator_page"
  const seo = await domainSeo(username, shows)
  const body = seo
    ? robotsTxt({ disallow: ["/api/", "/checkout"], sitemaps: seo.indexable ? [`${seo.origin}/sitemap.xml`] : [] })
    : "User-agent: *\nAllow: /\n"
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
