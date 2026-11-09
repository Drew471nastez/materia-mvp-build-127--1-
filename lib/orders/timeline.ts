/**
 * AN ORDER'S TIMELINE, AS DATA
 *
 * What happened to an order, in the order it happened, grouped by day in the
 * creator's time zone, with what comes next (money becoming available, a
 * payout) kept apart at the foot. Worked out here without React so
 * tests/orders-detail.test.ts can check it; app/app/orders/order-detail.tsx
 * only draws it.
 *
 * Three sources, each already the creator's own:
 *   the order's rows        placed, paid, access, receipt email, refunds
 *   its activity            receipts sent again, the email changed
 *                           (app/api/app/orders/[id]/activity)
 *   Stripe                  funds available, payouts
 *                           (app/api/stripe/order-timeline)
 *
 * and, on an order with something to ship, a fourth: its shipments and its
 * own history (lib/physical, physicalEvents below): shipped with tracking,
 * delivered, returns, cancelled, emails to the buyer, and the shop's notes.
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import { dayHeading, itemsLabel, startOfDay, type Order } from "./order-view"
import { reasonLabel } from "@/lib/store/reasons"
import { tt } from "@/lib/i18n/text"
import { formatOrderMoney } from "./money"
import { PAST_PROVIDER_LABEL, paidThroughAirwallex } from "@/lib/payments/past-provider"

export type TimelineTone = "success" | "attention" | "critical" | "neutral" | "upcoming"

export type TimelineGlyph =
  | "placed"
  | "paid"
  | "pending"
  | "failed"
  | "access"
  | "mail"
  | "mail-failed"
  | "resent"
  | "email-changed"
  | "refund"
  | "funds"
  | "payout"
  | "shipped"
  | "delivered"
  | "return"
  | "cancelled"
  | "note"
  | "event"

export interface TimelineEvent {
  id: string
  /** When, or null for a thing known to have happened at an unknown time. */
  at: string | null
  text: string
  detail?: string
  tone: TimelineTone
  glyph: TimelineGlyph
  /** A link the entry carries: a parcel's tracking page. */
  link?: { href: string; label: string }
  /** A note the shop wrote: `text` is the note, drawn as written. */
  note?: boolean
  /** A parcel handed to a carrier: its logo is the entry's mark instead of the truck. */
  carrier?: string | null
}

export interface OrderActivity {
  id: string
  type: "receipt_resent" | "email_changed_by_creator" | "email_updated"
  at: string
  by: "creator" | "buyer"
  failed: boolean
}

export interface StripeStep {
  id: string
  label: string
  description?: string
  timestamp: string | null
  status: string
}


/** "Visa •••• 4242", "PayPal", "No payment needed". Null when nothing says. Names Airwallex on an order it took (lib/payments/past-provider). */
export function paymentMethodOf(order: Order): string | null {
  const line = order.lines[0]
  if (order.totalCents === 0) return tt("No payment needed")
  if (paidThroughAirwallex(line)) {
    const method = cardOrMethod(line)
    return method ? `${method}, ${PAST_PROVIDER_LABEL}` : PAST_PROVIDER_LABEL
  }
  return cardOrMethod(line) ?? (line.stripe_payment_intent_id ? tt("Card") : null)
}

function cardOrMethod(line: Order["lines"][number]): string | null {
  if (line.card_brand) {
    const brand = line.card_brand.replace(/^./, (c) => c.toUpperCase())
    return line.card_last4 ? `${brand} •••• ${line.card_last4}` : brand
  }
  if (line.payment_method === "paypal") return line.paypal_email ? tt("PayPal, {paypal_email}", { paypal_email: line.paypal_email }) : "PayPal"
  if (line.payment_method && line.payment_method !== "card") return line.payment_method.replace(/_/g, " ")
  return null
}

/** The Stripe steps the timeline shows. The rest it already knows from the order itself. */
const STRIPE_STEPS = new Set(["funds_available", "payout_created", "payout_paid"])

