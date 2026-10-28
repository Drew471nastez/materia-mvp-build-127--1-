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
 *   /sitemap/creators-N.xml     every creator page that has earned one
 *
 * storelib.me/sitemap.xml is a second index, of /sitemap/onepages-N.xml:
 * the published OnePages of those same creators, at storelib.me/<handle>.
 *   /sitemap/websites-N.xml     the front page of every published website
 *                               on its storelib.com subdomain (read by
 *                               Google when storelib.com is a Domain
 *                               property in Search Console, which covers
 *                               every subdomain)
 *
 * Each N is SITEMAP_CHUNK addresses, so the index grows by a file per ten
 * thousand pages and never by a slower file. A built site's own host
 * (<name>.storelib.com or its connected domain) serves its own
 * /robots.txt and /sitemap.xml from siteSitemap below. A creator page on a
 * live domain of its own is canonical there, so neither it nor its products
 * nor its OnePage are in these files: the domain's /sitemap.xml lists them
 * (lib/seo/creator-domain.ts, liveCreatorPageDomains below).
 *
 * The rules (what is listed, what date it carries) are lib/seo/indexing.ts.
 * A query that fails is tried once more, then says so in the log and the
 * file is not served (SitemapReadFailed, a 503 from the route). It never
 * turns into an empty or a shorter list in silence, which is how this file
 * once listed no creator pages for months: a file cut short at a failure is
 * served and cached for an hour as if the rest did not exist, while a 503
 * leaves search engines the copy they already have and they ask again.
 * A table or column that arrives with a migration (website_addresses,
 * creators.banned_at) is read softly instead, because its absence is a
 * normal state. A banned creator is in none of these files
 * (lib/seo/bans.ts).
 */

import { unstable_cache } from "next/cache"
import { siteSeo } from "@/lib/website-builder/site-seo-data"
import { bannedCreatorIds, confirmedSpamUserIds } from "./bans"
import { onePageRowListable, type OnePagePresenceRow } from "@/lib/onepage/page-presence"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { getMainDomain, getProductShareUrl } from "@/lib/url-helpers"
import { onePageUrl } from "@/lib/onepage/address"
import { DEV_PAGES, devPath } from "@/lib/developers/pages"
import { publicHelpUrl } from "@/lib/help/paths"
import { helpArticlePath, helpArticlesFor, helpArticlesIn, helpCategoriesFor, helpImages } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { isMissingColumn, isMissingTable } from "@/lib/custom-domains/store"
import { communitiesEnabled } from "@/lib/communities/flag"
import { missingColumnError } from "@/lib/communities/listing"
import { sitemapCommunities, sitemapCommunityCount } from "@/lib/communities/server/public"
import {
  SITEMAP_CHUNK,
  builtSiteIndexable,
  creatorIndexable,
  lastmodOf,
  newestOf,
  onePageIndexable,
  productIndexable,
  siteOrigin,
  websiteIndexable,
  type SitemapEntry,
} from "./indexing"
import { imagesOnly } from "@/lib/media/video"


/** A /help/... path at the Help Center's own address. */
const helpUrl = (path: string) => {
  const url = publicHelpUrl(path.slice("/help".length) || "/")
  return url.startsWith("http") ? url : `${BASE}${url}`
}

export const BASE = "https://storelib.com"
/**
 * Rows per request. PostgREST answers at most `max_rows` rows whatever range
 * is asked for, 1,000 on Supabase unless configured otherwise, so a page
 * must not be larger than that: a short page is read as the end of the table.
 */
const PAGE = 1000
/**
 * Ids per `.in()` query. They travel in the request's URL, and a gateway
 * refuses a request line much past 8 KB; 150 UUIDs, encoded, are under 6 KB.
 * The website sitemap once sent every creator of a chunk, up to ten thousand,
 * in one URL, and a refused request listed no websites at all.
 */
export const IDS_PER_QUERY = 150

type Admin = ReturnType<typeof createAdminClient>
type Rows<T> = { data: T[] | null; error: { message: string } | null }

