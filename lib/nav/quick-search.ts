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
export type QuickResults = {
  query: string
  products: QuickProduct[]
  creators: QuickCreator[]
  categories: QuickCategory[]
}

/** A short list: a search screen is for finding one thing, Explore is for a page of them. */
export const PRODUCT_LIMIT = 6
export const CREATOR_LIMIT = 3
export const CATEGORY_LIMIT = 4
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
  creators: { id?: string; user_id?: string | null; display_name: string | null; slug: string | null; username: string | null; avatar_url?: string | null } | null
}

const SELECT = `
  id, title, slug, thumbnail_url, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents,
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
    }).main,
  }
}

/** The parts of the Supabase client this uses, so a probe can hand in its own. */
type Client = { from: (table: string) => any }

/**
 * Products, creators and categories for one word. Categories never wait for
 * the network; the two product questions go out together.
 */
export async function quickSearch(client: Client, query: string): Promise<QuickResults> {
  const term = cleanTerm(query)
  const categories = matchCategories(term)
  if (!term) return { query, products: [], creators: [], categories }

  const [byText, byCreator] = await Promise.all([
    client
      .from("products")
      .select(SELECT)
      .or(`title.ilike.%${term}%,description.ilike.%${term}%`)
      .eq("status", "published")
      .limit(PRODUCT_LIMIT + 2),
    client
      .from("products")
      .select(SELECT)
      .or(`display_name.ilike.%${term}%,username.ilike.%${term}%,slug.ilike.%${term}%`, { referencedTable: "creators" })
      .eq("status", "published")
      .limit(12),
  ])

  const textRows: Row[] = (byText?.data as Row[]) || []
  const creatorRows: Row[] = (byCreator?.data as Row[]) || []

  /* Titles first, then the creator's products that are not already in. */
  const seen = new Set<string>()
  const products = [...textRows, ...creatorRows]
    .filter((r) => {
      if (!r?.creators || seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
    .slice(0, PRODUCT_LIMIT)
    .map(toProduct)

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
  if (userIds.length > 0) {
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

  return { query, products, creators, categories }
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
