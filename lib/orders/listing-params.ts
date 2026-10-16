/**
 * WHAT THE BROWSER ASKS THE ORDERS LIST FOR, AND HOW THE SERVER READS IT
 *
 * One page of orders (app/api/app/orders/list, lib/orders/paged.ts) is asked
 * for with the list's own address (view, search, filters, sort, page) and
 * the period as the browser worked it out: the instants it covers and the
 * ones it is compared with, in the viewer's zone. Written and read here, so
 * the two ends cannot drift apart.
 */
import { paramsFromQuery, queryFromParams, type ListQuery } from "./order-view"

export type Span = { start: number; end: number }

export interface ListingAsk {
  query: ListQuery
  window: Span
  previous: Span | null
  timeZone: string
  open?: string | null
  /** False: the figures and tabs are already in the browser for this period (lib/orders/paged.ts ListingRequest). */
  figures?: boolean
}

/**
 * What a page of the list answers: the list's address, the period as days
 * and the zone. Not the instants: "Last 30 days" ends now, and a key that
 * moved every minute would read the list again every minute.
 */
export function listingKey(query: ListQuery, period: { preset?: string | null; start: string; end: string }, timeZone: string): string {
  return JSON.stringify([query.view, query.q.trim(), query.source, query.product, query.fulfillment ?? "any", query.sort, query.page, period.preset ?? "", period.start, period.end, timeZone])
}

export function listingParams(ask: ListingAsk): URLSearchParams {
  const p = paramsFromQuery(ask.query)
  /* The page is part of what is asked even when it is the first. */
  p.set("page", String(ask.query.page))
  p.set("ws", String(Math.round(ask.window.start)))
  p.set("we", String(Math.round(ask.window.end)))
  if (ask.previous) {
    p.set("ps", String(Math.round(ask.previous.start)))
    p.set("pe", String(Math.round(ask.previous.end)))
  }
  p.set("tz", ask.timeZone)
  if (ask.open) p.set("order", ask.open)
  if (ask.figures === false) p.set("figures", "0")
  return p
}

function instant(raw: string | null): number | null {
  if (raw === null || !/^-?\d{1,16}$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) ? n : null
}

/** A span from two parameters, or null when either is missing or it runs backwards. */
export function spanFrom(params: { get(name: string): string | null }, a: string, b: string): Span | null {
  const start = instant(params.get(a))
  const end = instant(params.get(b))
  return start === null || end === null || end < start ? null : { start, end }
}

/** The ask, or null when the period is missing. The zone is checked by the caller (lib/orders/time-zone isTimeZone). */
export function listingAskFrom(params: { get(name: string): string | null }): ListingAsk | null {
  const window = spanFrom(params, "ws", "we")
  if (!window) return null
  const open = params.get("order")
  return {
    query: queryFromParams(params),
    window,
    previous: spanFrom(params, "ps", "pe"),
    timeZone: params.get("tz") || "UTC",
    open: open && open.length <= 64 ? open : null,
    figures: params.get("figures") !== "0",
  }
}