function tidy(text: string | undefined): string | undefined {
  const t = (text || "").replace(/\s+[—–]\s+/g, ", ").trim()
  return t || undefined
}

export function orderEvents(order: Order, activity: OrderActivity[] = [], stripe: StripeStep[] = []): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const who = order.customerName || displayEmail(order.customerEmail)
  const where = order.source === "website" ? tt(" on your website") : order.source === "storelib" ? tt(" on Storelib") : ""
  events.push({ id: "placed", at: order.createdAt, text: tt("{value} this order{where}", { value: who ? tt("{who} placed", { who }) : tt("Placed"), where }), tone: "neutral", glyph: "placed" })

  if (order.payment === "failed") {
    events.push({ id: "failed", at: order.createdAt, text: tt("The payment failed"), tone: "critical", glyph: "failed" })
  } else if (order.payment === "pending") {
    events.push({ id: "pending", at: order.createdAt, text: tt("Waiting for the payment to go through"), tone: "attention", glyph: "pending" })
  } else if (order.payment === "voided") {
    /* A cash order cancelled or refused before the cash was collected: nothing was ever paid, so never a green "paid". */
    events.push({ id: "voided", at: order.createdAt, text: tt("Cash on delivery, never collected. Nothing was paid."), tone: "neutral", glyph: "pending" })
  } else if (order.payment === "cash_due") {
    /* Cash on delivery (lib/physical/cash-on-delivery.ts): placed, the money still to collect. */
    events.push({ id: "cash_due", at: order.createdAt, text: tt("{amount} to collect in cash on delivery", { amount: formatOrderMoney(order.totalCents, order.currency) }), tone: "attention", glyph: "pending" })
  } else {
    const method = paymentMethodOf(order)
    events.push({
      id: "paid",
      at: order.createdAt,
      text: order.totalCents > 0 ? tt("{amount} paid", { amount: formatOrderMoney(order.totalCents, order.currency) }) : tt("Free order, nothing to pay"),
      detail: order.totalCents > 0 && method ? method : undefined,
      tone: "success",
      glyph: "paid",
    })
  }

  /* Access is for what downloads; a parcel's progress comes from its shipments (physicalEvents). */
  const digitalItems = order.lines.filter((l) => l.product?.type !== "physical").reduce((n, l) => n + Math.max(1, l.quantity ?? 1), 0)
  const given = order.shipping ? order.lines.some((l) => l.product?.type !== "physical" && (l.status === "completed" || l.status === "refunded")) : order.fulfillment === "fulfilled"
  if (given && digitalItems > 0) {
    events.push({ id: "access", at: order.createdAt, text: tt("Access given to {name}", { name: itemsLabel(order.shipping ? digitalItems : order.itemCount) }), tone: "success", glyph: "access" })
  }

  for (const line of order.lines) {
    const product = order.lines.length > 1 && line.product ? line.product.title : null
    if (line.buyer_notified_at) {
      events.push({
        id: `mail-${line.id}`,
        at: line.buyer_notified_at,
        text: tt("Receipt emailed to {value}", { value: displayEmail(line.buyer_email) || tt("the buyer") }),
        detail: product ?? undefined,
        tone: "success",
        glyph: "mail",
      })
    } else if ((line.buyer_email_last_error || "").trim()) {
      events.push({
        id: `mail-${line.id}`,
        at: null,
        text: tt("The receipt email did not arrive"),
        detail: tidy(line.buyer_email_last_error || undefined),
        tone: "critical",
        glyph: "mail-failed",
      })
    }
    if (line.status === "refunded") {
      /* Never more than the line was charged, whatever was recorded. */
      const charged = line.amount_cents || 0
      const cents = line.refund_amount_cents && line.refund_amount_cents > 0 ? Math.min(line.refund_amount_cents, charged) : charged
      events.push({
        id: `refund-${line.id}`,
        at: line.refunded_at || null,
        text: tt("{amount} refunded{value}", { amount: formatOrderMoney(cents, order.currency), value: product ? tt(" for {product}", { product }) : "" }),
        detail: line.refund_reason ? reasonLabel(line.refund_reason, "refund") : undefined,
        tone: "critical",
        glyph: "refund",
      })
    }
  }

  for (const a of activity) {
    if (a.type === "receipt_resent") {
      events.push({
        id: `activity-${a.id}`,
        at: a.at,
        text: a.failed
          ? tt("Receipt could not be sent again")
          : a.by === "creator"
            ? tt("You sent the receipt again")
            : tt("The buyer asked for the receipt again"),
        tone: a.failed ? "critical" : "neutral",
        glyph: a.failed ? "mail-failed" : "resent",
      })
    } else {
      events.push({
        id: `activity-${a.id}`,
        at: a.at,
        text: a.by === "creator" ? tt("You changed the customer's email") : tt("The buyer changed their email"),
        tone: "neutral",
        glyph: "email-changed",
      })
    }
  }

  for (const step of stripe) {
    if (!STRIPE_STEPS.has(step.id)) continue
    const done = step.status === "completed"
    events.push({
      id: `stripe-${step.id}`,
      at: step.timestamp,
      text: step.id === "funds_available" ? (done ? tt("Available for cash out") : tt("Available for cash out soon")) : step.label,
      detail: step.id === "funds_available" && !done ? tidy(step.description) : undefined,
      tone: done ? "success" : "upcoming",
      glyph: step.id === "funds_available" ? "funds" : "payout",
    })
  }

  return events
}

