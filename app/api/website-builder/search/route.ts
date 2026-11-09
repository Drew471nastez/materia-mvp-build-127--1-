import { NextRequest, NextResponse } from "next/server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { createAdminClient } from "@/lib/supabase/admin"
import { productMatchesQuery } from "@/lib/website-builder/shop-page"
import { toCard } from "@/lib/website-builder/shop-products"
import { offChannel } from "@/lib/store/channel-filter"
import { unstable_cache } from "next/cache"
import { LIMITS, addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { creatorSiteTag } from "@/lib/website-builder/published-site"
import { blogFor } from "@/lib/site-blog/public-read"
import { matchPagesAndPosts, mergeResults, searchablePages, type SearchablePage, type SearchablePost } from "@/lib/website-builder/site-search"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  SEARCH AS YOU TYPE, ON A CREATOR'S SITE
 * ===========================================================================
 * The header's field shows what matches while the visitor is still typing,
 * the way the themes people are used to do, and this is what it asks.
 *
 * SAME HOST, NO SESSION. A built site runs on its own subdomain or domain,
 * and `/api/…` there is served on that host rather than rewritten to a page
 * of the site, so the field can ask without leaving and without any
 * cross-origin permission. Nothing here needs to know who is asking.
 *
 * THE SAME QUESTION THE SEARCH PAGE ANSWERS. `productMatchesQuery` is what
 * /search filters with, so a word that finds something here finds the same
 * thing there, and "View all" never shows fewer than the dropdown did.
 *
 * PUBLIC BY DESIGN, and therefore bounded: the creator is named by id and
 * must exist, the query is capped, only published products are read, only
 * the fields a card draws are returned, and a shop's catalogue is at most a
 * few dozen rows. A pattern that refuses input rather than escaping it is
 * not needed because nothing here goes into a query as text.
 *
 * THE WHOLE SITE, FOR A SEARCH WINDOW OF THE SITE'S OWN (round N,
 * data-storelib-search-panel in lib/website-builder/storefront-hooks.ts):
 * `kinds=all` adds this creator's live pages and live blog posts to the
 * products, each result with its `kind`. Without it the answer is the
 * products alone, exactly what the built-in window has always read.
 *
 * LIMITED PER ADDRESS, before the database is asked (LIMITS.siteSearch,
 * counted in memory first like the other public reads: a person typing asks
 * a few times a word).
 */

const MAX_QUERY = 80
const MAX_RESULTS = 6
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The live pages of this creator's published website, as a search finds
 * them. Held with the site (creatorSiteTag: a publish clears it), read by
 * the creator's id and nothing else.
 */
function livePages(admin: ReturnType<typeof createAdminClient>, creatorId: string): Promise<SearchablePage[]> {
  return unstable_cache(
    async () => {
      const { data: install } = await admin
        .from("store_theme_installs")
        .select("id, store_theme_settings ( settings )")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()
      const row = install as { id?: string; store_theme_settings?: unknown } | null
      if (!row?.id) return []
      const settingsRow = Array.isArray(row.store_theme_settings) ? row.store_theme_settings[0] : row.store_theme_settings
      const settings = ((settingsRow as { settings?: unknown } | null)?.settings ?? null) as Record<string, unknown> | null
      const { data: pages } = await admin.from("store_theme_pages").select("page_key, sections").eq("install_id", row.id)
      /* Published sections only: a page never published is not a page a visitor can open. */
      const live = ((pages ?? []) as { page_key: string; sections: unknown }[]).filter((p) => Array.isArray(p.sections) && p.sections.length > 0).map((p) => p.page_key)
      return searchablePages(live, settings)
    },
    ["site-search-pages", creatorId],
    { tags: [creatorSiteTag(creatorId)], revalidate: 300 },
  )()
}

/** The live posts of this creator's blog (lib/site-blog, held under its own tag). */
async function livePosts(creatorId: string): Promise<SearchablePost[]> {
  const blog = await blogFor(creatorId).catch(() => null)
  return (blog?.cards ?? []).map((c) => ({ title: c.title, path: c.path, excerpt: c.excerpt, coverImageUrl: c.coverImageUrl, category: c.category?.name ?? null, tags: c.tags }))
}

export async function GET(req: NextRequest) {
  /* A person typing asks a few times a word; a script walking every shop asks hundreds (lib/api/rate-limit siteSearch, counted in memory first). */
  const limited = await rateLimit({ bucket: "site-search", subjects: [addressSubject(req)], windows: LIMITS.siteSearch, memoryFirst: true, message: "That is a lot of searches at once. Try again in a moment." })
  if (limited) return limited
  const everything = req.nextUrl.searchParams.get("kinds") === "all"
  let creatorId = (req.nextUrl.searchParams.get("creator") ?? "").trim()
  const installId = (req.nextUrl.searchParams.get("install") ?? "").trim()
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, MAX_QUERY).trim()

  const admin = createAdminClient()

  /*
    THE EDITOR ASKS BY INSTALL. A published site knows its creator; the
    builder's canvas knows which theme install it is drawing, and that is
    enough: the install names its creator. Resolved here so the canvas never
    has to be told a creator id, and so the answer inside the editor is the
    same shop the published site searches.
  */
  if (!UUID.test(creatorId) && UUID.test(installId)) {
    const { data: install } = await admin
      .from("store_theme_installs")
      .select("creator_id")
      .eq("id", installId)
      .maybeSingle()
    creatorId = typeof install?.creator_id === "string" ? install.creator_id : ""
  }

  if (!UUID.test(creatorId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  if (!q) {
    return NextResponse.json({ items: [], total: 0 }, { headers: { "Cache-Control": "public, max-age=30" } })
  }

  const { data, error } = await admin
    .from("products")
    .select("id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, description, category")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .limit(200)

  if (error) {
    console.error("[site search] read failed:", error.message)
    return NextResponse.json({ error: "Could not search" }, { status: 500 })
  }

  /* Settings › Sales channels: a product taken off the Online store is not found by its search. */
  const [offStore, store] = await Promise.all([offChannel(admin, creatorId, "storefront"), readStoreCurrency(admin, creatorId)])
  const matches = (data ?? []).filter((p) => !offStore.has(String(p.id)) && productMatchesQuery(p, q))
  const products = matches.slice(0, MAX_RESULTS).map((row) => {
    const card = toCard(row, [], [], store.currency)
    return {
      kind: "product" as const,
      id: card.id,
      title: card.settings.title,
      price: card.settings.price,
      image: card.settings.image,
      url: card.settings.url,
    }
  })
  if (!everything) {
    return NextResponse.json(
      { items: products, total: matches.length },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    )
  }

  /* Pages and posts too, this creator's only; a read that fails leaves its kind out rather than failing the search. */
  const [pages, posts] = await Promise.all([livePages(admin, creatorId).catch(() => []), livePosts(creatorId).catch(() => [])])
  const rest = matchPagesAndPosts(q, pages, posts)
  const items = mergeResults(products, rest)
  return NextResponse.json(
    { items, total: matches.length + rest.length },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  )
}
