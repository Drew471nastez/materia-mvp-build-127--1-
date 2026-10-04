import "server-only"

/**
 * The database half of ./site-seo.ts: where a site lives, and what its
 * sitemap lists. Reads only what a visitor can already see: published pages,
 * published products, and the address the site is served at.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { getMainDomain } from "@/lib/url-helpers"
import { builtSiteIndexable } from "@/lib/seo/indexing"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { creatorShopTag, creatorSiteTag, publishedShopByName } from "./published-site"
import { websiteHandleOf } from "./site-address-data"
import {
  imagesOnPage,
  listedPageKeys,
  pageUrl,
  productUrl,
  type SitemapEntry,
} from "./site-seo"
import type { ThemeSettingsValues } from "./types"
import { hiddenPages } from "./page-seo"

/**
 * The creator page's domain, at the host it is served at, or null. The
 * OnePage answers at `/links` on it (proxy.ts), so its canonical and the
 * addresses announced for it both read this; a website domain is not the
 * OnePage's. Cached with the domain list (lib/custom-domains/store).
 */
export function activeDomainOf(creatorId: string): Promise<string | null> {
  return primaryHostFor(creatorId, "creator_page")
}

/**
 * THE SITE'S OWN ADDRESS. A connected, active domain when there is one,
 * because that is the address the creator gives out and the one a search
 * result should show; `<name>.storelib.com` otherwise. The same page at
 * two addresses is one page to a search engine only if both name this one.
 */
export async function siteOrigin(creatorId: string, name: string): Promise<string> {
  /* The website's primary domain, at the host it is served at (www.<apex>, or
     a connected subdomain as it is): one that answers, not one that
     redirects. A creator page domain is not the website's. */
  const host = await primaryHostFor(creatorId, "website")
  /* Without a domain, the name the website was given, else the one it was reached by. */
  const handle = host
    ? null
    : await unstable_cache(() => websiteHandleOf(creatorId), ["site-handle", creatorId], { tags: [creatorSiteTag(creatorId)], revalidate: 300 })()
  const origin = host ?? `${(handle ?? name).toLowerCase()}.${getMainDomain()}`
  const protocol = origin.includes("localhost") ? "http" : "https"
  return `${protocol}://${origin}`
}

/**
 * The creator's own picture (profiles.avatar_url, which Settings and the
 * page builder both keep), for a share card that has nothing better. Asked
 * only when the site has no share image, logo or hero picture; cached for
 * five minutes, and nothing at all rather than an error.
 */
export async function creatorAvatar(creatorId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      try {
        const admin = createAdminClient()
        const { data: creator } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
        const userId = (creator as { user_id?: string | null } | null)?.user_id
        if (!userId) return null
        const { data: profile } = await admin.from("profiles").select("avatar_url").eq("id", userId).maybeSingle()
        return ((profile as { avatar_url?: string | null } | null)?.avatar_url ?? null) || null
      } catch {
        return null
      }
    },
    ["site-avatar", creatorId],
    /* Tagged, so a photo changed in Settings clears this rather than
       sitting for five minutes (lib/commerce/product-page-cache creatorTag,
       cleared by /api/account/avatar and /api/account/profile-changed). */
    { revalidate: 300, tags: [creatorTag(creatorId)] },
  )()
}

interface ListedProduct {
  slug: string
  title: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  updated_at: string | null
}

/** At most this many products in one site's sitemap. */
const MAX_LISTED_PRODUCTS = 5000
/** Rows per request: PostgREST answers at most `max_rows`, 1,000 on Supabase. */
const PRODUCT_PAGE = 1000

/**
 * Every published product of one creator, for the sitemap. Not the shop's 24.
 *
 * A THOUSAND AT A TIME. This asked for `.limit(5000)` in one request, and a
 * request is answered with at most `max_rows` rows, so a shop with more than a
 * thousand products had the rest left out of its sitemap in silence. A read
 * that fails is thrown out of the cache rather than kept in it, so a blip is
 * not remembered as "no products" for ten minutes; the site's files still
 * answer, with its pages, because robots.txt must never fail.
 */
