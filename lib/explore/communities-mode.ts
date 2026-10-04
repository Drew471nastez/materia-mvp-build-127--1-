/**
 * ===========================================================================
 *  EXPLORE, COMMUNITIES MODE: THE RULES, WITHOUT THE PAGE
 * ===========================================================================
 * /explore?type=communities is Explore with real communities in the grid
 * (lib/communities/server/explore.ts, GET /api/explore/communities): the
 * same pills, the same search field, the same Filters button. Pure and
 * browser safe, so the page, the server route that draws its first page and
 * tests/explore-communities.test.ts all read the same answers.
 *
 * WHO GETS THE MODE. The communities switch (platform_flags, `communities`)
 * is the only gate. While it is off there is no communities mode at all: an
 * address or a cookie asking for it gets the products, and the hero's chip
 * offers no menu. While it is on, the chip's menu always offers it, and the
 * admin's "Discover headline pill" flag only adds the second, gray control
 * above the heading; it never decides whether communities can be reached.
 */
import { CATEGORY_NAV, normalizeCategoryToId } from "@/lib/marketplace/categories"

export type DiscoverModeId = "products" | "communities"

export function discoverModeFor(input: { communitiesOn: boolean; type?: string | null; cookie?: DiscoverModeId | null }): DiscoverModeId {
  if (!input.communitiesOn) return "products"
  if (input.type === "communities") return "communities"
  if (input.type === "products") return "products"
  return input.cookie ?? "products"
}

/** The gray control above the heading: the admin's flag, and only while there is a second mode to switch to. */
export function showsHeadlineSwitch(input: { communitiesOn: boolean; headlineFlag: boolean }): boolean {
  return input.communitiesOn && input.headlineFlag
}

/*
  THE ORDERS, IN THE PAGE'S OWN SORT IDS. The Filters panel keeps one
  `srt` in the address for both modes, so a community order is written with
  the ids the products already use where they mean the same thing:
  recommended (the default) is the trending job's score, popular is the most
  active members, newest is newest. The two price orders have no meaning
  for a community and are not offered.
*/
export const COMMUNITY_SORT_OPTIONS = [
  { id: "recommended", label: "Trending" },
  { id: "popular", label: "Most members" },
  { id: "newest", label: "Newest" },
] as const

export type CommunityServerSort = "trending" | "popular" | "new"

export function communityServerSort(srt: string | null | undefined): CommunityServerSort {
  if (srt === "popular") return "popular"
  if (srt === "newest") return "new"
  return "trending"
}

/** The old /explore/communities?sort= words, as this page writes them. */
export function srtForLegacySort(sort: string | null | undefined): string | null {
  if (sort === "popular") return "popular"
  if (sort === "new") return "newest"
  return null
}

/** What a community costs to join, not a price band: the bands are a product's. */
export const COMMUNITY_PRICE_FILTERS = [
  { id: "all", label: "Any price" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
] as const

export function communityPrice(price: string | null | undefined): "free" | "paid" | null {
  return price === "free" || price === "paid" ? price : null
}

/**
 * The query the communities route answers, in one fixed order so the same
 * choice is the same string: the page compares it with the first page the
 * server drew, and a match means there is nothing to fetch.
 */
export function communitiesQuery(input: { q?: string | null; category?: string | null; srt?: string | null; price?: string | null }): string {
  const p = new URLSearchParams()
  const q = (input.q ?? "").trim()
  if (q) p.set("q", q)
  const c = (input.category ?? "").trim().toLowerCase()
  if (c && c !== "all" && c !== "for-you") p.set("c", c)
  const sort = communityServerSort(input.srt)
  if (sort !== "trending") p.set("sort", sort)
  const price = communityPrice(input.price)
  if (price) p.set("price", price)
  return p.toString()
}

/** Where /explore/communities?q=&sort= goes now: the same list inside Explore. */
export function legacyCommunitiesTarget(params: { q?: string | null; sort?: string | null }): string {
  const p = new URLSearchParams({ type: "communities" })
  const q = (params.q ?? "").trim()
  if (q) p.set("q", q)
  const srt = srtForLegacySort(params.sort)
  if (srt) p.set("srt", srt)
  return `/explore?${p.toString()}`
}

/** The address of Explore's communities, for every link that used to say /explore/communities. */
export const EXPLORE_COMMUNITIES_HREF = "/explore?type=communities"

const DAY = 86_400_000

/**
 * "Launched 3d ago", "Launched 5mo ago", "Launched 1y ago". The unit is the
 * largest one that fits, rounded down, so a community a year and a half old
 * still says 1y: never older than it is.
 */
export function launchedLabel(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const days = Math.floor(Math.max(0, now - t) / DAY)
  if (days < 1) return "Launched today"
  if (days < 7) return `Launched ${days}d ago`
  if (days < 30) return `Launched ${Math.floor(days / 7)}w ago`
  if (days < 365) return `Launched ${Math.max(1, Math.floor(days / 30))}mo ago`
  return `Launched ${Math.floor(days / 365)}y ago`
}

/** "4.9", only from real reviews; no count beside it, as asked. */
export function ratingLabel(rating: { average: number; count: number } | null | undefined): string | null {
  if (!rating || !(rating.count > 0) || !(rating.average > 0)) return null
  return (Math.round(rating.average * 10) / 10).toFixed(1)
}

/*
  A COMMUNITY'S CATEGORY is one of the ids Explore's pills use, so choosing
  one in Settings, Page is what puts it under that pill. The labels are the
  pills' own (Development reads Tech there). Freebies is not offered: it is
  a price, and the Filters panel asks that.
*/
const PILL_LABELS: Record<string, string> = { development: "Tech" }

export const COMMUNITY_CATEGORIES: { id: string; label: string }[] = CATEGORY_NAV.filter((c) => c.id !== "freebies").map((c) => ({ id: c.id, label: PILL_LABELS[c.id] ?? c.label }))

const COMMUNITY_CATEGORY_IDS = new Set(COMMUNITY_CATEGORIES.map((c) => c.id))

/**
 * What is stored for a creator's choice: a known id as it is, older free
 * text ("Fitness", "UI Kits") read the way products are (normalizeCategoryToId,
 * which ends in "other"), and nothing for an empty choice.
 */
export function communityCategoryId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim().toLowerCase()
  if (!v || v === "all") return null
  if (COMMUNITY_CATEGORY_IDS.has(v)) return v
  const mapped = normalizeCategoryToId(v)
  return mapped && COMMUNITY_CATEGORY_IDS.has(mapped) ? mapped : "other"
}

/**
 * A count on a card's stats row: 840, 1.7k, 31.7k, 128k, 1.2M. One decimal
 * up to a hundred thousand, as the owner's reference reads (31.7k, not 31k),
 * always rounded down, so a card never says more than the rows do.
 */
export function statCount(n: number | null | undefined): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n as number) ? (n as number) : 0))
  if (v < 1000) return String(v)
  const one = (x: number) => {
    const t = Math.floor(x * 10) / 10
    return t % 1 === 0 ? t.toFixed(0) : t.toFixed(1)
  }
  if (v < 100_000) return `${one(v / 1000)}k`
  if (v < 1_000_000) return `${Math.floor(v / 1000)}k`
  return `${one(v / 1_000_000)}M`
}