/** A read failed twice. The route answers 503 rather than a file cut short. */
export class SitemapReadFailed extends Error {}

/**
 * What a sitemap route answers when a read failed. 503 with Retry-After is
 * "come back later" to a crawler, which keeps the copy it has, and nothing
 * holds the answer: the next request reads again.
 */
export function sitemapUnavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "600", "Cache-Control": "no-store" },
  })
}

/** A query's rows, tried twice before the whole file is given up on. */
async function rowsOf<T>(query: () => PromiseLike<Rows<T>>, what: string): Promise<T[]> {
  let { data, error } = await query()
  /* Once more: most failures here are a blip, and a blip should not cost a file. */
  if (error) ({ data, error } = await query())
  if (error) {
    console.error(`[sitemap] ${what} query failed:`, error.message)
    throw new SitemapReadFailed(what)
  }
  return data ?? []
}

/** Every row of a query, a thousand at a time, from `from` for `count` rows. Exported so a test can drive it. */
export async function readRange<T>(query: (a: number, b: number) => PromiseLike<Rows<T>>, from: number, count: number, what: string): Promise<T[]> {
  const rows: T[] = []
  for (let a = from; a < from + count; a += PAGE) {
    const b = Math.min(a + PAGE, from + count) - 1
    const data = await rowsOf(() => query(a, b), what)
    rows.push(...data)
    if (data.length < b - a + 1) break
  }
  return rows
}

/**
 * `work` over the ids, IDS_PER_QUERY at a time and four queries in flight at
 * once, so a chunk of ten thousand creators is not a hundred round trips in a
 * line. The answers come back in the order of the batches. Exported so a
 * test can drive it.
 */
