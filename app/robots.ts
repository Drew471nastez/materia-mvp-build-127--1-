import type { MetadataRoute } from "next"
import { PLATFORM_DISALLOW, refusedCrawlerRules } from "@/lib/seo/indexing"

/**
 * storelib.com/robots.txt. Everything public is open; the app, the editors
 * and the flows that belong to one signed in person are not crawled
 * (lib/seo/indexing.ts PLATFORM_DISALLOW, which also says why each route is
 * matched exactly rather than as a prefix). The sitemap it names is the
 * index of every storelib.com sitemap file.
 *
 * Which crawlers are let in, search and training told apart, is one table:
 * lib/seo/indexing.ts KNOWN_CRAWLERS (refusedCrawlerRules). Today all of
 * them are, through `User-agent: *`.
 *
 * A built site's host, <name>.storelib.com or a connected domain, never
 * reaches this: the proxy sends its /robots.txt to the site's own, which
 * names the site's own sitemap (app/(site)/w/[username]/robots.txt).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PLATFORM_DISALLOW }, ...refusedCrawlerRules()],
    sitemap: "https://storelib.com/sitemap.xml",
  }
}
