import "server-only"

/**
 * ===========================================================================
 *  FINDING A COMMUNITY: /explore/communities, EXPLORE'S SEARCH, QUICK SEARCH
 * ===========================================================================
 * Only what is meant to be found: published, public, discovery left on by
 * its creator, not hidden by Storelib, not suspended, archived or deleted.
 * Unlisted and private communities are reachable by their address and never
 * listed here.
 *
 * KEYSET PAGES, NOT OFFSETS. A page is the next `limit` rows after the last
 * one shown, by the sort's own column and then the id, so the hundredth page
 * costs what the first does and a community that joins the list while
 * somebody scrolls does not push a card onto the next page twice. The cursor
 * is opaque to the browser: base64url of the last row's sort value and id.
 *
 *   trending   trending_score (the trending job's number), then id
 *   popular    member_count (active members, trigger kept), then id
 *   new        created_at, then id
 *
 * SEARCH is the name and the tagline, case blind (ilike), as the ARCH says is
 * fine at this size. The word is cleaned the way quick search cleans it, so a
 * comma or a parenthesis cannot break the filter.
 *
 * CATEGORY is one of the ids Explore's pills use (lib/marketplace/
 * categories), which is what the creator picks in Settings, Page. PRICE is
 * the way in: "free" is a community anyone may join for nothing, "paid" one
 * that asks for a payment or a product. Both are plain equality filters, so
 * they sit beside the search and the cursor without touching either.
 * Freebies, which is a price and not a subject, is the free ones.
 *
 * SUBCATEGORY (round 8: Explore's More picker has the whole tree in
 * communities mode too). A community stores one category id and never a
 * subcategory, so a subcategory is read as its parent category, narrowed to
 * the communities whose name, tagline or description has the subcategory's
 * words (the same words the products are matched by, lib/explore/
 * subcategory-match). When none in the category has them, the first page is
 * the whole category instead, flagged `broadened`, and the page says so; the
 * next pages are asked for without the subcategory.
 *
 * VIEWS (part 87) are read when the column is there; before the part has
 * run the same page is read without them and the cards leave the eye out.
 */
import { CATEGORY_NAV, VALID_CATEGORY_IDS } from "@/lib/marketplace/categories"
import { subcategoryTerms } from "@/lib/explore/subcategory-match"
import type { CommunityCard } from "../types"
import { CARD_COLUMNS, cardsFor, type CardRow } from "./public"
import { admin, missing, reasonOf, type Db } from "./db"

export const EXPLORE_SORTS = ["trending", "popular", "new"] as const
export type ExploreSort = (typeof EXPLORE_SORTS)[number]

export const EXPLORE_PAGE = 24
export const EXPLORE_MAX_PAGE = 48

const SORT_COLUMN: Record<ExploreSort, "trending_score" | "member_count" | "created_at"> = {
  trending: "trending_score",
  popular: "member_count",
  new: "created_at",
}

export function exploreSort(v: unknown): ExploreSort {
  return typeof v === "string" && (EXPLORE_SORTS as readonly string[]).includes(v) ? (v as ExploreSort) : "trending"
}

/** A search word made safe for a PostgREST filter (the same rule as lib/nav/quick-search cleanTerm). */
export function cleanQuery(value: unknown): string {
  return typeof value === "string" ? value.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : ""
}

interface Cursor {
  v: string | number
  id: string
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url")
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function decodeCursor(raw: unknown, sort: ExploreSort): Cursor | null {
  if (typeof raw !== "string" || raw.length > 300) return null
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor
    if (!c || typeof c.id !== "string" || !UUID.test(c.id)) return null
    if (sort === "new") return typeof c.v === "string" && !Number.isNaN(Date.parse(c.v)) ? { v: new Date(c.v).toISOString(), id: c.id } : null
    return typeof c.v === "number" && Number.isFinite(c.v) ? c : null
  } catch {
    return null
  }
}

/** The PostgREST filter for "after this row" under a descending sort and ascending id. */
export function afterFilter(sort: ExploreSort, c: Cursor): string {
  const col = SORT_COLUMN[sort]
  const v = sort === "new" ? `"${c.v}"` : String(c.v)
  return `${col}.lt.${v},and(${col}.eq.${v},id.gt.${c.id})`
}

export const EXPLORE_PRICES = ["free", "paid"] as const
export type ExplorePrice = (typeof EXPLORE_PRICES)[number]

/** The ways in each price stands for (communities.access). Invite only is in neither: nobody can just join it. */
export const ACCESS_FOR_PRICE: Record<ExplorePrice, readonly string[]> = {
  free: ["free"],
  paid: ["paid", "product", "custom"],
}

export function explorePrice(v: unknown): ExplorePrice | null {
  return typeof v === "string" && (EXPLORE_PRICES as readonly string[]).includes(v) ? (v as ExplorePrice) : null
}

/** A category id the pills know, never "all" (no filter) and never anything else. */
export function exploreCategory(v: unknown): string | null {
  if (typeof v !== "string") return null
  const id = v.trim().toLowerCase()
  return id && id !== "all" && VALID_CATEGORY_IDS.includes(id) ? id : null
}

export interface ExploreSubcategory {
  id: string
  label: string
  /** Its parent, the category a community stores. */
  category: string
  /** PostgREST ilike patterns for its words: "ui ux" is *ui*ux*, so "UI/UX" and "UI & UX" both match. */
  patterns: string[]
}

