/**
 * A published website's own sitemap: every published page and product, with
 * the pictures on each. The proxy sends `/sitemap.xml` on a site's own host
 * here. See lib/website-builder/site-seo.ts.
 */
import { sitemapChunks, sitemapIndexXml, sitemapXml } from "@/lib/website-builder/site-seo"
import { siteSeo } from "@/lib/website-builder/site-seo-data"
import { siteLanguages } from "@/lib/markets/live"
import { localizedPath } from "@/lib/markets/locales"

export const revalidate = 300

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const seo = await siteSeo(username)
  if (seo.kind !== "site") return new Response("Not found", { status: 404 })
  /*
    A WEBSITE IN MORE THAN ONE LANGUAGE lists each page in each of them,
    every address naming the others (hreflang) and the website's own as
    x-default, as Google asks (lib/markets/live.ts).
  */
  const langs = await siteLanguages(seo.creatorId)
  const all = [langs.defaultLanguage, ...langs.others]
  const entries =
    langs.others.length === 0
      ? seo.entries
      : seo.entries.flatMap((e) => {
          const path = new URL(e.loc).pathname
          const alternates = [
            ...all.map((l) => ({ hreflang: l, href: `${seo.origin}${localizedPath(path, l, langs.defaultLanguage)}` })),
            { hreflang: "x-default", href: `${seo.origin}${localizedPath(path, langs.defaultLanguage, langs.defaultLanguage)}` },
          ]
          return all.map((l) => ({ ...e, loc: `${seo.origin}${localizedPath(path, l, langs.defaultLanguage)}`, alternates }))
        })
  /*
    MORE THAN ONE FILE'S WORTH (sitemapChunks): /sitemap.xml is the index and
    /sitemap.xml?page=N each file, so no address is left out.
  */
  const chunks = sitemapChunks(entries)
  const page = Number(new URL(request.url).searchParams.get("page") ?? "")
  let body: string
  if (chunks.length <= 1) body = sitemapXml(entries)
  else if (Number.isInteger(page) && page >= 1 && page <= chunks.length) body = sitemapXml(chunks[page - 1])
  else if (new URL(request.url).searchParams.has("page")) return new Response("Not found", { status: 404 })
  else body = sitemapIndexXml(chunks.map((_, i) => `${seo.origin}/sitemap.xml?page=${i + 1}`))
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
