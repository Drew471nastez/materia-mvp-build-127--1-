/**
 * A published website's own robots.txt, at `<name>.storelib.com/robots.txt`
 * or the domain the creator connected. The proxy sends the request here.
 * See lib/website-builder/site-seo.ts.
 */
import { robotsTxt } from "@/lib/website-builder/site-seo"
import { siteSeo } from "@/lib/website-builder/site-seo-data"

export const revalidate = 300

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const seo = await siteSeo(username)
  /* No published site at this name: nothing here to list, and nothing to hide. */
  const body = seo.kind === "site" ? robotsTxt(seo.origin, seo.indexable) : "User-agent: *\nAllow: /\n"
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