/** A subcategory id from the taxonomy, with its parent and the words it is found by; anything else is null. */
export function exploreSubcategory(v: unknown): ExploreSubcategory | null {
  if (typeof v !== "string") return null
  const id = v.trim().toLowerCase()
  if (!id) return null
  for (const c of CATEGORY_NAV) {
    const sub = c.subcategories.find((s) => s.id === id)
    if (!sub) continue
    /*
      Each term is lowercase words and spaces only (subcategoryTerms), so it
      is safe inside a PostgREST filter. A single word under three letters
      ("ui", "ux") is left out: as a substring it is inside half the
      dictionary ("build", "guide"); it still counts as part of a phrase.
    */
    const patterns = [...new Set(subcategoryTerms(sub.id, sub.label).filter((t) => /^[a-z0-9 ]+$/.test(t) && (t.includes(" ") || t.length >= 3)).map((t) => `*${t.split(" ").join("*")}*`))].slice(0, 6)
    return { id: sub.id, label: sub.label, category: c.id, patterns }
  }
  return null
}

/**
 * The one `or` filter a page is read with: the search word, the
 * subcategory's words and the cursor, each its own group, all of them
 * required. One `or` because a second would stand beside the first in the
 * address and PostgREST would read only one.
 */
export function exploreOrFilter(input: { q?: string; patterns?: string[]; sort: ExploreSort; cursor?: Cursor | null }): string | null {
  const groups: string[] = []
  if (input.q) groups.push(`name.ilike.*${input.q}*,tagline.ilike.*${input.q}*`)
  if (input.patterns?.length) groups.push(input.patterns.flatMap((p) => [`name.ilike.${p}`, `tagline.ilike.${p}`, `description.ilike.${p}`]).join(","))
  if (input.cursor) groups.push(afterFilter(input.sort, input.cursor))
  if (!groups.length) return null
  if (groups.length === 1) return groups[0]
  return `and(${groups.map((g) => `or(${g})`).join(",")})`
}

export interface ExplorePage {
  /** False before part 81 has run. */
  available: boolean
  items: CommunityCard[]
  next: string | null
  /** A subcategory nothing in its category mentions: this is the whole category instead. */
  broadened?: boolean
}

/** One page of communities that may be found. */
export async function exploreCommunities(input: { q?: unknown; sort?: unknown; cursor?: unknown; limit?: number; category?: unknown; sub?: unknown; price?: unknown }, db: Db = admin()): Promise<ExplorePage> {
  const sort = exploreSort(input.sort)
  const q = cleanQuery(input.q)
  const limit = Math.max(1, Math.min(EXPLORE_MAX_PAGE, Math.floor(input.limit ?? EXPLORE_PAGE) || EXPLORE_PAGE))
  const cursor = decodeCursor(input.cursor, sort)
  const sub = exploreSubcategory(input.sub)
  /* A subcategory's parent is the category, whatever the address said beside it. */
  const picked = sub ? sub.category : exploreCategory(input.category)
  /* Freebies is a price: the free ones, beside whatever the price filter says (Freebies and Paid is nothing, honestly). */
  const freebies = picked === "freebies"
  const category = freebies ? null : picked
  const price = explorePrice(input.price)
  const col = SORT_COLUMN[sort]
  /* With the view count first; a database without part 87 answers 42703 and is asked again without it. */
  const read = (columns: string, patterns: string[] | undefined) => {
    let query = db
      .from("communities")
      .select(columns)
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("discovery_enabled", true)
      .eq("platform_hidden", false)
      .is("deleted_at", null)
      .is("suspended_at", null)
      .is("archived_at", null)
    if (category) query = query.eq("category", category)
    if (freebies) query = query.in("access", ACCESS_FOR_PRICE.free)
    if (price) query = query.in("access", ACCESS_FOR_PRICE[price])
    const or = exploreOrFilter({ q, patterns, sort, cursor })
    if (or) query = query.or(or)
    return query
      .order(col, { ascending: false })
      .order("id", { ascending: true })
      .limit(limit + 1)
  }
  const page = async (patterns: string[] | undefined) => {
    let { data, error } = await read(`${CARD_COLUMNS}, view_count`, patterns)
    if (error && missing(error)) ({ data, error } = await read(CARD_COLUMNS, patterns))
    return { data, error }
  }
  try {
    const patterns = sub?.patterns.length ? sub.patterns : undefined
    let { data, error } = await page(patterns)
    let broadened = false
    /* Nothing in the category has the subcategory's words: the first page is the whole category, and says so. */
    if (!error && patterns && !cursor && !((data as unknown[] | null) ?? []).length) {
      ;({ data, error } = await page(undefined))
      broadened = true
    }
    if (error) {
      if (missing(error)) return { available: false, items: [], next: null }
      console.error(`[communities] explore: ${reasonOf(error)}`)
      return { available: true, items: [], next: null }
    }
    /* Asked already: a database without the column says so once, and cardsFor is told the views are not known rather than asking again. */
    const found = ((data as CardRow[] | null) ?? []).map((r) => (r.view_count === undefined ? { ...r, view_count: null } : r))
    const rows = found.slice(0, limit)
    const last = rows[rows.length - 1]
    const next =
      found.length > limit && last
        ? encodeCursor({ v: sort === "new" ? last.created_at : sort === "popular" ? last.member_count ?? 0 : Number(last.trending_score ?? 0), id: last.id })
        : null
    return { available: true, items: await cardsFor(db, rows), next, ...(broadened ? { broadened } : {}) }
  } catch (e) {
    console.error(`[communities] explore: ${reasonOf(e)}`)
    return { available: true, items: [], next: null }
  }
}
