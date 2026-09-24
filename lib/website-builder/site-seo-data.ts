import "server-only"

/**
 * The database half of ./site-seo.ts: where a site lives, and what its
 * sitemap lists. Reads only what a visitor can already see: published pages,
 * published products, and the address the site is served at.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { deservesIndexing } from "@/lib/security/spam-signals"
import { creatorShopTag, publishedShopByName } from "./published-site"
import {
  imagesOnPage,
  listedPageKeys,
  pageUrl,
  productUrl,
  siteIsIndexable,
  type SitemapEntry,
} from "./site-seo"
import type { ThemeSettingsValues } from "./types"

/**
 * THE SITE'S OWN ADDRESS. A connected, active domain when there is one,
 * because that is the address the creator gives out and the one a search
 * result should show; `<name>.storelib.com` otherwise. The same page at
 * two addresses is one page to a search engine only if both name this one.
 */
export async function siteOrigin(creatorId: string, name: string): Promise<string> {
  const domain = await unstable_cache(
    async () => {
      try {
        const { data } = await createAdminClient()
          .from("custom_domains")
          .select("domain")
          .eq("creator_id", creatorId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
        return ((data as { domain?: string } | null)?.domain ?? null) as string | null
      } catch {
        return null
      }
    },
    ["site-origin", creatorId],
    { revalidate: 300 },
  )()
  /* The proxy sends a bare connected domain to its www. host (a 301), so
     that is the address a canonical must name: one that answers, not one
     that redirects. */
  const bare = domain ? domain.trim().toLowerCase().replace(/\.$/, "") : null
  const host = bare ? (bare.startsWith("www.") ? bare : `www.${bare}`) : `${name.toLowerCase()}.${getMainDomain()}`
  const protocol = host.includes("localhost") ? "http" : "https"
  return `${protocol}://${host}`
}

interface ListedProduct {
  slug: string
  title: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  updated_at: string | null
}

/** Every published product of one creator, for the sitemap. Not the shop's 24. */
async function listedProducts(creatorId: string): Promise<ListedProduct[]> {
  return unstable_cache(
    async () => {
      try {
        const { data } = await createAdminClient()
          .from("products")
          .select("slug, title, thumbnail_url, gallery_urls, updated_at")
          .eq("creator_id", creatorId)
          .eq("status", "published")
          .not("slug", "is", null)
          .order("updated_at", { ascending: false })
          .limit(5000)
        return ((data ?? []) as ListedProduct[]).filter((p) => typeof p.slug === "string" && p.slug !== "")
      } catch {
        return []
      }
    },
    ["site-seo-products", creatorId],
    { tags: [creatorShopTag(creatorId)], revalidate: 600 },
  )()
}

export type SiteSeo =
  | {
      kind: "site"
      origin: string
      indexable: boolean
      creatorId: string
      displayName: string
      themeSettings: ThemeSettingsValues
      entries: SitemapEntry[]
    }
  | { kind: "none" }

/** Everything /robots.txt and /sitemap.xml need, for the site at this name. */
export async function siteSeo(name: string): Promise<SiteSeo> {
  const found = await publishedShopByName(name)
  if (found.kind !== "site") return { kind: "none" }
  const { site } = found
  const origin = await siteOrigin(site.creatorId, name)
  /* The creator's switch, and the same spam rule storelib.com's own
     sitemap applies to a handle (lib/security/spam-signals). */
  const indexable =
    siteIsIndexable(site.themeSettings as Record<string, unknown>) && deservesIndexing({ publishedProducts: 1, handle: name })

  const entries: SitemapEntry[] = []
  if (indexable) {
    for (const key of listedPageKeys(Object.keys(site.pages))) {
      entries.push({ loc: pageUrl(origin, key), images: imagesOnPage(site.pages[key] ?? []) })
    }
    const products = await listedProducts(site.creatorId)
    if (products.length > 0 && !site.pages.products) entries.push({ loc: pageUrl(origin, "products") })
    for (const p of products) {
      const pictures = [p.thumbnail_url, ...(p.gallery_urls ?? [])].filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
      entries.push({
        loc: productUrl(origin, p.slug),
        ...(p.updated_at ? { lastmod: new Date(p.updated_at).toISOString() } : {}),
        images: [...new Set(pictures)].map((loc) => (p.title ? { loc, title: p.title } : { loc })),
      })
    }
  }

  return {
    kind: "site",
    origin,
    indexable,
    creatorId: site.creatorId,
    displayName: site.displayName,
    themeSettings: site.themeSettings,
    entries,
  }
}
