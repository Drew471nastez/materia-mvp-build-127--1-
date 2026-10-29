import "server-only"

import { onePageOrigin } from "@/lib/onepage/address"
import type { SitemapEntry } from "@/lib/seo/indexing"
import {
  communitiesSitemap,
  creatorsSitemap,
  onePagesSitemap,
  onePagesSitemapIndex,
  pagesSitemap,
  parseSitemapName,
  productsSitemap,
  siteSitemap,
  sitemapIndex,
  websitesSitemap,
} from "@/lib/seo/sitemaps"

/**
 * ===========================================================================
 *  EVERY ADDRESS STORELIB LISTS, FROM THE SITEMAPS THEMSELVES
 * ===========================================================================
 * The inventory is read from the same functions the sitemap routes serve
 * (lib/seo/sitemaps.ts), file by file, so the console and the sitemaps can
 * never disagree about what is live: an address is "in the sitemap" when the
 * last read of its file listed it.
 *
 * The files are storelib.com/sitemap.xml's (pages, products-N, creators-N,
 * websites-N, communities-N) and storelib.me/sitemap.xml's (onepages-N). A
 * built site's other pages are on its own host's /sitemap.xml, read through
 * siteSitemap for a few sites per run.
 */

const nameOf = (url: string) => url.replace(/^.*\/sitemap\//, "").replace(/\.xml$/, "")

/** Every sitemap file, by name, in the order the cron walks them. */
export async function sitemapFiles(): Promise<string[]> {
  const [main, onePages] = await Promise.all([sitemapIndex(), onePagesSitemapIndex(onePageOrigin())])
  const names = [...main, ...onePages].map((e) => nameOf(e.url)).filter((n) => parseSitemapName(n))
  return [...new Set(names)]
}

/** The addresses one file lists. Throws SitemapReadFailed as the route would answer 503. */
export async function readSitemapFile(name: string): Promise<SitemapEntry[]> {
  const wanted = parseSitemapName(name)
  if (!wanted || wanted.kind === "onepages-index") return []
  switch (wanted.kind) {
    case "pages":
      return pagesSitemap()
    case "products":
      return productsSitemap(wanted.chunk, wanted.of)
    case "creators":
      return creatorsSitemap(wanted.chunk, wanted.of)
    case "onepages":
      return onePagesSitemap(wanted.chunk, wanted.of)
    case "communities":
      return communitiesSitemap(wanted.chunk, wanted.of)
    case "websites":
      return websitesSitemap(wanted.chunk, wanted.of)
  }
}

/** A built site's own pages, as its /sitemap.xml lists them, or null when it has nothing published. */
export async function readSitePages(handle: string): Promise<{ origin: string; urls: string[] } | null> {
  const site = await siteSitemap(handle)
  if (!site) return null
  return { origin: site.origin, urls: site.entries.map((e) => e.url) }
}
