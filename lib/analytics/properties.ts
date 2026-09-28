/**
 * ===========================================================================
 *  WHICH OF A CREATOR'S PLACES A REPORT COUNTS
 * ===========================================================================
 * A creator has a creator page, maybe a OnePage, and maybe websites. The
 * Analytics page counts all of them together ("All") or one of them, chosen
 * in its property filter and kept in its address:
 *
 *   ?property=creator_page | onepage | website:<store_theme_installs.id>
 *
 * (no parameter is All). Pure, so the page, the route and the tests read one
 * format. lib/analytics/reports.ts says what each figure counts.
 *
 * WHERE AN ORDER OR A SIGN-UP BELONGS. Every order is under exactly one
 * property, so All is always the sum of the parts and nothing is counted
 * twice or dropped:
 *
 *   1. Its own property_type (supabase/sql/run-now part 60, written when it
 *      was made). A website order without an install id belongs to the live
 *      website, the one the checkout would have named (defaultWebsite).
 *   2. An order from before part 60: `source` website (or a basket, which is
 *      only ever filled on a website: lib/orders/order-view) is the live
 *      website; `source_detail.surface` onepage is the OnePage; anything
 *      else is the creator page, which is what the checkout calls a sale
 *      that no website claims (lib/attribution/server purchaseProperty).
 *
 * A sign-up follows the same steps with its own words: its property_type,
 * else `source_detail.surface`, else the older one word `source`.
 */
import type { PropertyType } from "./events"

export type PropertySelector =
  | { type: "all" }
  | { type: "creator_page" }
  | { type: "onepage" }
  | { type: "website"; id: string }

export const ALL: PropertySelector = { type: "all" }

/**
 * ===========================================================================
 *  WHAT THE FILTER IS SET TO WHEN NOBODY HAS SET IT
 * ===========================================================================
 * "In Analytics, as default it needs to be set to all pages in that thing, a
 * default, but people can change it."
 *
 * All pages, and it is written down here rather than being what is left over
 * when every other branch of parseProperty fails. Analytics is a page about
 * the whole business: a creator who has not asked for one of their places
 * wants the total, and All is the only selector that is right for every
 * creator, whatever they have (a creator page, a OnePage, none, one or five
 * websites) and whatever they had yesterday. A live website as the default
 * would change under a creator who publishes another one, and the creator
 * page as the default would leave a website's visits out of the first number
 * anybody sees.
 *
 * A creator's own choice overrides it and is kept exactly where it was: in
 * the address, as ?property=, written by the page itself. So a place chosen
 * survives a reload, a link opens on the place it names, and a place the
 * address asks for that this creator cannot have opens here instead.
 */
export const DEFAULT_PROPERTY: PropertySelector = ALL

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The address's `property` as a selector. Anything unreadable is the default; whether a website is the creator's is the server's question. */
export function parseProperty(raw: string | null | undefined): PropertySelector {
  const v = (raw || "").trim()
  if (v === "creator_page" || v === "onepage") return { type: v }
  const m = /^website:(.+)$/.exec(v)
  if (m && UUID.test(m[1])) return { type: "website", id: m[1].toLowerCase() }
  return DEFAULT_PROPERTY
}

/** The selector as the address writes it; All is no parameter at all. */
export function propertyParam(p: PropertySelector): string | null {
  if (p.type === "all") return null
  return p.type === "website" ? `website:${p.id}` : p.type
}

export function sameProperty(a: PropertySelector, b: PropertySelector): boolean {
  return propertyParam(a) === propertyParam(b)
}

/** One website a creator has, as the filter names it. */
export interface WebsiteProperty {
  id: string
  name: string
}

/**
 * The places a creator actually has: the creator page always; the OnePage if
 * there is one; every website that is live or has been live (a draft that was
 * never published has had no visitor and is not a place anyone went).
 * `defaultWebsite` is the live one, where an order or a view that never knew
 * its install belongs.
 */
export interface CreatorProperties {
  onePageId: string | null
  websites: WebsiteProperty[]
  defaultWebsite: string | null
}

export interface PropertyOption {
  value: PropertySelector
  label: string
}

/** What the default is called, on the button and at the top of the list. */
export const DEFAULT_PROPERTY_LABEL = "All pages"

/** The filter's rows, in the order they are listed. Just "All pages" when there is nothing to choose between. */
export function propertyOptions(p: CreatorProperties): PropertyOption[] {
  const rows: PropertyOption[] = [{ value: DEFAULT_PROPERTY, label: DEFAULT_PROPERTY_LABEL }, { value: { type: "creator_page" }, label: "Creator page" }]
  if (p.onePageId) rows.push({ value: { type: "onepage" }, label: "OnePage" })
  for (const w of p.websites) rows.push({ value: { type: "website", id: w.id }, label: p.websites.length === 1 ? "Website" : w.name || "Website" })
  return rows.length > 2 ? rows : [rows[0]]
}