/* ─── A physical order's own history ─────────────────────────────────── */

/** What lib/physical/orders-server loadOrder says about a parcel, as far as the timeline needs. */
export interface PhysicalHistory {
  pickup: boolean
  shipments: {
    id: string
    status: string
    carrier: string | null
    trackingNumber: string | null
    trackingUrl: string | null
    shippedAt: string | null
    deliveredAt: string | null
    createdAt: string
    items: { quantity: number }[]
  }[]
  events: { id: number | string; kind: string; message: string; actor: string; createdAt: string; detail?: Record<string, unknown> | null }[]
}

/**
 * Entries the rest of the timeline already tells: the order placed and paid
 * and its refunds come from its rows, and a shipment's sending and arrival
 * from the shipment itself, with its tracking. The log keeps them too; here
 * they would be said twice.
 */
const TOLD_ELSEWHERE = new Set(["checkout.started", "payment.paid", "payment.refunded", "fulfillment.created", "fulfillment.delivered"])

function glyphOfKind(kind: string): { glyph: TimelineGlyph; tone: TimelineTone } {
  if (kind === "note") return { glyph: "note", tone: "neutral" }
  if (kind === "order.cancelled") return { glyph: "cancelled", tone: "critical" }
  if (kind === "fulfillment.cancelled") return { glyph: "cancelled", tone: "neutral" }
  if (kind === "fulfillment.failed") return { glyph: "failed", tone: "critical" }
  /* A tracked parcel never marked delivered 60 days on (lib/physical/unconfirmed-delivery-server.ts): for the seller to follow up. */
  if (kind === "delivery.unconfirmed") return { glyph: "pending", tone: "attention" }
  if (kind === "fulfillment.manual_needed" || kind.startsWith("inventory.")) return { glyph: "pending", tone: "attention" }
  if (kind.startsWith("fulfillment.")) return { glyph: "shipped", tone: "neutral" }
  if (kind === "order.processing" || kind === "order.unprocessing") return { glyph: "pending", tone: "neutral" }
  if (kind === "return.requested") return { glyph: "return", tone: "attention" }
  if (kind.startsWith("return.")) return { glyph: "return", tone: "neutral" }
  if (kind === "email.sent") return { glyph: "mail", tone: "neutral" }
  if (kind === "job.failed") return { glyph: "mail-failed", tone: "critical" }
  return { glyph: "event", tone: "neutral" }
}

const count = (n: number) => tt("{n, plural, one {# item} other {# items}}", { n })

/**
 * A physical order's entries: each shipment sent (with its carrier, number
 * and tracking link) and delivered, then everything else its log holds,
 * the shop's notes among them.
 */
