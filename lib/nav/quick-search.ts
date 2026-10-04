/**
 * ===========================================================================
 *  WHAT THE SEARCH SCREEN FINDS AS YOU TYPE
 * ===========================================================================
 * The phone's full screen search (components/search/search-screen.tsx) asks
 * three questions of every word, and answers them in the order a person
 * reads them:
 *
 *   PRODUCTS     published products whose title or description says it, then
 *                published products by a creator whose name or handle says
 *                it. The header's live search has asked exactly these two
 *                questions for a year (components/platform/platform-header-
 *                client.tsx, "ONE LETTER IS A SEARCH"), on the browser's own
 *                Supabase client, which reads only what row level security
 *                lets anybody read.
 *   CREATORS     the creators those second answers belong to. Taken from
 *                products rather than asked of the creators table, so a
 *                creator is only ever offered when they have something on
 *                sale: a name that leads to an empty page is not a result.
 *   CATEGORIES   matched here, from the catalogue's own list, without a
 *                round trip, so they are on screen on the first letter.
 *
 * Enter, or "See all results", is Explore's own results (`/explore?q=`),
 * which is the page search engines index and the one this never replaces.
 *
 * AND WHAT WAS SEARCHED BEFORE, on this device only (localStorage), and only
 * with Preferences allowed in the cookie banner (lib/consent): a list you
 * can see and clear, never sent anywhere.
 */

import { hasConsent } from "@/lib/consent/client"
import { CATEGORY_NAV } from "@/lib/marketplace/categories"
import { hasCategoryPage } from "@/lib/explore/category-pages"
import { listPrice } from "@/lib/pricing/list-price"
import { getProductInternalPath, getStoreInternalPath } from "@/lib/url-helpers"
import { withPriceIntervals } from "@/lib/memberships/intervals"
import { excludingCommunityProducts } from "@/lib/communities/listing"

export type QuickProduct = {
  id: string
  title: string
  href: string
  thumb: string | null
  creator: string | null
  price: string
}
export type QuickCreator = { id: string; name: string; handle: string; href: string; avatar: string | null }
export type QuickCategory = { id: string; label: string; href: string; parent: string | null }
/** A community whose name or line says the word (only while communities are switched on). */
export type QuickCommunity = { id: string; name: string; href: string; logo: string | null; line: string }
export type QuickResults = {
  query: string
  products: QuickProduct[]
  creators: QuickCreator[]
  categories: QuickCategory[]
  communities?: QuickCommunity[]
}

/** A short list: a search screen is for finding one thing, Explore is for a page of them. */
export const PRODUCT_LIMIT = 6
export const CREATOR_LIMIT = 3
export const CATEGORY_LIMIT = 4
export const COMMUNITY_LIMIT = 3
/** Long enough to feel instant, long enough that a word typed at speed is one request. */
export const DEBOUNCE_MS = 180

/**
 * The word, made safe for a PostgREST filter string: a comma separates two
 * filters there and a parenthesis opens a group, so typing one produced a
 * malformed filter and nothing at all. `%` and `*` are wildcards to ilike.
 */
export function cleanTerm(value: string): string {
  return value.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
}

/**
 * A product or a creator opened from search is being browsed from Storelib,
 * so it opens in discover mode (lib/isDiscoverMode): the platform header and
 * the phone's tab bar stay over it, as they do from an Explore card.
 */
const discover = (href: string) => `${href}${href.includes("?") ? "&" : "?"}layout=discover`

/** The catalogue's categories and subcategories that say the word, categories first. */
export function matchCategories(query: string, limit: number = CATEGORY_LIMIT): QuickCategory[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const top: QuickCategory[] = []
  const subs: QuickCategory[] = []
  for (const c of CATEGORY_NAV) {
    if (!hasCategoryPage(c.id)) continue
    if (c.label.toLowerCase().includes(q)) top.push({ id: c.id, label: c.label, href: c.href, parent: null })
    for (const s of c.subcategories) {
      if (s.label.toLowerCase().includes(q)) subs.push({ id: `${c.id}/${s.id}`, label: s.label, href: s.href, parent: c.label })
    }
  }
  /* A label that starts with the word before one that only contains it. */
  const starts = (x: QuickCategory) => (x.label.toLowerCase().startsWith(q) ? 0 : 1)
  return [...top.sort((a, b) => starts(a) - starts(b)), ...subs.sort((a, b) => starts(a) - starts(b))].slice(0, limit)
}

type Row = {
  id: string
  title: string
  slug: string
  thumbnail_url: string | null
  price_cents: number | null
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  /** A "membership" is listed per month or year (lib/pricing/list-price). */
  type?: string | null
  price_interval?: "month" | "year"
  creators: { id?: string; user_id?: string | null; display_name: string | null; slug: string | null; username: string | null; avatar_url?: string | null } | null
}

const SELECT = `
  id, title, slug, thumbnail_url, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, type,
  creators!inner ( id, user_id, display_name, slug, username, avatar_url )
`

