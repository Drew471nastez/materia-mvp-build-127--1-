import "server-only"

/**
 * ===========================================================================
 *  EVERY SITEMAP STORELIB SERVES, READ FROM THE DATABASE
 * ===========================================================================
 * storelib.com/sitemap.xml is an index. It names:
 *
 *   /sitemap/pages.xml          the marketing pages, Explore, the Developer
 *                               Hub and the blog
 *   /sitemap/products-N.xml     every published product, at the address
 *                               every link uses: storelib.com/<handle>/<slug>
 *   /sitemap/creators-N.xml     every creator page that has earned one, and
 *                               its published OnePage
 *   /sitemap/websites-N.xml     the front page of every published website
 *                               on its storelib.com subdomain (read by
 *                               Google when storelib.com is a Domain
 *                               property in Search Console, which covers
 *                               every subdomain)
 *
 * Each N is SITEMAP_CHUNK addresses, so the index grows by a file per ten
 * thousand pages and never by a slower file. A built site's own host
 * (<name>.storelib.com or its connected domain) serves its own
 * /robots.txt and /sitemap.xml from siteSitemap below.
 *
 * The rules (what is listed, what date it carries) are lib/seo/indexing.ts.
 * A query that fails says so in the log and leaves its part out; it never
 * turns into an empty list in silence, which is how this file once listed
 * no creator pages for months.
 */

import { unstable_cache } from "next/cache"
import { siteSeo } from "@/lib/website-builder/site-seo-data"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { getLinksShareUrl, getMainDomain, getProductShareUrl } from "@/lib/url-helpers"
import { DEV_PAGES, devPath } from "@/lib/developers/pages"
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticlePath } from "@/lib/help/articles"
import { isMissingColumn } from "@/lib/custom-domains/store"
import {
  SITEMAP_CHUNK,
  creatorIndexable,
  lastmodOf,
  newestOf,
  productIndexable,
  siteOrigin,
  websiteIndexable,
  type SitemapEntry,
} from "./indexing"

export const BASE = "https://storelib.com"
const PAGE = 1000

type Admin = ReturnType<typeof createAdminClient>
type Rows<T> = { data: T[] | null; error: { message: string } | null }

/** Every row of a query, a thousand at a time, from `from` for `count` rows. */
async function readRange<T>(query: (a: number, b: number) => PromiseLike<Rows<T>>, from: number, count: number, what: string): Promise<T[]> {
  const rows: T[] = []
  for (let a = from; a < from + count; a += PAGE) {
    const b = Math.min(a + PAGE, from + count) - 1
    const { data, error } = await query(a, b)
    if (error) {
      console.error(`[sitemap] ${what} query failed:`, error.message)
      break
    }
    rows.push(...(data ?? []))
    if (!data || data.length < b - a + 1) break
  }
  return rows
}

/** user id → username, for the ids given, 500 to a query. */
async function usernames(admin: Admin, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(userIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 500) {
    /**
     * `updated_at` is NOT asked for: profiles has no such column, and asking
     * for one turns the whole answer into an error and no creator pages.
     */
    const { data: sellers, error: sellersError } = await admin
      .from("profiles")
      .select("id, username")
      .in("id", ids.slice(i, i + 500))
      .not("username", "is", null)
    if (sellersError) console.error("[sitemap] profiles query failed:", sellersError.message)
    for (const seller of (sellers || []) as { id: string; username: string }[]) out.set(seller.id, seller.username)
  }
  return out
}

async function countOf(admin: Admin, table: string, filter: (q: any) => any, what: string): Promise<number> {
  const { count, error } = await filter(admin.from(table).select("id", { count: "exact", head: true }))
  if (error) {
    console.error(`[sitemap] ${what} count failed:`, error.message)
    return 0
  }
  return count ?? 0
}

const published = (q: any) => q.eq("status", "published")

/* ── The index ─────────────────────────────────────────────────────────── */

export async function sitemapIndex(): Promise<SitemapEntry[]> {
  const admin = createAdminClient()
  const [products, creators, websites] = await Promise.all([
    countOf(admin, "products", published, "products"),
    countOf(admin, "creators", (q) => q, "creators"),
    countOf(admin, "store_theme_installs", published, "websites"),
  ])
  const chunks = (n: number) => Math.max(1, Math.ceil(n / SITEMAP_CHUNK))
  const entries: SitemapEntry[] = [{ url: `${BASE}/sitemap/pages.xml` }]
  for (let i = 0; i < chunks(products); i++) entries.push({ url: `${BASE}/sitemap/products-${i}.xml` })
  for (let i = 0; i < chunks(creators); i++) entries.push({ url: `${BASE}/sitemap/creators-${i}.xml` })
  for (let i = 0; i < chunks(websites); i++) entries.push({ url: `${BASE}/sitemap/websites-${i}.xml` })
  return entries
}

