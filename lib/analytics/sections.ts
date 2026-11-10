import { tt } from "@/lib/i18n/text"
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
 *   shipping, fulfilment     a seller with a physical product, and only while
 *                            what is chosen could have shipped: All or
 *                            Physical, or a physical product. A published
 *                            website alone is no reason: a seller of
 *                            downloads with a website ships nothing
 *   Digital and Physical     a seller of both kinds: every figure counts
 *                            both, and the cards split them where it
 *                            matters (the sales breakdown's columns, each
 *                            top product's kind). The page has no switch
 *                            any more (round AC2); `mode` stays for the
 *                            routes' `?kind=`, which the page never sends
 *   downloads                a seller of digital products, while All or a
 *                            digital product is chosen
 *   productKinds             the split above, for a seller of both
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
  /** The All / Digital / Physical switch, for a seller of both; "all" when absent. */
  mode?: SalesMode
}

/* ─── What the store sells, and the switch for a store that sells both ─── */

/** The switch at the top of Analytics. Digital is everything that does not ship: downloads, courses, memberships, communities. */
export type SalesMode = "all" | "digital" | "physical"

export function parseMode(raw: string | null | undefined): SalesMode {
  return raw === "digital" || raw === "physical" ? raw : "all"
}

/** What the store sells, from its catalogue: nothing yet, one kind, or both. */
export function sellsOf(p: Pick<AnalyticsProfile, "physical" | "digital" | "membership" | "communities" | "products">): "none" | "digital" | "physical" | "both" {
  if (p.products === 0) return "none"
  const digital = p.digital || p.membership
  if (p.physical && digital) return "both"
  return p.physical ? "physical" : "digital"
}

/** The switch's value as it applies: only a store that sells both kinds has one. */
export function modeFor(p: AnalyticsProfile, wanted: SalesMode): SalesMode {
  const sells = sellsOf(p)
  if (sells === "both") return wanted
  return "all"
}

/** Whether an order line of this product type is counted under the switch. */
export function lineInMode(type: string | null | undefined, mode: SalesMode): boolean {
  if (mode === "all") return true
  return (kindOfProduct(type) === "physical") === (mode === "physical")
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
  const mode = s.mode ?? "all"
  /* Only a seller of something physical has shipping or fulfilment to show. */
  const ships = p.physical && mode !== "digital"
  const digital = p.digital && mode !== "physical"
  return {
    sales: p.products > 0,
    shipping: ships && (allProducts || s.productKind === "physical"),
    fulfillment: ships && (allProducts || s.productKind === "physical"),
    topProducts: allProducts,
    /* The Digital and Physical split (breakdown columns, each product's kind), with every kind counted together. */
    productKinds: allProducts && mode === "all" && p.physical && (p.digital || p.membership),
    subscribers: allProducts,
    links: s.property === "onepage",
    communities: p.communities > 0 && s.property === "all" && mode !== "physical" && (allProducts || s.productKind === "community"),
    downloads: digital && (allProducts || s.productKind === "digital"),
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

/* ─── Wave 10: one page, whatever is chosen ─────────────────────────────── */

/**
 * THE SAME CARDS IN THE SAME PLACES, WHATEVER IS CHOSEN (wave 10, the owner: "the order of the tabs and the showing
 * of the tabs and position should not be different when I switch analytics from OnePage to All, to Communities, to
 * Digital products"). As Shopify, Stripe and Plausible do it: a filter changes the numbers, never the layout. A card
 * that means something for what the seller sells and has keeps its place for every place and every type; when what
 * is chosen has nothing for it, it says so in one line (`slotNote`) instead of leaving and coming back.
 *
 * What decides a card's place is the seller (`slotsFor`), never the filter, except the product picker: one product
 * chosen is a different question (a list of one), as before.
 */
export interface Slots {
  /** A seller with a physical product: the Shipping card. */
  shipping: boolean
  /** A seller of digital products: Downloads. */
  downloads: boolean
  /** A seller with anything to sell: Refunds. */
  refunds: boolean
  /** A seller who runs a community: the Communities cards under the rest. */
  communities: boolean
  /** A seller with a published website: Clicks between pages. */
  siteClicks: boolean
}

export function slotsFor(p: AnalyticsProfile, s: Pick<Selection, "productKind">): Slots {
  const allProducts = s.productKind === null
  return {
    shipping: p.physical && (allProducts || s.productKind === "physical"),
    downloads: p.digital && (allProducts || s.productKind === "digital"),
    refunds: p.products > 0,
    communities: p.communities > 0 && (allProducts || s.productKind === "community"),
    siteClicks: p.publishedWebsite,
  }
}

export type SlotId = keyof Slots

/**
 * Why a card kept in its place has nothing for what is chosen, said in one line, or null when it applies.
 * `property` as in Selection ("all", "creator_page", "onepage", "website:<id>").
 */
export function slotNote(id: SlotId, s: { property: string; mode: SalesMode }): string | null {
  if (id === "shipping") return s.mode === "digital" ? tt("Digital products don't ship. Choose All types or Physical to see shipping.") : null
  if (id === "downloads") return s.mode === "physical" ? tt("Downloads count digital products. Choose All types or Digital to see them.") : null
  if (id === "communities") {
    if (s.mode === "physical") return tt("Communities are not physical sales. Choose All types or Communities to see them.")
    if (s.property !== "all") return tt("Communities have their own pages. Choose All pages or Communities to see them.")
    return null
  }
  if (id === "siteClicks") return s.property === "onepage" || s.property === "creator_page" ? tt("Clicks between pages are counted on your websites. Choose All pages or a website to see them.") : null
  return null
}

/**
 * THE FOUR FIGURES OVER THE CHART, IN FOUR FIXED PLACES. Audience first, then money, then how many, then the rate,
 * for every type: the store's Visitors, Revenue, Orders and Conversion; the communities' Visits, Payments received,
 * New members and Join rate in the very same four places. The figure chosen stays chosen by its place when the type
 * changes (Revenue chosen, Communities shows Payments received).
 */
export const STORE_METRICS = ["views", "revenue", "orders", "conversion"] as const
export const COMMUNITY_METRICS = ["visits", "revenue", "joined", "joinRate"] as const
export type CommunityMetricSlot = (typeof COMMUNITY_METRICS)[number]

/** The place of a figure in its row, 0 when it is not in it. */
export function metricSlot(list: readonly string[], key: string): number {
  const i = list.indexOf(key)
  return i < 0 ? 0 : i
}