/**
 * `creators.slug` first: it is the column that holds the handle (the note on
 * productPath in the header says how that was found out).
 */
const handleOf = (c: Row["creators"]) => (c?.slug || c?.username || "").toLowerCase()

function toProduct(r: Row): QuickProduct {
  const handle = handleOf(r.creators)
  return {
    id: r.id,
    title: r.title,
    href: discover(getProductInternalPath(r.slug, handle || undefined)),
    thumb: r.thumbnail_url || null,
    creator: r.creators?.display_name?.trim() || null,
    price: listPrice({
      price_cents: r.price_cents ?? 0,
      compare_at_cents: r.compare_at_cents ?? null,
      pay_what_you_want: !!r.pay_what_you_want,
      pwyw_min_price_cents: r.pwyw_min_price_cents ?? null,
      type: r.type ?? null,
      price_interval: r.price_interval ?? null,
    }).main,
  }
}

/** The parts of the Supabase client this uses, so a probe can hand in its own. */
type Client = { from: (table: string) => any }

/**
 * COMMUNITIES ARE ASKED OF STORELIB, NOT OF THE DATABASE. Which communities
 * may be found (published, public, listed by their creator, not hidden by
 * Storelib) is decided by columns a visitor's key cannot read, so the
 * server answers (app/api/explore/communities, lib/communities/server/
 * explore.ts). Asked beside the products, and only while the switch is on.
 * A failure is no communities, never a broken search.
 */
async function quickCommunities(term: string): Promise<QuickCommunity[]> {
  try {
    const res = await fetch(`/api/explore/communities?q=${encodeURIComponent(term)}&limit=${COMMUNITY_LIMIT}`, { credentials: "omit" })
    if (!res.ok) return []
    const body = (await res.json()) as { items?: { id: string; name: string; url: string; logoUrl: string | null; coverUrl: string | null; memberCount: number; priceLine: string | null }[] }
    return (body.items ?? []).slice(0, COMMUNITY_LIMIT).map((c) => ({
      id: c.id,
      name: c.name,
      href: c.url,
      logo: c.logoUrl || c.coverUrl || null,
      line: [`${c.memberCount === 1 ? "1 member" : `${c.memberCount.toLocaleString("en-US")} members`}`, c.priceLine].filter(Boolean).join(" · "),
    }))
  } catch {
    return []
  }
}

/**
 * Products, creators and categories for one word, and communities while
 * they are switched on. Categories never wait for the network; the product
 * questions and the communities go out together.
 */