/** `pages`, `products-3`, … → what to build, or null for a name that is not one. */
export function parseSitemapName(name: string): { kind: "pages" } | { kind: "products" | "creators" | "websites"; chunk: number } | null {
  const bare = name.replace(/\.xml$/, "")
  if (bare === "pages") return { kind: "pages" }
  const m = /^(products|creators|websites)-(\d{1,6})$/.exec(bare)
  if (!m) return null
  return { kind: m[1] as "products" | "creators" | "websites", chunk: Number(m[2]) }
}

/* ── Pages ─────────────────────────────────────────────────────────────── */

const STATIC_BLOG_SLUGS = [
  "how-to-start-selling-digital-products-2026",
  "why-low-transaction-fees-matter",
  "building-an-audience-before-you-launch",
  "pricing-strategies-for-digital-products",
]

/**
 * The platform's own pages. They carry no lastmod: nothing records when a
 * marketing page last changed, and "today" on every request would be a lie
 * Google learns to ignore. Blog posts carry theirs.
 */
export async function pagesSitemap(): Promise<SitemapEntry[]> {
  // "/" is the digital-products landing and the primary URL. /pricing,
  // /features and /faq are the pages somebody comparing platforms lands on.
  const routes: SitemapEntry[] = [
    { url: BASE },
    { url: `${BASE}/pricing` },
    { url: `${BASE}/features` },
    { url: `${BASE}/explore` },
    { url: `${BASE}/blog` },
    { url: `${BASE}/faq` },
    { url: `${BASE}/signup` },
    /*
      The Storelib Developer Hub, from the same list its sidebar and
      /llms.txt read, so a page added to the hub is in the sitemap without
      anybody remembering to add it here.
    */
    ...DEV_PAGES.map((p) => ({
      url: `${BASE}${devPath(p.slug)}`,
    })),
    /*
      The Help Center, from the list its pages are built from
      (lib/help/articles), for the same reason: an article added there is
      here too. /help/search is left out on purpose; it is not indexed.
    */
    { url: `${BASE}/help` },
    ...HELP_CATEGORIES.map((c) => ({ url: `${BASE}/help/${c.slug}` })),
    ...HELP_ARTICLES.map((a) => ({ url: `${BASE}${helpArticlePath(a)}` })),
  ]

  /**
   * ONE ROW PER CATEGORY. NO SUBCATEGORY ROWS. /explore/[category] does not
   * read `?sub=`, so seventy subcategory rows would be fourteen documents.
   */
  for (const category of CATEGORIES) {
    if (category.id === "all") continue
    routes.push({ url: `${BASE}/explore/${category.id}` })
  }
  for (const category of STORELIB_CATEGORIES) {
    routes.push({ url: `${BASE}/blog/explore/categories/${categoryToSlug(category)}` })
  }
  for (const slug of STATIC_BLOG_SLUGS) {
    routes.push({ url: `${BASE}/blog/${slug}`, lastModified: "2026-02-14T00:00:00.000Z" })
  }

  const admin = createAdminClient()
  const posts = await readRange<{ slug: string; updated_at: string | null; published_at: string | null }>(
    (a, b) => admin.from("blog_posts").select("slug, updated_at, published_at").eq("is_published", true).order("slug").range(a, b),
    0,
    50_000,
    "blog",
  )
  for (const post of posts) {
    if (STATIC_BLOG_SLUGS.includes(post.slug)) continue
    routes.push({ url: `${BASE}/blog/${post.slug}`, lastModified: newestOf(post.updated_at, post.published_at) })
  }
  return routes
}

/* ── Products ──────────────────────────────────────────────────────────── */

type ProductRow = {
  slug: string
  status?: string | null
  updated_at: string | null
  creator_id: string | null
  creators?: { user_id: string | null } | { user_id: string | null }[] | null
}

/** PostgREST returns an embedded row as an object or a one-element array. */
const userIdOf = (row: ProductRow): string | null => {
  const c = Array.isArray(row.creators) ? row.creators[0] : row.creators
  return c?.user_id ?? null
}