async function listedProducts(creatorId: string): Promise<ListedProduct[]> {
  try {
    return await unstable_cache(
      async () => {
        const admin = createAdminClient()
        const rows: ListedProduct[] = []
        for (let from = 0; from < MAX_LISTED_PRODUCTS; from += PRODUCT_PAGE) {
          const { data, error } = await admin
            .from("products")
            .select("slug, title, thumbnail_url, gallery_urls, updated_at")
            .eq("creator_id", creatorId)
            .eq("status", "published")
            .not("slug", "is", null)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, from + PRODUCT_PAGE - 1)
          if (error) throw new Error(error.message)
          rows.push(...((data ?? []) as ListedProduct[]))
          if (!data || data.length < PRODUCT_PAGE) break
        }
        return rows.filter((p) => typeof p.slug === "string" && p.slug !== "")
      },
      ["site-seo-products", creatorId],
      { tags: [creatorShopTag(creatorId)], revalidate: 600 },
    )()
  } catch (e) {
    console.error("[site-seo] products query failed:", (e as Error).message)
    return []
  }
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

/** The handles of the shop's published collections, or none when they cannot be read. */
async function listedCollections(creatorId: string): Promise<string[]> {
  try {
    const { data } = await createAdminClient()
      .from("product_collections")
      .select("slug")
      .eq("creator_id", creatorId)
      .eq("published", true)
      .order("created_at", { ascending: true })
      .limit(200)
    return ((data ?? []) as { slug: string | null }[]).map((r) => r.slug ?? "").filter((h) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(h))
  } catch {
    return []
  }
}

/** Everything /robots.txt and /sitemap.xml need, for the site at this name. */
export async function siteSeo(name: string): Promise<SiteSeo> {
  const found = await publishedShopByName(name)
  if (found.kind !== "site") return { kind: "none" }
  const { site } = found
  const origin = await siteOrigin(site.creatorId, name)
  /* The creator's switch, and the same spam rule storelib.com's own
     sitemap applies to a handle: lib/seo/indexing builtSiteIndexable, which
     the site's pages and storelib.com's websites sitemap read too. */
  const indexable = builtSiteIndexable(site.themeSettings as Record<string, unknown>, name)

  const entries: SitemapEntry[] = []
  if (indexable) {
    /* Not a page its creator kept out of search (Pages & Navigation). */
    const hidden = hiddenPages(site.themeSettings as Record<string, unknown>)
    for (const key of listedPageKeys(Object.keys(site.pages)).filter((k) => !hidden.has(k))) {
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
    /* Each published collection's own page, /collections/<handle>: every shop can have them. */
    for (const handle of await listedCollections(site.creatorId)) entries.push({ loc: `${origin}/collections/${handle}` })
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

/**
 * THE ADDRESSES A WEBSITE HAD, once it has been taken down. Unpublishing
 * changes the install's status and leaves its published sections on their
 * rows, so the install unpublished most recently still says which pages were
 * live, and the products it listed are the creator's published ones. What
 * lib/seo/announce.ts tells search engines to look at again when there is no
 * published site left for siteSeo to read. The front page at least, whatever
 * else could not be read.
 */
export async function formerSiteAddresses(creatorId: string, name: string): Promise<string[]> {
  const origin = await siteOrigin(creatorId, name)
  const urls = [pageUrl(origin, "home")]
  try {
    const admin = createAdminClient()
    const { data: install } = await admin
      .from("store_theme_installs")
      .select("id, store_theme_settings ( settings )")
      .eq("creator_id", creatorId)
      .eq("status", "unpublished")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = install as { id: string; store_theme_settings?: unknown } | null
    if (!row) return urls
    const settingsRow = (Array.isArray(row.store_theme_settings) ? row.store_theme_settings[0] : row.store_theme_settings) as
      | { settings?: Record<string, unknown> | null }
      | null
      | undefined
    const { data: pages } = await admin.from("store_theme_pages").select("page_key, sections").eq("install_id", row.id)
    const live = ((pages ?? []) as { page_key: string; sections: unknown }[]).filter((p) => Array.isArray(p.sections) && p.sections.length > 0)
    const hidden = hiddenPages(settingsRow?.settings ?? {})
    for (const key of listedPageKeys(live.map((p) => p.page_key)).filter((k) => !hidden.has(k))) urls.push(pageUrl(origin, key))
    const products = await listedProducts(creatorId)
    if (products.length > 0) urls.push(pageUrl(origin, "products"))
    for (const p of products) urls.push(productUrl(origin, p.slug))
  } catch {
    /* The front page is still worth telling. */
  }
  return [...new Set(urls)]
}