/** `creators: false` (the header, which lists no creators) skips asking for their photos. */
export async function quickSearch(client: Client, query: string, opts: { communities?: boolean; creators?: boolean } = {}): Promise<QuickResults> {
  const term = cleanTerm(query)
  const categories = matchCategories(term)
  if (!term) return { query, products: [], creators: [], categories }
  const communitiesAsked = opts.communities ? quickCommunities(term) : null

  /* A product that sells a community tier is a community, not a product result (lib/communities/listing). */
  const ordinary = (q: any, exclude: boolean) => (exclude ? q.is("community_id", null) : q)
  const [byText, byCreator] = await Promise.all([
    excludingCommunityProducts<{ data: Row[] | null; error: unknown }>((exclude) =>
      ordinary(client.from("products").select(SELECT).or(`title.ilike.%${term}%,description.ilike.%${term}%`).eq("status", "published"), exclude).limit(PRODUCT_LIMIT + 2),
    ),
    excludingCommunityProducts<{ data: Row[] | null; error: unknown }>((exclude) =>
      ordinary(
        client
          .from("products")
          .select(SELECT)
          .or(`display_name.ilike.%${term}%,username.ilike.%${term}%,slug.ilike.%${term}%`, { referencedTable: "creators" })
          .eq("status", "published"),
        exclude,
      ).limit(12),
    ),
  ])

  const textRows: Row[] = (byText?.data as Row[]) || []
  const creatorRows: Row[] = (byCreator?.data as Row[]) || []

  /* Titles first, then the creator's products that are not already in. */
  const seen = new Set<string>()
  const found = [...textRows, ...creatorRows]
    .filter((r) => {
      if (!r?.creators || seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
    .slice(0, PRODUCT_LIMIT)
  /* A yearly only membership says "/year"; asked only when a membership was found (lib/memberships/intervals). */
  const products = (await withPriceIntervals(client, found)).map(toProduct)

  /* The creators whose NAME said the word, once each, in the order found. */
  const byId = new Map<string, QuickCreator>()
  for (const r of creatorRows) {
    const c = r.creators
    const handle = handleOf(c)
    if (!c || !handle || byId.has(handle)) continue
    byId.set(handle, {
      id: c.id || handle,
      name: c.display_name?.trim() || handle,
      handle,
      href: discover(getStoreInternalPath(handle)),
      avatar: c.avatar_url || null,
    })
    if (byId.size >= CREATOR_LIMIT) break
  }
  const creators = [...byId.values()]

  /*
    THE PHOTO IS THE PROFILE'S. profiles.avatar_url is the one the rest of
    the site draws (the header's own note: "the single source of truth"),
    and the creators row's copy can be older. Asked for the few creators
    shown, and a failure keeps the copy rather than the search.
  */
  const userIds = creatorRows.map((r) => r.creators).filter((c) => c && byId.has(handleOf(c)) && c.user_id).map((c) => c!.user_id as string)
  if (userIds.length > 0 && opts.creators !== false) {
    try {
      const { data } = await client.from("profiles").select("id, avatar_url, display_name").in("id", [...new Set(userIds)])
      const photo = new Map<string, { avatar_url: string | null; display_name: string | null }>(((data as any[]) || []).map((p) => [p.id, p]))
      for (const r of creatorRows) {
        const c = r.creators
        const shown = c ? byId.get(handleOf(c)) : undefined
        const p = c?.user_id ? photo.get(c.user_id) : undefined
        if (shown && p) {
          if (p.avatar_url) shown.avatar = p.avatar_url
          if (p.display_name?.trim()) shown.name = p.display_name.trim()
        }
      }
    } catch {
      /* the creators row's photo stands */
    }
  }

  const communities = communitiesAsked ? await communitiesAsked : undefined
  return { query, products, creators, categories, ...(communities ? { communities } : {}) }
}

/* ── The header's short list: five, products and communities together ──── */

/**
 * ONE ROW OF THE HEADER'S DROPDOWN. A product or a community, drawn the same
 * way: a picture, a name, a line under it (who made it, or how many members
 * and the price), and a price on the right for a product.
 */
export type QuickHit =
  | { kind: "product"; id: string; title: string; href: string; thumb: string | null; line: string | null; price: string }
  | { kind: "community"; id: string; title: string; href: string; thumb: string | null; line: string; price: null }

/** The header shows five, then "View all results". */
export const TOP_LIMIT = 5

/**
 * HOW WELL A NAME SAYS THE WORD, lower is better: the name starts with it,
 * a word in the name starts with it, the name has it somewhere, or it was
 * found elsewhere (a description, the creator's name, a tagline).
 */
export function relevance(name: string, query: string): number {
  const n = name.toLowerCase()
  const q = cleanTerm(query).toLowerCase()
  if (!q) return 3
  if (n.startsWith(q)) return 0
  if (n.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 1
  if (n.includes(q)) return 2
  return 3
}

/**
 * THE FIVE MOST RELEVANT, WHATEVER THEY ARE. Products and communities are
 * ranked on the same scale (relevance above); within a rank each keeps the
 * order its own question returned it in, and the two take turns, so a page
 * of products found first can never push every community out. "e" lists
 * what starts with an e before anything that only mentions one.
 */
export function topHits(results: Pick<QuickResults, "query" | "products" | "communities">, limit: number = TOP_LIMIT): QuickHit[] {
  const q = results.query
  const pool: { hit: QuickHit; rank: number; order: number }[] = []
  results.products.forEach((p, i) => {
    pool.push({ hit: { kind: "product", id: p.id, title: p.title, href: p.href, thumb: p.thumb, line: p.creator, price: p.price }, rank: relevance(p.title, q), order: i * 2 })
  })
  ;(results.communities ?? []).forEach((c, i) => {
    pool.push({ hit: { kind: "community", id: c.id, title: c.name, href: c.href, thumb: c.logo, line: c.line, price: null }, rank: relevance(c.name, q), order: i * 2 + 1 })
  })
  return pool
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.hit)
}

/**
 * WHERE "VIEW ALL RESULTS" GOES: Explore's own results for the word, in the
 * mode the person is already browsing (communities stays communities).
 */
export function viewAllHref(query: string, mode: "products" | "communities" = "products"): string {
  const q = encodeURIComponent(query.trim())
  return mode === "communities" ? `/explore?type=communities&q=${q}` : `/explore?q=${q}`
}

/* ── What was searched before ────────────────────────────────────────────── */

export const RECENT_KEY = "storelib_recent_searches"
export const RECENT_LIMIT = 6

/** The last few searches, newest first. Nothing without Preferences, and what was kept goes when they are turned off. */
export function readRecent(): string[] {
  try {
    if (!hasConsent("preferences")) {
      localStorage.removeItem(RECENT_KEY)
      return []
    }
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.trim() !== "").slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]): string[] {
  try {
    if (!hasConsent("preferences")) return []
    if (list.length === 0) localStorage.removeItem(RECENT_KEY)
    else localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)))
  } catch {
    /* storage blocked: the list is simply not remembered */
  }
  return list.slice(0, RECENT_LIMIT)
}

/** Puts a search at the top, once, whatever case it was typed in before. */
export function addRecent(query: string): string[] {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!q) return readRecent()
  return writeRecent([q, ...readRecent().filter((s) => s.toLowerCase() !== q.toLowerCase())])
}

export function removeRecent(query: string): string[] {
  return writeRecent(readRecent().filter((s) => s !== query))
}

export function clearRecent(): string[] {
  return writeRecent([])
}
