import { NextResponse } from "next/server"
import { siteSitemap } from "@/lib/seo/sitemaps"
import { urlsetXml } from "@/lib/seo/indexing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * ===========================================================================
 *  A BUILT SITE'S OWN SITEMAP
 * ===========================================================================
 * `<name>.storelib.com/sitemap.xml` and `www.<their-domain>/sitemap.xml`
 * arrive here through the proxy. Google treats every host as its own site,
 * so each lists its own pages: the published pages, the shop and each
 * product, at the site's canonical origin (lib/seo/sitemaps.ts siteSitemap).
 *
 * A site with a connected domain is canonical there, so its subdomain's
 * sitemap is a redirect to the domain's: a sitemap may only list addresses
 * on the host that serves it.
 */
export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params
  const found = await siteSitemap(username)
  if (!found) return new Response("Not found", { status: 404 })
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()
  const canonicalHost = new URL(found.origin).host
  const local = host === "localhost" || host.startsWith("127.") || host.endsWith(".localhost")
  if (!local && host && host !== canonicalHost) {
    return NextResponse.redirect(`${found.origin}/sitemap.xml`, 301)
  }
  return new Response(urlsetXml(found.entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  })
}