export function physicalEvents(p: PhysicalHistory): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const s of p.shipments) {
    const n = s.items.reduce((sum, i) => sum + i.quantity, 0)
    const tracking = [s.carrier, s.trackingNumber].filter(Boolean).join(" ")
    events.push({
      id: `ship-${s.id}`,
      at: s.shippedAt ?? s.createdAt,
      text: p.pickup ? tt("{count} ready for pickup", { count: count(n) }) : tt("{count} shipped", { count: count(n) }),
      detail: p.pickup ? undefined : tracking || tt("No tracking number"),
      link: !p.pickup && s.trackingUrl ? { href: s.trackingUrl, label: tt("Track") } : undefined,
      tone: "success",
      glyph: "shipped",
      carrier: p.pickup ? null : s.carrier,
    })
    if (s.status === "delivered" && s.deliveredAt) {
      events.push({ id: `delivered-${s.id}`, at: s.deliveredAt, text: p.pickup ? tt("{count} picked up", { count: count(n) }) : tt("{count} delivered", { count: count(n) }), tone: "success", glyph: "delivered" })
    }
  }
  for (const e of p.events) {
    if (TOLD_ELSEWHERE.has(e.kind)) continue
    const { glyph, tone } = glyphOfKind(e.kind)
    if (e.kind === "note") {
      const full = typeof e.detail?.text === "string" ? (e.detail.text as string) : e.message
      events.push({ id: `event-${e.id}`, at: e.createdAt, text: full, note: true, tone, glyph })
      continue
    }
    events.push({ id: `event-${e.id}`, at: e.createdAt, text: e.message, tone, glyph })
  }
  return events
}

export interface TimelineGroup {
  key: string
  /** "Today", "Yesterday", "April 7", or "Next" for what has not happened. */
  day: string
  upcoming: boolean
  events: TimelineEvent[]
}

/**
 * Oldest first, one heading per day. An event with no time of its own sits
 * in the day of the one before it. What has not happened yet goes last,
 * under "Next", in the order it will happen.
 */
export function groupTimeline(events: TimelineEvent[], now: number, timeZone: string): TimelineGroup[] {
  const done = events.filter((e) => e.tone !== "upcoming")
  const next = events.filter((e) => e.tone === "upcoming")
  const time = (e: TimelineEvent) => (e.at ? Date.parse(e.at) : Number.NaN)
  /* Stable, with an undated event kept right after the one it followed. */
  const dated = done.map((e, i) => ({ e, i, t: time(e) }))
  let carry = Number.NEGATIVE_INFINITY
  for (const d of dated) {
    if (Number.isNaN(d.t)) d.t = carry
    else carry = d.t
  }
  dated.sort((a, b) => a.t - b.t || a.i - b.i)

  const groups: TimelineGroup[] = []
  for (const { e, t } of dated) {
    const dayKey = Number.isFinite(t) ? String(startOfDay(t, timeZone)) : groups.at(-1)?.key ?? "earlier"
    const last = groups.at(-1)
    if (last && last.key === dayKey) last.events.push(e)
    else groups.push({ key: dayKey, day: e.at ? dayHeading(e.at, now, timeZone) : tt("Earlier"), upcoming: false, events: [e] })
  }
  if (next.length > 0) {
    next.sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity))
    groups.push({ key: "next", day: tt("Next"), upcoming: true, events: next })
  }
  return groups
}

/** "Just now", "12 min ago", "3 h ago"; null past a day, where the day heading and a time say it better. */
export function relativeTime(iso: string, now: number): string | null {
  const diff = now - Date.parse(iso)
  if (!Number.isFinite(diff) || diff < 0) return null
  if (diff < 60_000) return tt("Just now")
  if (diff < 3_600_000) return tt("{value} min ago", { value: Math.floor(diff / 60_000) })
  if (diff < 24 * 3_600_000) return tt("{value} h ago", { value: Math.floor(diff / 3_600_000) })
  return null
}