/**
 * One chunk of published products, at storelib.com/<handle>/<slug>, the
 * address every link uses (an address that redirects spends crawl budget to
 * be sent somewhere else). The creator comes back with the product in one
 * query, and the handle from profiles.
 */
export async function productsSitemap(chunk: number): Promise<SitemapEntry[]> {
  const admin = createAdminClient()
  const rows = await readRange<ProductRow>(
    (a, b) =>
      admin
        .from("products")
        .select("slug, status, updated_at, creator_id, creators!inner(user_id)")
        .eq("status", "published")
        .order("id", { ascending: true })
        .range(a, b) as unknown as PromiseLike<Rows<ProductRow>>,
    chunk * SITEMAP_CHUNK,
    SITEMAP_CHUNK,
    "products",
  )
  const usernameByUserId = await usernames(admin, rows.map(userIdOf).filter(Boolean) as string[])
  if (rows.length > 0 && usernameByUserId.size === 0) {
    /* Every product would fall back to the old address. That is the failure
       this block used to have in silence. */
    console.error(`[sitemap] ${rows.length} products but no creator handles resolved`)
  }
  const entries: SitemapEntry[] = []
  for (const row of rows) {
    const userId = userIdOf(row)
    const username = userId ? usernameByUserId.get(userId) : undefined
    if (!productIndexable(row, username)) continue
    entries.push({ url: getProductShareUrl(username || "", row.slug), lastModified: lastmodOf(row.updated_at) })
  }
  return entries
}

/* ── Creator pages ─────────────────────────────────────────────────────── */

/**
 * SELLER STOREFRONTS, ONLY THE ONES THAT SELL SOMETHING. An account with
 * nothing published has no storefront worth crawling, which is true of a
 * link farm and of the seller who signed up and never finished. The rule is
 * `deservesIndexing`, the same one app/(marketing)/u/[username] reads for its
 * robots tag. A creator page's date is its newest published product's.
 */
export async function creatorsSitemap(chunk: number): Promise<SitemapEntry[]> {
  const admin = createAdminClient()
  const creators = await readRange<{ id: string; user_id: string | null; updated_at?: string | null }>(
    (a, b) => admin.from("creators").select("id, user_id").order("id", { ascending: true }).range(a, b),
    chunk * SITEMAP_CHUNK,
    SITEMAP_CHUNK,
    "creators",
  )
  const newestProduct = new Map<string, { n: number; at: string | null }>()
  const ids = creators.map((c) => c.id)
  for (let i = 0; i < ids.length; i += 200) {
    const products = await readRange<{ creator_id: string; updated_at: string | null }>(
      (a, b) =>
        admin
          .from("products")
          .select("creator_id, updated_at")
          .in("creator_id", ids.slice(i, i + 200))
          .eq("status", "published")
          .order("id", { ascending: true })
          .range(a, b),
      0,
      1_000_000,
      "creator products",
    )
    for (const p of products) {
      const seen = newestProduct.get(p.creator_id) ?? { n: 0, at: null }
      newestProduct.set(p.creator_id, { n: seen.n + 1, at: newestOf(seen.at, p.updated_at) })
    }
  }
  const selling = creators.filter((c) => newestProduct.has(c.id) && c.user_id)
  const usernameByUserId = await usernames(admin, selling.map((c) => c.user_id as string))
  const onePages = await publishedOnePages(admin, selling.map((c) => c.id))
  const entries: SitemapEntry[] = []
  for (const c of selling) {
    const profile = { username: usernameByUserId.get(c.user_id as string), ...newestProduct.get(c.id)! }
    // The spam verdict as well as the publication gate: a farm that files
    // one decoy listing to buy its way in still does not get in.
    if (!profile.username || !creatorIndexable({ publishedProducts: profile.n, handle: profile.username })) continue
    entries.push({ url: `${BASE}/${profile.username}`, lastModified: profile.at })
    /* Their published OnePage, under the same gate: a page of outbound
       links is exactly what a link farm signs up for. */
    if (onePages.has(c.id)) entries.push({ url: getLinksShareUrl(profile.username), lastModified: onePages.get(c.id) })
  }
  return entries
}

/** creator id → when their published OnePage last changed, for these creators. */
async function publishedOnePages(admin: Admin, creatorIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (let i = 0; i < creatorIds.length; i += 100) {
    const ids = creatorIds.slice(i, i + 100).join(",")
    const { data, error } = await admin
      .from("onepages")
      .select("creator_id, seller_id, updated_at")
      .eq("status", "published")
      .or(`creator_id.in.(${ids}),seller_id.in.(${ids})`)
    if (error) {
      console.error("[sitemap] onepages query failed:", error.message)
      return out
    }
    for (const p of (data ?? []) as { creator_id: string | null; seller_id: string | null; updated_at: string | null }[]) {
      for (const id of [p.creator_id, p.seller_id]) if (id) out.set(id, newestOf(out.get(id), p.updated_at))
    }
  }
  return out
}