/** The name of what is chosen, for a button or a heading. */
export function propertyLabel(p: CreatorProperties, s: PropertySelector): string {
  return propertyOptions(p).find((o) => sameProperty(o.value, s))?.label ?? DEFAULT_PROPERTY_LABEL
}

/**
 * A selector the creator may ask for: All, their creator page, their OnePage
 * if they have one, or one of their own websites. A website id that is not
 * theirs is refused, never read: it could only ever be somebody else's.
 */
export function ownsProperty(p: CreatorProperties, s: PropertySelector): boolean {
  if (s.type === "all" || s.type === "creator_page") return true
  if (s.type === "onepage") return !!p.onePageId
  return p.websites.some((w) => w.id === s.id)
}

/** A place, as a row of analytics_events, an order or a subscriber holds it. */
export interface PlacedOn {
  type: PropertyType | null
  id: string | null
}

/** Whether something placed on `on` is counted under `s`. A website with no install is the live website's. */
export function counts(s: PropertySelector, on: PlacedOn, defaultWebsite: string | null): boolean {
  if (s.type === "all") return true
  if (on.type !== s.type) return false
  if (s.type !== "website") return true
  return on.id === s.id || (!on.id && !!defaultWebsite && s.id === defaultWebsite)
}

/* ─── Orders ──────────────────────────────────────────────────────────── */

interface OrderLineLike {
  property_type?: string | null
  property_id?: string | null
  source?: string | null
  source_detail?: unknown
}

function surfaceOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null
  const s = (detail as { surface?: unknown }).surface
  return typeof s === "string" ? s : null
}

const TYPES: readonly string[] = ["creator_page", "onepage", "website"]

/**
 * The property of one payment (lib/orders/order-view groupOrders), from its
 * lines (a basket's lines carry the same attribution) and, for an order from
 * before part 60, the Source the Orders page shows for it (`source`, worked
 * out by order-view from the same lines) and the surface it recorded. By the
 * rules at the top of this file.
 */
export function orderProperty(order: { lines: readonly OrderLineLike[]; source?: string | null; sourceDetail?: unknown }): PlacedOn {
  for (const l of order.lines) {
    if (l.property_type && TYPES.includes(l.property_type)) {
      const type = l.property_type as PropertyType
      /* The creator page's id is the creator's own: one creator page each, nothing to tell apart. */
      return { type, id: type === "creator_page" ? null : l.property_id ?? null }
    }
  }
  if (order.source === "website") return { type: "website", id: null }
  if (surfaceOf(order.sourceDetail) === "onepage" || order.lines.some((l) => surfaceOf(l.source_detail) === "onepage")) return { type: "onepage", id: null }
  return { type: "creator_page", id: null }
}

/* ─── Sign-ups ─────────────────────────────────────────────────────────── */

export interface SubscriberRowLike {
  property_type?: string | null
  property_id?: string | null
  source?: string | null
  source_detail?: unknown
}

/** Added by the creator, imported or sent through the API: a contact, not somebody who signed up on a page. */
export function isSignup(row: SubscriberRowLike): boolean {
  const surface = surfaceOf(row.source_detail)
  if (surface === "import" || surface === "manual" || surface === "api") return false
  const source = (row.source || "").toLowerCase()
  return !(source === "import" || source === "manual" || source === "api" || source === "csv_import")
}

/** Where a sign-up happened, by the rules at the top of this file. */
export function subscriberProperty(row: SubscriberRowLike): PlacedOn {
  if (row.property_type && TYPES.includes(row.property_type)) {
    const type = row.property_type as PropertyType
    return { type, id: type === "creator_page" ? null : row.property_id ?? null }
  }
  const surface = surfaceOf(row.source_detail)
  if (surface === "website") return { type: "website", id: null }
  if (surface === "onepage") return { type: "onepage", id: null }
  if (surface === "profile" || surface === "product") return { type: "creator_page", id: null }
  const source = (row.source || "").toLowerCase()
  if (source === "onepage") return { type: "onepage", id: null }
  if (source.startsWith("website") || source === "store_builder") return { type: "website", id: null }
  return { type: "creator_page", id: null }
}

/** The property's own name, for a row that says where something came from. */
export function propertyName(on: PlacedOn, p: CreatorProperties): string {
  if (on.type === "onepage") return "OnePage"
  if (on.type === "website") {
    if (p.websites.length <= 1) return "Website"
    const id = on.id ?? p.defaultWebsite
    return p.websites.find((w) => w.id === id)?.name || "Website"
  }
  if (on.type === "creator_page") return "Creator page"
  return "Not recorded"
}
