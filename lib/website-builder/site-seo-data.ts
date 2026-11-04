import "server-only"

/**
 * The database half of ./site-seo.ts: where a site lives, and what its
 * sitemap lists. Reads only what a visitor can already see: published pages,
 * published products, and the address the site is served at.
 */
import { offChannel } from "@/lib/store/channel-filter"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { getMainDomain } from "@/lib/url-helpers"
import { builtSiteIndexable } from "@/lib/seo/indexing"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { creatorShopTag, creatorSiteTag, publishedShopByName } from "./published-site"
import { websiteHandleOf } from "./site-address-data"
import { listedBlogEntries } from "@/lib/site-blog/public-read"
import {
  blogSitemapEntries,
  imagesOnPage,
  listedPageKeys,
  pageLastmod,
  pageUrl,
  productUrl,
  shopUrl,
  type SitemapEntry,
} from "./site-seo"
import type { ThemeSettingsValues } from "./types"
import { hiddenPages } from "./page-seo"
import { imagesOnly } from "@/lib/media/video"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { readSiteAccess } from "@/lib/site-password/store"
import { storefrontReviews } from "@/lib/reviews/storefront-server"

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
  return siteOriginOnce(creatorId, name)
}

/* Once per request (React's cache): the page, its metadata and its search result data all ask, side by side. */
const siteOriginOnce = cache(async function siteOriginOnce(creatorId: string, name: string): Promise<string> {
  /* The website's primary domain, at the host it is served at (www.<apex>, or
     a connected subdomain as it is): one that answers, not one that
     redirects. A creator page domain is not the website's. */
  /* A lookup that fails is the name the site was reached by: a canonical address is never worth a page that does not draw. */
  const host = await primaryHostFor(creatorId, "website").catch(() => null)
  /* Without a domain, the name the website was given, else the one it was reached by. */
  const handle = host
    ? null
    : await unstable_cache(() => websiteHandleOf(creatorId), ["site-handle", creatorId], { tags: [creatorSiteTag(creatorId)], revalidate: 300 })().catch(() => null)
  const origin = host ?? `${(handle ?? name).toLowerCase()}.${getMainDomain()}`
  const protocol = origin.includes("localhost") ? "http" : "https"
  return `${protocol}://${origin}`
})

/**
 * The creator's own picture (profiles.avatar_url, which Settings and the
 * page builder both keep), for a share card that has nothing better. Asked
 * only when the site has no share image, logo or hero picture; cached for
 * five minutes, and nothing at all rather than an error. `knownUserId`, the
 * creator's account when the caller already has it (the site's name lookup
 * does), saves asking `creators` for it; the entry is the same either way.
 */
export async function creatorAvatar(creatorId: string, knownUserId?: string | null): Promise<string | null> {
  return unstable_cache(
    async () => {
      try {
        const admin = createAdminClient()
        const userId = knownUserId || ((await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()).data as { user_id?: string | null } | null)?.user_id
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
  id?: string
  slug: string
  title: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  updated_at: string | null
}

/**
 * At most this many products in one site's sitemap. The sitemap splits into
 * files of 45,000 addresses (sitemapChunks), so this is a ceiling on the
 * work one listing does, not on what a file can hold.
 */
export const MAX_LISTED_PRODUCTS = 50_000
/** Rows per request: PostgREST answers at most `max_rows`, 1,000 on Supabase. */
const PRODUCT_PAGE = 1000
/**
 * Pictures kept per product. Each page of rows is held on its own, and
 * Next's data cache refuses an entry over 2MB (it is then read again on
 * every request); a thousand products with every gallery picture passed it.
 */
const LISTED_IMAGES = 10

/**
 * One page of a creator's published products, held on its own. A page of a
 * thousand rows stays under the cache's limit where the whole list of a big
 * shop did not, so a shop with tens of thousands of products is read from
 * the database once per ten minutes, not on every sitemap request. Ordered
 * by id, which an edit does not move, so a page holds the same rows until a
 * product is added or removed, and that clears every page at once (the
 * shop tag).
 */
function productPage(creatorId: string, from: number): Promise<ListedProduct[]> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("products")
        .select("id, slug, title, thumbnail_url, gallery_urls, updated_at")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .not("slug", "is", null)
        .order("id", { ascending: true })
        .range(from, from + PRODUCT_PAGE - 1)
      if (error) throw new Error(error.message)
      return ((data ?? []) as ListedProduct[]).map((p) => ({ ...p, gallery_urls: (p.gallery_urls ?? []).slice(0, LISTED_IMAGES) }))
    },
    ["site-seo-products", creatorId, String(from)],
    { tags: [creatorShopTag(creatorId)], revalidate: 600 },
  )()
}

/**
 * Every published product of one creator, for the sitemap. Not the shop's 24.
 *
 * A THOUSAND AT A TIME. This asked for `.limit(5000)` in one request, and a
 * request is answered with at most `max_rows` rows, so a shop with more than a
 * thousand products had the rest left out of its sitemap in silence. Then it
 * stopped at 5,000, and held the whole list in one cache entry that a big
 * shop's list was too large for. A page that fails is thrown out of the
 * cache rather than kept in it, so a blip is not remembered as "no products"
 * for ten minutes; the pages read before it are still listed, and the site's
 * files still answer, because robots.txt must never fail.
 */
