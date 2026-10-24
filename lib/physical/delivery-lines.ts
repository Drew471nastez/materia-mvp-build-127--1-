/**
 * Delivery and pickup on a product page, in words: the shape the server
 * reads (./storefront-facts.ts productDelivery) and the lines a product page
 * says. Pure, so the storefront's own blocks draw them in the browser.
 */
import { countryName } from "@/lib/checkout/countries"

/** A pickup point as the product page names it. */
export interface PickupPoint {
  name: string
  /** The town, for "Pickup available at Main Street, Lisbon". */
  city: string | null
  /** "Usually ready in 24 hours". */
  ready: string
}

export interface ProductDelivery {
  /** The cheapest delivery to the shop's home country for one of it, or null when none is set up there. */
  ship: { country: string; priceCents: number; estimate: string; freeFromCents: number | null; minDays?: number | null; maxDays?: number | null } | null
  /** Pickup points, by variant id: those that hold that option (or never run out of it). Empty: no pickup. */
  pickup: Record<string, PickupPoint[]>
  /** The shop delivers it itself near one of its locations at home (Settings › Locations, local delivery). */
  local?: boolean
}

/** "Pickup available at Main Street, Lisbon": the first point, and how many more. */
export function pickupLine(points: PickupPoint[] | undefined): string | null {
  if (!points || points.length === 0) return null
  const first = points[0]
  const at = first.city ? `${first.name}, ${first.city}` : first.name
  return points.length === 1 ? `Pickup available at ${at}` : `Pickup available at ${at} and ${points.length - 1} more ${points.length === 2 ? "place" : "places"}`
}

/** "Delivery $4.99 to Portugal, 3 to 5 business days", or "Free delivery to Portugal, 2 business days": the buy box's words (./delivery-promise.ts deliveryPromiseLines). */
export function deliveryLine(ship: ProductDelivery["ship"], money: (cents: number) => string): string | null {
  if (!ship) return null
  const price = ship.priceCents === 0 ? "Free delivery" : `Delivery ${money(ship.priceCents)}`
  const place = ship.country ? countryName(ship.country) || ship.country : null
  return `${price}${place ? ` to ${place}` : ""}${ship.estimate ? `, ${ship.estimate}` : ""}`
}

/**
 * ===========================================================================
 *  ESTIMATED DELIVERY: THE DAYS IT SHOULD ARRIVE BETWEEN
 * ===========================================================================
 * From the cheapest rate home's business days (Settings › Shipping and
 * delivery, the same rate deliveryLine says) and the days the shop takes to
 * get an order ready (the block's own setting, as Shopify's delivery apps
 * have it): today, or the next working day after the block's last order
 * hour, plus the days to get it ready, plus the rate's days, weekends never
 * counted. Null when the rate gives no days: nothing is promised that the
 * rates do not say. Pure, and the same in the browser, so a page held in a
 * cache counts again from the visitor's own today.
 */
export interface DeliveryWindowInput {
  minDays: number | null | undefined
  maxDays: number | null | undefined
  /** Business days to get an order ready before it ships. */
  processingDays?: number
  /** An order after this hour (0 to 23, the visitor's clock) counts from the next working day; null or 24: no cut off. */
  cutoffHour?: number | null
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let left = Math.max(0, Math.floor(n))
  while (isWeekend(d)) d.setDate(d.getDate() + 1)
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    if (!isWeekend(d)) left--
  }
  return d
}

export function deliveryWindow(input: DeliveryWindowInput, now: Date = new Date()): { from: Date; to: Date } | null {
  const min = typeof input.minDays === "number" && Number.isFinite(input.minDays) && input.minDays >= 0 ? Math.floor(input.minDays) : null
  const max = typeof input.maxDays === "number" && Number.isFinite(input.maxDays) && input.maxDays >= 0 ? Math.floor(input.maxDays) : null
  if (min === null && max === null) return null
  const lo = min ?? max!
  const hi = Math.max(lo, max ?? min!)
  const ready = Math.max(0, Math.min(30, Math.floor(input.processingDays ?? 1) || 0))
  const cut = typeof input.cutoffHour === "number" && input.cutoffHour >= 0 && input.cutoffHour < 24 ? input.cutoffHour : null
  /* After the last order hour, or on a weekend, the order is started on the next working day. */
  const late = cut !== null && now.getHours() >= cut
  const start = isWeekend(now) ? addBusinessDays(now, 0) : late ? addBusinessDays(now, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const shipped = addBusinessDays(start, ready)
  return { from: addBusinessDays(shipped, lo), to: addBusinessDays(shipped, hi) }
}

/** "Tue, Oct 28", in the page's language. */
export function deliveryDay(d: Date, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(d)
  } catch {
    return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(d)
  }
}

/** The block's words with {from} and {to} filled: "Arrives Tue, Oct 28 to Fri, Oct 31", or one day when they are the same. */
export function deliveryWindowLine(win: { from: Date; to: Date }, words: { range: string; single: string }, locale = "en"): string {
  const from = deliveryDay(win.from, locale)
  const to = deliveryDay(win.to, locale)
  return from === to ? words.single.replace(/\{date\}|\{from\}|\{to\}/g, from) : words.range.replace(/\{from\}/g, from).replace(/\{to\}/g, to)
}

export const DELIVERY_WINDOW_WORDS = { range: "Arrives {from} to {to}", single: "Arrives {date}" }