export async function eachBatch<T>(ids: string[], work: (batch: string[]) => Promise<T>, size = IDS_PER_QUERY): Promise<T[]> {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size))
  const out: T[] = new Array(batches.length)
  let next = 0
  const lane = async () => {
    while (next < batches.length) {
      const i = next++
      out[i] = await work(batches[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, lane))
  return out
}

type Seller = { username: string; avatar_url: string | null }

/** user id → handle and avatar, for the ids given. */
async function sellers(admin: Admin, userIds: string[]): Promise<Map<string, Seller>> {
  const out = new Map<string, Seller>()
  const ids = [...new Set(userIds.filter(Boolean))]
  const found = await eachBatch(ids, (batch) =>
    rowsOf<{ id: string } & Seller>(
      /**
       * `updated_at` is NOT asked for: profiles has no such column, and asking
       * for one turns the whole answer into an error and no creator pages.
       */
      () => admin.from("profiles").select("id, username, avatar_url").in("id", batch).not("username", "is", null),
      "profiles",
    ),
  )
  for (const seller of found.flat()) out.set(seller.id, { username: seller.username, avatar_url: seller.avatar_url ?? null })
  return out
}

/** user id → username, for the ids given. */
async function usernames(admin: Admin, userIds: string[]): Promise<Map<string, string>> {
  return new Map([...(await sellers(admin, userIds))].map(([id, s]) => [id, s.username]))
}

async function countOf(admin: Admin, table: string, filter: (q: any) => any, what: string): Promise<number> {
  let { count, error } = await filter(admin.from(table).select("id", { count: "exact", head: true }))
  if (error) ({ count, error } = await filter(admin.from(table).select("id", { count: "exact", head: true })))
  if (error) {
    /* A count of nothing would drop every chunk after the first from the index. */
    console.error(`[sitemap] ${what} count failed:`, error.message)
    throw new SitemapReadFailed(what)
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
  /*
    COMMUNITIES, while they are switched on and there are some to list: the
    published public ones (lib/communities/server/public.ts). Counted softly,
    because before part 81 there is no table and that is a normal state, not
    a failed read.
  */
  const communities = (await communitiesEnabled()) ? await sitemapCommunityCount(admin) : 0
  if (communities > 0) for (let i = 0; i < chunks(communities); i++) entries.push({ url: `${BASE}/sitemap/communities-${i}.xml` })
  return entries
}

/**
 * `pages`, `products-3`, … → what to build, or null for a name that is not one.
 * `onepages` is storelib.me's index and `onepages-N` its files: the proxy
 * sends storelib.me/sitemap.xml to /sitemap/onepages.xml.
 */
export function parseSitemapName(
  name: string,
): { kind: "pages" } | { kind: "onepages-index" } | { kind: "products" | "creators" | "websites" | "onepages" | "communities"; chunk: number } | null {
  const bare = name.replace(/\.xml$/, "")
  if (bare === "pages") return { kind: "pages" }
  if (bare === "onepages") return { kind: "onepages-index" }
  const m = /^(products|creators|websites|onepages|communities)-(\d{1,6})$/.exec(bare)
  if (!m) return null
  return { kind: m[1] as "products" | "creators" | "websites" | "onepages" | "communities", chunk: Number(m[2]) }
}

/* ── Communities ───────────────────────────────────────────────────────── */

/**
 * One chunk of published public communities, at storelib.com/community/<slug>,
 * with the cover as their picture. Empty while communities are switched off
 * (their pages are 404s then) and before part 81.
 */
export async function communitiesSitemap(chunk: number): Promise<SitemapEntry[]> {
  if (!(await communitiesEnabled())) return []
  const admin = createAdminClient()
  const [rows, banned] = await Promise.all([sitemapCommunities(chunk * SITEMAP_CHUNK, SITEMAP_CHUNK, admin), bannedCreatorIds(admin)])
  /* Round 41: a banned creator's community is not listed, as their pages are not. */
  return rows.filter((r) => !r.creator_id || !banned.has(r.creator_id)).map((r) => ({ url: `${BASE}/community/${r.slug}`, lastModified: lastmodOf(r.updated_at), images: [r.cover_url] }))
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
  /* The physical products guide is listed only while physical commerce is on. */
  const physicalGuide = await isPhysicalCommerceEnabled()
  // "/" is the digital-products landing and the primary URL. /pricing,
  // /features and /faq are the pages somebody comparing platforms lands on.
  const routes: SitemapEntry[] = [
    { url: BASE },
    { url: `${BASE}/pricing` },
    { url: `${BASE}/features` },
    { url: `${BASE}/explore` },
    /* Explore's communities, while they are switched on. */
    ...((await communitiesEnabled()) ? [{ url: `${BASE}/explore?type=communities` }] : []),
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
    /* At help.storelib.com, where the Help Center lives (lib/help/paths publicHelpUrl). */
    { url: helpUrl("/help") },
    { url: helpUrl("/help/questions") },
    ...helpCategoriesFor(physicalGuide).map((c) => ({ url: helpUrl(`/help/${c.slug}`), lastModified: newestOf(...helpArticlesIn(c.slug).map((a) => a.updated)) })),
    /* Each article with the day it was last checked against the product, and its screenshots for Google Images. */
    ...helpArticlesFor(physicalGuide).map((a) => ({ url: helpUrl(helpArticlePath(a)), lastModified: a.updated ?? null, images: helpImages(a).map((src) => `${BASE}${src}`) })),
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
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
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
  /*
    A product that sells a community tier answers with a redirect to its
    community, which has its own file: it is left out here once the column
    exists (lib/communities/listing). Asked once, softly, for the chunk.
  */
  const probe = await admin.from("products").select("community_id").limit(1)
  const skipCommunity = !(probe.error && missingColumnError(probe.error))
  const rows = await readRange<ProductRow>(
    (a, b) => {
      let q = admin
        .from("products")
        .select("slug, status, updated_at, creator_id, thumbnail_url, gallery_urls, creators!inner(user_id)")
        .eq("status", "published")
        /* Physical products are the creator's own website's, never the marketplace's (lib/seo/creator-domain lists them there). */
        .neq("type", "physical")
      if (skipCommunity) q = q.is("community_id", null)
      return q.order("id", { ascending: true }).range(a, b) as unknown as PromiseLike<Rows<ProductRow>>
    },
    chunk * SITEMAP_CHUNK,
    SITEMAP_CHUNK,
    "products",
  )
  const [usernameByUserId, banned, ownDomain, spam] = await Promise.all([
    usernames(admin, rows.map(userIdOf).filter(Boolean) as string[]),
    bannedCreatorIds(admin),
    liveCreatorPageDomains(admin, [...new Set(rows.map((r) => r.creator_id).filter(Boolean) as string[])]),
    confirmedSpamUserIds(admin),
  ])
  if (rows.length > 0 && usernameByUserId.size === 0) {
    /* Every product would fall back to the old address. That is the failure
       this block used to have in silence. */
    console.error(`[sitemap] ${rows.length} products but no creator handles resolved`)
  }
  const entries: SitemapEntry[] = []
  for (const row of rows) {
    const userId = userIdOf(row)
    const username = userId ? usernameByUserId.get(userId) : undefined
    /* Banned: the ban took it down, and republishing it does not put it back here. */
    if (!productIndexable(row, username, userId && spam.has(userId) ? "confirmed" : null) || (row.creator_id && banned.has(row.creator_id))) continue
    /* Canonical on its creator page's own domain, and listed by that domain's sitemap (lib/seo/creator-domain.ts). */
    if (row.creator_id && ownDomain.has(row.creator_id)) continue
    entries.push({
      url: getProductShareUrl(username || "", row.slug),
      lastModified: lastmodOf(row.updated_at),
      /* Its pictures, so Google Images finds a product by what it looks like. */
      images: imagesOnly([row.thumbnail_url, ...(row.gallery_urls ?? [])]),
    })
  }
  return entries
}

/* ── Creator pages ─────────────────────────────────────────────────────── */

/**
 * SELLER STOREFRONTS, ONLY THE ONES THAT SELL SOMETHING. An account with
 * nothing published has an empty shop, which is not a page worth a search
 * result. Any published product counts, a physical one too (round 41: this
 * file counted only the others while the page's robots tag counted all, so
 * a seller of physical goods said index and was never listed). The rule is
 * creatorIndexable, the one app/(marketing)/u/[username] reads for its
 * robots tag. A creator page's date is its newest published product's.
 */
export async function creatorsSitemap(chunk: number): Promise<SitemapEntry[]> {
  return (await creatorChunk(chunk)).creators
}

/**
 * ONE FILE OF storelib.me's SITEMAP: the published OnePages of the same
 * chunk of creators, at storelib.me/<handle> (lib/onepage/address). Round 41:
 * every published OnePage that shows something and has no sensitive link,
 * whether or not its owner sells anything, under the same rules its robots
 * tag reads (onePageIndexable, lib/onepage/page-presence onePageRowListable).
 * storelib.com's own files do not list a OnePage: its address is on another
 * host, and storelib.me/sitemap.xml names these (app/sitemap/[name], proxy.ts).
 */
export async function onePagesSitemap(chunk: number): Promise<SitemapEntry[]> {
  return (await creatorChunk(chunk)).onePages
}

/** How many onepages-N.xml files storelib.me's index names: one per chunk of creators, as creators-N.xml. */
export async function onePagesSitemapIndex(origin: string): Promise<SitemapEntry[]> {
  const admin = createAdminClient()
  const creators = await countOf(admin, "creators", (q) => q, "creators")
  const chunks = Math.max(1, Math.ceil(creators / SITEMAP_CHUNK))
  return Array.from({ length: chunks }, (_, i) => ({ url: `${origin}/sitemap/onepages-${i}.xml` }))
}

/** The rows of one chunk, for a test to drive the rule without a database. */
export interface CreatorChunkRows {
  creators: { id: string; user_id: string | null; cover_url?: string | null }[]
  /** creator id → how many published products (any type) and the newest one's date */
  products: Map<string, { n: number; at: string | null }>
  sellers: Map<string, Seller>
  /** creator id → its published OnePage's date, for a page that is listable (onePageRowListable) */
  onePages: Map<string, string | null>
  banned: Set<string>
  ownDomain: Set<string>
  /** user ids an operator confirmed as spam */
  spam: Set<string>
}

/**
 * The rule, pure: which creator pages and which OnePages a chunk lists.
 * A banned creator, a confirmed spammer and a page canonical on its own
 * domain list neither; a handle the spam score refuses lists neither.
 */
export function creatorChunkEntries(rows: CreatorChunkRows, onePageAddress: (handle: string) => string = onePageUrl): { creators: SitemapEntry[]; onePages: SitemapEntry[] } {
  const creators: SitemapEntry[] = []
  const onePages: SitemapEntry[] = []
  for (const c of rows.creators) {
    if (!c.user_id || rows.banned.has(c.id) || rows.ownDomain.has(c.id)) continue
    const spamState = rows.spam.has(c.user_id) ? ("confirmed" as const) : null
    const seller = rows.sellers.get(c.user_id)
    const handle = seller?.username
    if (!handle) continue
    const sold = rows.products.get(c.id)
    if (sold && creatorIndexable({ publishedProducts: sold.n, handle, spamState })) {
      /* The face and the cover the page opens with. */
      creators.push({ url: `${BASE}/${handle}`, lastModified: sold.at, images: [seller?.avatar_url, c.cover_url] })
    }
    if (rows.onePages.has(c.id) && onePageIndexable({ status: "published", handle, spamState })) {
      onePages.push({ url: onePageAddress(handle), lastModified: rows.onePages.get(c.id) })
    }
  }
  return { creators, onePages }
}

async function creatorChunk(chunk: number): Promise<{ creators: SitemapEntry[]; onePages: SitemapEntry[] }> {
  const admin = createAdminClient()
  const creators = await readRange<{ id: string; user_id: string | null; cover_url?: string | null }>(
    (a, b) => admin.from("creators").select("id, user_id, cover_url").order("id", { ascending: true }).range(a, b),
    chunk * SITEMAP_CHUNK,
    SITEMAP_CHUNK,
    "creators",
  )
  const products = new Map<string, { n: number; at: string | null }>()
  const ids = creators.map((c) => c.id)
  const batches = await eachBatch(ids, (batch) =>
    readRange<{ creator_id: string; updated_at: string | null }>(
      (a, b) =>
        admin
          .from("products")
          .select("creator_id, updated_at")
          .in("creator_id", batch)
          .eq("status", "published")
          .order("id", { ascending: true })
          .range(a, b),
      0,
      1_000_000,
      "creator products",
    ),
  )
  for (const p of batches.flat()) {
    const seen = products.get(p.creator_id) ?? { n: 0, at: null }
    products.set(p.creator_id, { n: seen.n + 1, at: newestOf(seen.at, p.updated_at) })
  }
  const [banned, ownDomain, spam] = await Promise.all([bannedCreatorIds(admin), liveCreatorPageDomains(admin, ids), confirmedSpamUserIds(admin)])
  const open = creators.filter((c) => c.user_id && !banned.has(c.id) && !ownDomain.has(c.id))
  const [sellerByUserId, onePages] = await Promise.all([
    sellers(admin, open.map((c) => c.user_id as string)),
    publishedOnePages(admin, open.map((c) => c.id)),
  ])
  return creatorChunkEntries({ creators, products, sellers: sellerByUserId, onePages, banned, ownDomain, spam })
}

/** creator id → when their published OnePage last changed, for these creators, when the page is one to list (onePageRowListable). */
async function publishedOnePages(admin: Admin, creatorIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const now = Date.now()
  /* Half a batch: each id is in the URL twice, once per column. */
  const found = await eachBatch(
    creatorIds,
    (batch) =>
      readRange<{ creator_id: string | null; seller_id: string | null; updated_at: string | null } & OnePagePresenceRow>(
        (a, b) =>
          admin
            .from("onepages")
            .select("creator_id, seller_id, updated_at, bio, social_links, published_blocks, draft_blocks, published_profile, published_social_links")
            .eq("status", "published")
            .or(`creator_id.in.(${batch.join(",")}),seller_id.in.(${batch.join(",")})`)
            .order("id", { ascending: true })
            .range(a, b),
        0,
        1_000_000,
        "onepages",
      ),
    IDS_PER_QUERY / 2,
  )
  for (const p of found.flat()) {
    if (!onePageRowListable(p, now)) continue
    for (const id of [p.creator_id, p.seller_id]) if (id) out.set(id, newestOf(out.get(id), p.updated_at))
  }
  return out
}

/**
 * The creators, of these, whose creator page is served on its own domain:
 * a primary creator page domain that is active, the same rule the page's
 * canonical reads (lib/custom-domains/store.ts primaryHostOf). Their page,
 * products and OnePage are canonical on that domain, so storelib.com's
 * sitemap leaves them to the domain's own /sitemap.xml; a sitemap listing
 * an address whose page names another as canonical is a duplicate Google
 * has to sort out.
 *
 * Before the purpose columns exist (run-now part 22), or the table, no
 * domain is a creator page's and nothing is left out: exactly as before.
 */
export async function liveCreatorPageDomains(admin: Admin, creatorIds: string[]): Promise<Set<string>> {
  const found = await eachBatch(creatorIds, async (batch) => {
    const query = () =>
      admin
        .from("custom_domains")
        .select("creator_id, domain")
        .in("creator_id", batch)
        .eq("status", "active")
        .eq("purpose", "creator_page")
        .eq("is_primary", true)
    const first = await query()
    if (!first.error) return (first.data ?? []) as { creator_id: string }[]
    if (isMissingColumn(first.error) || isMissingTable(first.error)) return []
    return rowsOf<{ creator_id: string }>(query, "creator page domains")
  })
  return new Set(found.flat().map((d) => d.creator_id))
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
  /*
    Strict: without it a site that lives on its own domain would be listed at
    a subdomain that is not its canonical. Website domains only, the primary
    one first; a creator page domain is not the website's. Before the purpose
    column exists (run-now part 22) every active domain, as it was.
  */
  const found = await eachBatch(creatorIds, async (batch) => {
    const byPurpose = () =>
      admin
        .from("custom_domains")
        .select("creator_id, domain, created_at, purpose, is_primary")
        .in("creator_id", batch)
        .eq("status", "active")
        .eq("purpose", "website")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
    const first = await byPurpose()
    if (!first.error) return (first.data ?? []) as { creator_id: string; domain: string }[]
    if (!isMissingColumn(first.error)) return rowsOf<{ creator_id: string; domain: string }>(byPurpose, "custom domains")
    return rowsOf<{ creator_id: string; domain: string }>(
      () =>
        admin
          .from("custom_domains")
          .select("creator_id, domain, created_at")
          .in("creator_id", batch)
          .eq("status", "active")
          .order("created_at", { ascending: true }),
      "custom domains",
    )
  })
  for (const d of found.flat()) if (!out.has(d.creator_id)) out.set(d.creator_id, d.domain)
  return out
}

/**
 * creator id → the name their website was given in Website Settings ›
 * Domains, where one was. The site is canonical at that name
 * (lib/website-builder/site-seo-data.ts siteOrigin), so that is the address
 * listed. Soft: until RUN_WEBSITE_ADDRESSES.sql has run there is no table,
 * and every website is at its creator's username, as it always was.
 */
async function websiteNames(admin: Admin, creatorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const found = await eachBatch(creatorIds, async (batch) => {
      const { data, error } = await admin.from("website_addresses").select("creator_id, handle").in("creator_id", batch)
      return error ? [] : ((data ?? []) as { creator_id: string; handle: string | null }[])
    })
    for (const w of found.flat()) if (w.handle) out.set(w.creator_id, w.handle)
  } catch {
    /* No table yet: usernames it is. */
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
  const [banned, spam] = await Promise.all([bannedCreatorIds(admin), confirmedSpamUserIds(admin)])
  const open = installs.filter((i) => websiteIndexable(settingsOf(i)) && !banned.has(i.creator_id))
  const creatorIds = [...new Set(open.map((i) => i.creator_id))]
  /*
    IN BATCHES. This was one `.in("id", …)` naming every creator in the chunk,
    up to ten thousand ids in a single URL, which a gateway refuses; and even
    answered it would have been cut to the first thousand rows. A refusal was
    logged and the file listed no websites at all.
  */
  const creators = await eachBatch(creatorIds, (batch) =>
    rowsOf<{ id: string; user_id: string }>(() => admin.from("creators").select("id, user_id").in("id", batch), "website creators"),
  )
  const userOf = new Map(creators.flat().map((c) => [c.id, c.user_id]))
  const [names, domains, chosen] = await Promise.all([
    usernames(admin, [...userOf.values()]),
    activeDomains(admin, creatorIds),
    websiteNames(admin, creatorIds),
  ])
  const main = getMainDomain()
  const entries: SitemapEntry[] = []
  for (const i of open) {
    /* The name the site was given, else its creator's username: the host it is canonical at. */
    const handle = chosen.get(i.creator_id) ?? names.get(userOf.get(i.creator_id) ?? "")
    /* The site's own rule, word for word: its switch, and not a farm's handle (siteSeo reads the same). */
    const owner = userOf.get(i.creator_id)
    if (!handle || domains.has(i.creator_id) || !builtSiteIndexable(settingsOf(i), handle, owner && spam.has(owner) ? "confirmed" : null)) continue
    entries.push({ url: `${siteOrigin({ handle, mainDomain: main })}/`, lastModified: newestOf(i.published_at, i.updated_at) })
  }
  return entries
}

/**
 * EVERY PUBLISHED WEBSITE'S ADDRESS, FOR WARMING THE CACHE AFTER A DEPLOY.
 *
 * A new deployment starts with an empty page cache, so the first visitor to
 * each page of each site waited for it to be drawn (0.5 to 1.6 s to the first
 * byte, measured on five sites right after a deploy, against about 0.2 s once
 * held). lib/website-builder/warm-sites.ts asks for these pages once per
 * deploy so a visitor does not. Unlike the sitemap this keeps sites on their
 * own domain (at that domain, the host a visitor uses) and sites not open to
 * search engines, since both still get visitors. Banned creators are left out.
 */
export async function publishedWebsiteOrigins(from: number, count: number): Promise<{ origins: string[]; read: number }> {
  const admin = createAdminClient()
  const installs = await readRange<{ creator_id: string }>(
    (a, b) =>
      admin
        .from("store_theme_installs")
        .select("creator_id")
        .eq("status", "published")
        .order("id", { ascending: true })
        .range(a, b) as unknown as PromiseLike<Rows<{ creator_id: string }>>,
    from,
    count,
    "warm websites",
  )
  const banned = await bannedCreatorIds(admin)
  const creatorIds = [...new Set(installs.map((i) => i.creator_id).filter((id) => !banned.has(id)))]
  const creators = await eachBatch(creatorIds, (batch) =>
    rowsOf<{ id: string; user_id: string }>(() => admin.from("creators").select("id, user_id").in("id", batch), "warm website creators"),
  )
  const userOf = new Map(creators.flat().map((c) => [c.id, c.user_id]))
  const [names, domains, chosen] = await Promise.all([
    usernames(admin, [...userOf.values()]),
    activeDomains(admin, creatorIds),
    websiteNames(admin, creatorIds),
  ])
  const main = getMainDomain()
  const origins: string[] = []
  for (const id of creatorIds) {
    const domain = domains.get(id)
    if (domain) {
      origins.push(`https://${domain}`)
      continue
    }
    const handle = chosen.get(id) ?? names.get(userOf.get(id) ?? "")
    if (handle) origins.push(siteOrigin({ handle, mainDomain: main }))
  }
  return { origins, read: installs.length }
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