async function listedProducts(creatorId: string): Promise<ListedProduct[]> {
  const rows: ListedProduct[] = []
  try {
    for (let from = 0; from < MAX_LISTED_PRODUCTS; from += PRODUCT_PAGE) {
      const page = await productPage(creatorId, from)
      rows.push(...page)
      if (page.length < PRODUCT_PAGE) break
    }
  } catch (e) {
    console.error("[site-seo] products query failed:", (e as Error).message)
  }
  /* Settings › Sales channels: a product taken off the Online store is not in its sitemap either (lib/store/channels). */
  const offIds = await unstable_cache(
    async () => {
      const admin = createAdminClient()
      const off = await offChannel(admin, creatorId, "storefront")
      return [...off]
    },
    ["site-seo-off-channel", creatorId],
    { tags: [creatorShopTag(creatorId)], revalidate: 600 },
  )().catch(() => [] as string[])
  const off = new Set(offIds)
  /* Once each, should a product added mid read have moved a row onto the next page. */
  const seen = new Set<string>()
  return rows.filter((p) => {
    const keep = typeof p.slug === "string" && p.slug !== "" && !off.has(p.id ?? "") && !seen.has(p.slug)
    if (keep) seen.add(p.slug)
    return keep
  })
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

/** At most this many collections in one site's sitemap, a thousand per request like the products. It stopped at 200. */
const MAX_LISTED_COLLECTIONS = 10_000

/** The handles of the shop's published collections, with when each last changed, or none when they cannot be read. */
async function listedCollections(creatorId: string): Promise<{ handle: string; lastmod?: string }[]> {
  try {
    const read = (cols: string, from: number) =>
      createAdminClient()
        .from("product_collections")
        .select(cols)
        .eq("creator_id", creatorId)
        .eq("published", true)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PRODUCT_PAGE - 1)
    let cols = "slug, updated_at"
    const rows: { slug: string | null; updated_at?: string | null }[] = []
    for (let from = 0; from < MAX_LISTED_COLLECTIONS; from += PRODUCT_PAGE) {
      let { data, error } = await read(cols, from)
      /* A database without the column: the handles alone, as before. */
      if (error && from === 0) {
        cols = "slug"
        ;({ data, error } = await read(cols, from))
      }
      if (error) break
      const page = (data ?? []) as unknown as { slug: string | null; updated_at?: string | null }[]
      rows.push(...page)
      if (page.length < PRODUCT_PAGE) break
    }
    return rows
      .filter((r) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug ?? ""))
      .map((r) => ({ handle: r.slug as string, ...(r.updated_at ? { lastmod: new Date(r.updated_at).toISOString() } : {}) }))
  } catch {
    return []
  }
}

/**
 * When each published page last changed and when the site was published
 * (pageLastmod), for the sitemap's lastmod. Held with the site, cleared by a
 * publish. Nothing, never an error, when it cannot be read: the sitemap
 * still lists the pages.
 */
async function pageTimes(creatorId: string, installId: string): Promise<{ publishedAt: string | null; pages: Record<string, string> }> {
  try {
    return await unstable_cache(
      async () => {
        const admin = createAdminClient()
        const [install, rows] = await Promise.all([
          admin.from("store_theme_installs").select("published_at").eq("id", installId).maybeSingle(),
          admin.from("store_theme_pages").select("page_key, updated_at").eq("install_id", installId),
        ])
        const pages: Record<string, string> = {}
        for (const r of (rows.data ?? []) as { page_key: string; updated_at?: string | null }[]) if (r.updated_at) pages[r.page_key] = r.updated_at
        return { publishedAt: ((install.data as { published_at?: string | null } | null)?.published_at ?? null) || null, pages }
      },
      ["site-seo-page-times", installId],
      { tags: [creatorSiteTag(creatorId)], revalidate: 600 },
    )()
  } catch {
    return { publishedAt: null, pages: {} }
  }
}

/**
 * The pages a website answers with no page row of its own, as the sitemap
 * lists them (round 45). One list, so a page added to the website's routes
 * is added here, and tests/seo-sites-r45.test.ts holds every route of
 * app/(site)/w/[username] to a decision: listed here, listed with the
 * pages, products or collections, or kept out of search on purpose.
 */
export const GENERATED_PAGE_KEYS = ["collections", "reviews"] as const