/* ── Websites ──────────────────────────────────────────────────────────── */

type InstallRow = {
  id: string
  creator_id: string
  updated_at?: string | null
  published_at?: string | null
  store_theme_settings?: { settings?: Record<string, unknown> | null } | { settings?: Record<string, unknown> | null }[] | null
}

const settingsOf = (row: InstallRow) => {
  const s = Array.isArray(row.store_theme_settings) ? row.store_theme_settings[0] : row.store_theme_settings
  return s?.settings ?? null
}

/** Connected, active domains for these creators. */
async function activeDomains(admin: Admin, creatorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < creatorIds.length; i += 500) {
    const ids = creatorIds.slice(i, i + 500)
    /* Website domains only, the primary one first; a creator page domain is not the website's. */
    let { data, error } = await admin
      .from("custom_domains")
      .select("creator_id, domain, created_at, purpose, is_primary")
      .in("creator_id", ids)
      .eq("status", "active")
      .eq("purpose", "website")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
    if (error && isMissingColumn(error)) {
      ;({ data, error } = (await admin
        .from("custom_domains")
        .select("creator_id, domain, created_at")
        .in("creator_id", ids)
        .eq("status", "active")
        .order("created_at", { ascending: true })) as never)
    }
    if (error) console.error("[sitemap] custom domains query failed:", error.message)
    for (const d of (data ?? []) as { creator_id: string; domain: string }[]) if (!out.has(d.creator_id)) out.set(d.creator_id, d.domain)
  }
  return out
}

/**
 * The front page of every published website that allows indexing, at its
 * storelib.com subdomain. A site with a connected domain is canonical THERE,
 * and a storelib.com sitemap cannot speak for another domain, so those are
 * left to the domain's own /sitemap.xml.
 */
export async function websitesSitemap(chunk: number): Promise<SitemapEntry[]> {
  const admin = createAdminClient()
  const installs = await readRange<InstallRow>(
    (a, b) =>
      admin
        .from("store_theme_installs")
        .select("*, store_theme_settings(settings)")
        .eq("status", "published")
        .order("id", { ascending: true })
        .range(a, b) as unknown as PromiseLike<Rows<InstallRow>>,
    chunk * SITEMAP_CHUNK,
    SITEMAP_CHUNK,
    "websites",
  )
  const open = installs.filter((i) => websiteIndexable(settingsOf(i)))
  const creatorIds = [...new Set(open.map((i) => i.creator_id))]
  const { data: creators, error } = creatorIds.length
    ? await admin.from("creators").select("id, user_id").in("id", creatorIds)
    : { data: [], error: null }
  if (error) console.error("[sitemap] website creators query failed:", error.message)
  const userOf = new Map(((creators ?? []) as { id: string; user_id: string }[]).map((c) => [c.id, c.user_id]))
  const [names, domains] = await Promise.all([usernames(admin, [...userOf.values()]), activeDomains(admin, creatorIds)])
  const main = getMainDomain()
  const entries: SitemapEntry[] = []
  for (const i of open) {
    const handle = names.get(userOf.get(i.creator_id) ?? "")
    if (!handle || domains.has(i.creator_id)) continue
    entries.push({ url: `${siteOrigin({ handle, mainDomain: main })}/`, lastModified: newestOf(i.published_at, i.updated_at) })
  }
  return entries
}

/* ── One built site, on its own host ───────────────────────────────────── */

export interface SiteSitemap {
  /** Where the site is canonical: its connected domain, or its subdomain. */
  origin: string
  entries: SitemapEntry[]
}

/**
 * A built site's pages, as its own /sitemap.xml lists them. There is one
 * list: lib/website-builder/site-seo-data.ts reads it for the site's
 * sitemap, and this hands the same addresses to IndexNow, so the two can
 * never disagree about what a site has. Null when nothing is published.
 */
export async function siteSitemap(handle: string): Promise<SiteSitemap | null> {
  const seo = await siteSeo(handle)
  if (seo.kind !== "site") return null
  return {
    origin: seo.origin,
    entries: seo.entries.map((e) => ({ url: e.loc, lastModified: e.lastmod ?? null })),
  }
}
