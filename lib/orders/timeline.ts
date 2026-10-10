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
 */
import { dayHeading, itemsLabel, startOfDay, type Order } from "./order-view"
import { reasonLabel } from "@/lib/store/reasons"

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

export interface TimelineEvent {
  id: string
  /** When, or null for a thing known to have happened at an unknown time. */
  at: string | null
  text: string
  detail?: string
  tone: TimelineTone
  glyph: TimelineGlyph
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

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const formatMoney = (cents: number) => money.format((cents || 0) / 100)

/** "Visa •••• 4242", "PayPal", "No payment needed". Null when nothing says. */
export function paymentMethodOf(order: Order): string | null {
  const line = order.lines[0]
  if (order.totalCents === 0) return "No payment needed"
  if (line.card_brand) {
    const brand = line.card_brand.replace(/^./, (c) => c.toUpperCase())
    return line.card_last4 ? `${brand} •••• ${line.card_last4}` : brand
  }
  if (line.payment_method === "paypal") return line.paypal_email ? `PayPal, ${line.paypal_email}` : "PayPal"
  if (line.payment_method && line.payment_method !== "card") return line.payment_method.replace(/_/g, " ")
  return line.stripe_payment_intent_id ? "Card" : null
}

/** The Stripe steps the timeline shows. The rest it already knows from the order itself. */
const STRIPE_STEPS = new Set(["funds_available", "payout_created", "payout_paid"])

function tidy(text: string | undefined): string | undefined {
  const t = (text || "").replace(/\s+[—–]\s+/g, ", ").trim()
  return t || undefined
}

export function orderEvents(order: Order, activity: OrderActivity[] = [], stripe: StripeStep[] = []): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const who = order.customerName || order.customerEmail
  const where = order.source === "website" ? " on your website" : order.source === "storelib" ? " on Storelib" : ""
  events.push({ id: "placed", at: order.createdAt, text: `${who ? `${who} placed` : "Placed"} this order${where}`, tone: "neutral", glyph: "placed" })

  if (order.payment === "failed") {
    events.push({ id: "failed", at: order.createdAt, text: "The payment failed", tone: "critical", glyph: "failed" })
  } else if (order.payment === "pending") {
    events.push({ id: "pending", at: order.createdAt, text: "Waiting for the payment to go through", tone: "attention", glyph: "pending" })
  } else {
    const method = paymentMethodOf(order)
    events.push({
      id: "paid",
      at: order.createdAt,
      text: order.totalCents > 0 ? `${formatMoney(order.totalCents)} paid` : "Free order, nothing to pay",
      detail: order.totalCents > 0 && method ? method : undefined,
      tone: "success",
      glyph: "paid",
    })
  }

  if (order.fulfillment === "fulfilled") {
    events.push({ id: "access", at: order.createdAt, text: `Access given to ${itemsLabel(order.itemCount)}`, tone: "success", glyph: "access" })
  }

  for (const line of order.lines) {
    const product = order.lines.length > 1 && line.product ? line.product.title : null
    if (line.buyer_notified_at) {
      events.push({
        id: `mail-${line.id}`,
        at: line.buyer_notified_at,
        text: `Receipt emailed to ${line.buyer_email || "the buyer"}`,
        detail: product ?? undefined,
        tone: "success",
        glyph: "mail",
      })
    } else if ((line.buyer_email_last_error || "").trim()) {
      events.push({
        id: `mail-${line.id}`,
        at: null,
        text: "The receipt email did not arrive",
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
        text: `${formatMoney(cents)} refunded${product ? ` for ${product}` : ""}`,
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
          ? "Receipt could not be sent again"
          : a.by === "creator"
            ? "You sent the receipt again"
            : "The buyer asked for the receipt again",
        tone: a.failed ? "critical" : "neutral",
        glyph: a.failed ? "mail-failed" : "resent",
      })
    } else {
      events.push({
        id: `activity-${a.id}`,
        at: a.at,
        text: a.by === "creator" ? "You changed the customer's email" : "The buyer changed their email",
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
      text: step.id === "funds_available" ? (done ? "Available for cash out" : "Available for cash out soon") : step.label,
      detail: step.id === "funds_available" && !done ? tidy(step.description) : undefined,
      tone: done ? "success" : "upcoming",
      glyph: step.id === "funds_available" ? "funds" : "payout",
    })
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
    else groups.push({ key: dayKey, day: e.at ? dayHeading(e.at, now, timeZone) : "Earlier", upcoming: false, events: [e] })
  }
  if (next.length > 0) {
    next.sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity))
    groups.push({ key: "next", day: "Next", upcoming: true, events: next })
  }
  return groups
}

/** "Just now", "12 min ago", "3 h ago"; null past a day, where the day heading and a time say it better. */
export function relativeTime(iso: string, now: number): string | null {
  const diff = now - Date.parse(iso)
  if (!Number.isFinite(diff) || diff < 0) return null
  if (diff < 60_000) return "Just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
  if (diff < 24 * 3_600_000) return `${Math.floor(diff / 3_600_000)} h ago`
  return null
}