async function generatedPages(
  creatorId: string,
  site: { imported: boolean; keys: Record<string, unknown>; collections: number },
): Promise<{ key: (typeof GENERATED_PAGE_KEYS)[number]; loc: (origin: string) => string; lastmod?: string }[]> {
  const out: { key: (typeof GENERATED_PAGE_KEYS)[number]; loc: (origin: string) => string; lastmod?: string }[] = []
  /* An imported theme draws /collections from its own template only (listed with the pages when it has one). */
  if (!site.imported && site.collections > 0 && !site.keys.collections) out.push({ key: "collections", loc: (o) => `${o}/collections` })
  if (!site.keys.reviews) {
    try {
      const reviews = await storefrontReviews(creatorId)
      const newest = reviews.all.items.map((r) => Date.parse(r.date)).filter((n) => Number.isFinite(n)).sort((a, b) => b - a)[0]
      if (reviews.enabled && !reviews.sample && reviews.all.summary.count > 0) out.push({ key: "reviews", loc: (o) => `${o}/reviews`, ...(newest ? { lastmod: new Date(newest).toISOString() } : {}) })
    } catch {
      /* Not listed is the answer when the reviews cannot be read. */
    }
  }
  return out
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
  /*
    A WEBSITE BEHIND A PASSWORD is not in search either: every address of it
    answers with the password page (noindex), so a sitemap of its pages
    listed addresses a crawler could never read. Its robots.txt names no
    sitemap, as for a site hidden from search (robotsTxt).
  */
  const [access, times] = await Promise.all([
    readSiteAccess(createAdminClient(), site.creatorId).catch(() => null),
    pageTimes(site.creatorId, site.installId),
  ])
  const indexable = builtSiteIndexable(site.themeSettings as Record<string, unknown>, name) && access?.enabled !== true
  const imported = !!compatOf(site.themeSettings)

  const entries: SitemapEntry[] = []
  if (indexable) {
    /* Not a page its creator kept out of search (Pages & Navigation). */
    const hidden = hiddenPages(site.themeSettings as Record<string, unknown>)
    for (const key of listedPageKeys(Object.keys(site.pages), { imported }).filter((k) => !hidden.has(k))) {
      const lastmod = pageLastmod(times.pages[key], times.publishedAt)
      entries.push({ loc: pageUrl(origin, key), ...(lastmod ? { lastmod } : {}), images: imagesOnPage(site.pages[key] ?? []) })
    }
    const products = await listedProducts(site.creatorId)
    /* The shop's own page changes when a product does: the newest product's date. */
    const newest = products.map((p) => (p.updated_at ? Date.parse(p.updated_at) : NaN)).filter((n) => Number.isFinite(n)).sort((a, b) => b - a)[0]
    /* The shop at the address it answers at: /products, or /collections/all for an imported theme (shopUrl), listed once. */
    const shop = shopUrl(origin, { imported })
    if (products.length > 0 && (imported || !site.pages.products) && !entries.some((e) => e.loc === shop)) entries.push({ loc: shop, ...(newest ? { lastmod: new Date(newest).toISOString() } : {}) })
    for (const p of products) {
      const pictures = imagesOnly([p.thumbnail_url, ...(p.gallery_urls ?? [])]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
      entries.push({
        loc: productUrl(origin, p.slug),
        ...(p.updated_at ? { lastmod: new Date(p.updated_at).toISOString() } : {}),
        images: [...new Set(pictures)].map((loc) => (p.title ? { loc, title: p.title } : { loc })),
      })
    }
    /* Each published collection's own page, /collections/<handle>: every shop can have them. */
    const collections = await listedCollections(site.creatorId)
    for (const c of collections) entries.push({ loc: `${origin}/collections/${c.handle}`, ...(c.lastmod ? { lastmod: c.lastmod } : {}) })
    /*
      AND THE PAGES EVERY WEBSITE ANSWERS WITHOUT A ROW OF ITS OWN (round 45),
      each listed while it has something on it: the collections list, once
      there is a collection (a Storelib theme draws it at /collections
      always; an imported theme's is its list-collections template, listed
      with the pages above), and the shop's reviews, while Storelib Reviews
      is on and a review is published. Both were pages that said index and
      were linked from the site, and no sitemap named them.
    */
    for (const extra of await generatedPages(site.creatorId, { imported, keys: site.pages, collections: collections.length })) {
      if (!hidden.has(extra.key) && !entries.some((e) => e.loc === extra.loc(origin))) entries.push({ loc: extra.loc(origin), ...(extra.lastmod ? { lastmod: extra.lastmod } : {}) })
    }
    /*
      THE BLOG (lib/site-blog), on both kinds of website at the same
      addresses, on the site's own origin (its connected domain): the blog,
      its live posts and its categories, unless its template is kept out of
      search (Pages & Navigation: "blog" on an imported theme, "blogs" on a
      Storelib theme). Before SQL part 353, nothing.
    */
    if (!hidden.has(imported ? "blog" : "blogs")) {
      const blog = await listedBlogEntries(site.creatorId).catch(() => null)
      for (const e of blogSitemapEntries(origin, blog)) if (!entries.some((x) => x.loc === e.loc)) entries.push(e)
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
    const imported = !!compatOf(settingsRow?.settings)
    for (const key of listedPageKeys(live.map((p) => p.page_key), { imported }).filter((k) => !hidden.has(k))) urls.push(pageUrl(origin, key))
    const products = await listedProducts(creatorId)
    if (products.length > 0) urls.push(shopUrl(origin, { imported }))
    for (const p of products) urls.push(productUrl(origin, p.slug))
  } catch {
    /* The front page is still worth telling. */
  }
  return [...new Set(urls)]
}
