/**
 * ===========================================================================
 *  WHICH SECTIONS /app/analytics DRAWS, FOR WHAT THIS SELLER SELLS AND HAS
 * ===========================================================================
 * Pure, so the server page, the client and the tests read one rule.
 *
 * A Storelib seller has some of these, never necessarily all:
 *
 *   creator page      always: storelib.com/<handle>, its product pages
 *   OnePage           a links page (storelib.me/<name>), whose taps are links
 *   website           a published website, Storelib's own theme or an
 *                     imported one; a draft that was never published is not
 *                     a place (lib/analytics/report-read creatorProperties)
 *   communities       storelib.com/community/<slug>, counted by their own
 *                     beacon (lib/communities/server/record-view)
 *   products          digital (downloads, courses, anything not shipped),
 *                     physical (shipped), memberships, communities
 *
 * What each gets:
 *
 *   shipping, fulfilment     a seller who ships, or has a published website
 *                            (which is a shop), and only while what is chosen
 *                            could have shipped: All, or a physical product
 *   downloads                a seller of digital products, while All or a
 *                            digital product is chosen
 *   Physical and Digital     Top products split by kind, for a seller of both
 *   Top products, sign-ups   All products only: with one chosen, a list of
 *                            one and a sign-up count that is not that
 *                            product's would only mislead
 *   Top links                the OnePage chosen (its taps are what matter)
 *   Communities              a seller with a community, All pages, and All
 *                            products or a community product
 *   Sales reports            a seller with anything to sell
 */

export type ProductKind = "physical" | "digital" | "membership" | "community"

export interface AnalyticsProfile {
  physical: boolean
  digital: boolean
  membership: boolean
  /** How many communities the seller runs. */
  communities: number
  onePage: boolean
  /** A website live now. A site taken down keeps its history in the filter, but the shop sections follow what is live. */
  publishedWebsite: boolean
  products: number
}

/** A product's kind as the reports count it: anything not shipped, a membership or a community is digital. */
export function kindOfProduct(type: string | null | undefined): ProductKind {
  const t = (type || "").toLowerCase()
  if (t === "physical") return "physical"
  if (t === "membership") return "membership"
  if (t === "community") return "community"
  return "digital"
}

export function profileOf(input: {
  products: Array<{ type?: string | null }>
  onePageId: string | null
  websites: Array<{ published?: boolean }>
  communities: number
}): AnalyticsProfile {
  const kinds = new Set(input.products.map((p) => kindOfProduct(p.type)))
  return {
    physical: kinds.has("physical"),
    digital: kinds.has("digital"),
    membership: kinds.has("membership"),
    communities: Math.max(0, input.communities | 0),
    onePage: !!input.onePageId,
    publishedWebsite: input.websites.some((w) => w.published !== false),
    products: input.products.length,
  }
}

export interface Selection {
  /** "all", "creator_page", "onepage" or "website:<id>". */
  property: string
  /** The chosen product's kind, or null for All products. */
  productKind: ProductKind | null
}

export interface Sections {
  sales: boolean
  shipping: boolean
  fulfillment: boolean
  topProducts: boolean
  productKinds: boolean
  subscribers: boolean
  links: boolean
  communities: boolean
  downloads: boolean
}

export function sectionsFor(p: AnalyticsProfile, s: Selection): Sections {
  const allProducts = s.productKind === null
  const ships = p.physical || p.publishedWebsite
  return {
    sales: p.products > 0,
    shipping: ships && (allProducts || s.productKind === "physical"),
    fulfillment: ships && (allProducts || s.productKind === "physical"),
    topProducts: allProducts,
    productKinds: allProducts && p.physical && (p.digital || p.membership),
    subscribers: allProducts,
    links: s.property === "onepage",
    communities: p.communities > 0 && s.property === "all" && (allProducts || s.productKind === "community"),
    downloads: p.digital && (allProducts || s.productKind === "digital"),
  }
}

/* ─── Reports a seller adds ────────────────────────────────────────────── */

/**
 * The reports a seller can add as cards of their own. Each is counted by the
 * same answer as the rest of the page; none of them is ever a line on the
 * chart.
 */
export const REPORT_IDS = ["pageviews", "sessions", "clicks", "toplinks", "refunds", "downloads"] as const
export type ReportId = (typeof REPORT_IDS)[number]

/** How many a seller can add: every report once. */
export const MAX_REPORTS = REPORT_IDS.length

/** The reports this seller can add: the ones that mean something for what they sell and have. */
export function reportOptions(p: AnalyticsProfile): ReportId[] {
  return REPORT_IDS.filter((id) => {
    if (id === "toplinks") return p.onePage
    if (id === "refunds") return p.products > 0
    if (id === "downloads") return p.digital
    return true
  })
}

/** Whether an added report is drawn for what is chosen now (Downloads waits while a physical product is chosen). */
export function reportShown(id: ReportId, p: AnalyticsProfile, s: Selection): boolean {
  if (!reportOptions(p).includes(id)) return false
  if (id === "downloads") return sectionsFor(p, s).downloads
  if (id === "toplinks") return s.property !== "onepage"
  return true
}

/** A saved list, tidied: known ids only, each once, in the order given. Anything unreadable is none. */
export function normalizeReports(raw: unknown): ReportId[] {
  if (!Array.isArray(raw)) return []
  const out: ReportId[] = []
  for (const v of raw) {
    if (typeof v === "string" && (REPORT_IDS as readonly string[]).includes(v) && !out.includes(v as ReportId)) out.push(v as ReportId)
    if (out.length >= MAX_REPORTS) break
  }
  return out
}

/** One report moved one place up (-1) or down (+1); at an end, nothing changes. */
export function moveReport(list: readonly ReportId[], id: ReportId, by: -1 | 1): ReportId[] {
  const i = list.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * The picker's answer applied: reports kept where they were, the ones taken
 * off gone, the new ones at the end in the order the picker lists them.
 */
export function applyPicked(current: readonly ReportId[], picked: ReadonlySet<ReportId>): ReportId[] {
  const kept = current.filter((id) => picked.has(id))
  const added = REPORT_IDS.filter((id) => picked.has(id) && !kept.includes(id))
  return [...kept, ...added]
}

/** Every section, for a caller that does not say (the probe that mounts the cards alone). */
export const DEFAULT_SECTIONS_ALL: Sections = {
  sales: true,
  shipping: true,
  fulfillment: true,
  topProducts: true,
  productKinds: true,
  subscribers: true,
  links: false,
  communities: false,
  downloads: true,
}
