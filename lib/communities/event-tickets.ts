/**
 * ===========================================================================
 *  WHAT AN EVENT COSTS, AND WHO MAY SEE IT
 * ===========================================================================
 * An event is free, exactly as every event was before run-now part 105, or
 * it carries a price and then its details (the meeting link, the exact
 * address, who else is going, the calendar file, the replay) are only for
 * people holding a ticket. The rules live here, pure and browser safe, so
 * the card, the page, the route and the test all answer the same.
 *
 * ticketGate() is the only thing that decides whether the details open. The
 * view uses it, and so do the .ics route and the replay check, because a
 * rule applied only in the view is not a rule.
 *
 * Money is read from the event's row on the server and never from the page.
 * Nothing here reads anything; it is given the numbers.
 */

export type TicketStatus = "held" | "paid" | "refunded" | "cancelled"
export type TicketSource = "purchase" | "invite" | "grant"

/** What an event is, money wise: free as every event used to be, or sold with a price. */
export type EventPriceMode = "free" | "paid"

export interface EventPricing {
  priceCents: number | null
  currency: string | null
  salesCloseAt: string | null
  refundWindowHours: number | null
  refundPolicy: string | null
}

export interface TicketView {
  id: string
  status: TicketStatus
  source: TicketSource
  amountCents: number | null
  currency: string | null
  paidAt: string | null
  refundedAt: string | null
  attendedAt: string | null
}

/** The smallest a paid event may cost: the CHECK in run-now part 105. */
export const MIN_EVENT_PRICE_CENTS = 50
/** The largest, so a typing slip cannot make a ticket cost a million. */
export const MAX_EVENT_PRICE_CENTS = 99999999
/** How long a seat is kept while somebody is paying for it. */
export const TICKET_HOLD_MINUTES = 30

const HOUR_MS = 3_600_000

export function eventPriceMode(e: Pick<EventPricing, "priceCents">): EventPriceMode {
  return typeof e.priceCents === "number" && e.priceCents > 0 ? "paid" : "free"
}

/** "$25", "$25.50", "RON 120". */
export function eventPriceLabel(cents: number, currency: string | null | undefined): string {
  const code = (currency || "usd").toUpperCase()
  const whole = cents % 100 === 0
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)
  } catch {
    return `${code} ${(cents / 100).toFixed(whole ? 0 : 2)}`
  }
}

/** When tickets stop being sold: the event's own time if it has one, else the start. */
export function salesCloseMoment(e: Pick<EventPricing, "salesCloseAt"> & { startsAt: string }): number {
  const close = Date.parse(e.salesCloseAt ?? "")
  if (Number.isFinite(close)) return close
  const start = Date.parse(e.startsAt)
  return Number.isFinite(start) ? start : 0
}

/** Whether tickets may still be bought: scheduled, a price, and before salesCloseAt (else the start). */
export function salesOpen(e: EventPricing & { startsAt: string; cancelled: boolean }, now: number = Date.now()): boolean {
  if (e.cancelled) return false
  if (eventPriceMode(e) === "free") return false
  return salesCloseMoment(e) > now
}

/** Whether the holder's own refund button shows: a paid ticket, a window set, and still inside it. */
export function refundWindowOpen(
  e: Pick<EventPricing, "refundWindowHours"> & { startsAt: string },
  t: Pick<TicketView, "status" | "amountCents">,
  now: number = Date.now(),
): boolean {
  if (t.status !== "paid") return false
  if (!t.amountCents || t.amountCents <= 0) return false
  const hours = Number(e.refundWindowHours)
  if (!Number.isFinite(hours) || hours < 0 || e.refundWindowHours === null) return false
  const start = Date.parse(e.startsAt)
  if (!Number.isFinite(start)) return false
  return now <= start - hours * HOUR_MS
}

/** One line for the gate: what a person must do before the event's details open to them. */
export type TicketGate =
  | { open: true; via: "free" | "ticket" | "staff" }
  | { open: false; reason: "pay"; priceCents: number; currency: string | null }
  | { open: false; reason: "sold_out" | "sales_closed" | "not_member" | "refunded" }

/** How many seats are left, or null when the event takes everybody. */
export function seatsLeft(capacity: number | null, ticketsSold: number): number | null {
  if (typeof capacity !== "number" || capacity <= 0) return null
  return Math.max(0, capacity - Math.max(0, ticketsSold || 0))
}

/**
 * WHETHER THIS EVENT'S DETAILS OPEN TO THIS PERSON. In order: a free event
 * is open to every member, as it always was; staff see everything; a ticket
 * opens it; a refunded ticket says so plainly; then why they cannot buy one
 * (sold out, sales closed) or the price to pay.
 */
export function ticketGate(
  e: EventPricing & { startsAt: string; cancelled: boolean; capacity: number | null; ticketsSold: number },
  v: { active: boolean; staff: boolean; ticket: TicketView | null },
  now: number = Date.now(),
): TicketGate {
  if (v.staff) return { open: true, via: "staff" }
  if (!v.active) return { open: false, reason: "not_member" }
  if (eventPriceMode(e) === "free") return { open: true, via: "free" }
  if (v.ticket?.status === "paid") return { open: true, via: "ticket" }
  if (v.ticket?.status === "refunded") return { open: false, reason: "refunded" }
  const price = e.priceCents as number
  const left = seatsLeft(e.capacity, e.ticketsSold)
  if (left === 0) return { open: false, reason: "sold_out" }
  if (!salesOpen(e, now)) return { open: false, reason: "sales_closed" }
  return { open: false, reason: "pay", priceCents: price, currency: e.currency }
}

/** "3 seats left", "Sold out", null when there is no capacity. */
export function seatsLeftLabel(capacity: number | null, ticketsSold: number): string | null {
  const left = seatsLeft(capacity, ticketsSold)
  if (left === null) return null
  if (left === 0) return "Sold out"
  return left === 1 ? "1 seat left" : `${left} seats left`
}
