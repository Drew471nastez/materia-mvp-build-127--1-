import "server-only"

/**
 * ===========================================================================
 *  A TICKET'S CHECKOUT: STRIPE EMBEDDED CHECKOUT, INSIDE THE COMMUNITY
 * ===========================================================================
 * A paid event is bought in a sheet on the event's page, never through the
 * Storelib checkout pages and never as a product: a ticket is not one. This
 * file is ./learn-checkout.ts for events, and deliberately the same shape,
 * so there is one way a community takes money.
 *
 * THE SESSION is a Checkout Session in embedded mode that never redirects
 * (the sheet hears onComplete). It is paid the way every Storelib sale is: a
 * destination charge on the platform, the creator's connected account as the
 * destination and the platform's fee kept back (application_fee_amount),
 * only when that account can take payments. The price, the title and the
 * account are all read here from the event's own row and the community's
 * creator; nothing the page sends is. The PaymentIntent's metadata names no
 * product, so the product checkout's fulfilment (lib/checkout/fulfil-payment
 * isCheckoutIntent) never takes it for a sale of a product.
 *
 * THE SEAT IS HELD FIRST. community_event_ticket_hold keeps a seat for 30
 * minutes in one locked statement before Stripe is asked for anything, so
 * two people cannot both buy the last seat; if Stripe then fails, the hold
 * goes straight back. A hold nobody pays for is tidied by the job sweep
 * (releaseDeadHolds, app/api/cron/community).
 *
 * THE TICKET comes from the session, once paid: from Stripe's webhook
 * (app/api/stripe/webhook, checkout.session.completed and
 * async_payment_succeeded) or from the sheet asking right after onComplete,
 * whichever is first. community_event_ticket_pay is keyed on the session, so
 * the second call answers created:false and changes nothing: one payment is
 * exactly one ticket.
 *
 * Stripe and the two payment checks are handed in, so the tests run all of
 * it against a stub.
 */
import type Stripe from "stripe"
import { TICKET_HOLD_MINUTES, eventPriceMode, salesOpen } from "../event-tickets"
import type { CommunityRow, EventRow } from "../types"
import type { Viewer } from "./context"
import { type Db } from "./db"
import { claimHoldSession, holdSeat, payTicket, pricingOf, readPricedEvent, readTicketRow, releaseTicket, ticketsReady } from "./event-tickets"
import type { CheckoutDeps, CheckoutStart, PlatformFee, StripeSessions } from "./learn-checkout"
import { stripeIdempotencyKey } from "@/lib/stripe/resilience"

export type { CheckoutDeps, CheckoutStart, PlatformFee, StripeSessions }

export const EVENT_SESSION_KIND = "community_event"

const refuse = (status: number, code: string, error: string): CheckoutStart => ({ ok: false, status, code, error })

/** A token for this attempt, so the seat is held before Stripe has given a session id. */
function holdToken(eventId: string, userId: string): string {
  return `hold_${eventId.slice(0, 8)}_${userId.slice(0, 8)}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Everything Stripe is asked for, from the server's own facts. Pure, so the tests can read it. */
/*
  THE FORM LIVES NO LONGER THAN THE SEAT. A seat is held TICKET_HOLD_MINUTES
  plus a margin, and Stripe's form closes a minute before that hold ends
  (Stripe allows thirty minutes at the least). Before, the form stayed
  payable for Stripe's default day while the seat went back after half an
  hour, so a form left open could be paid for a seat sold to somebody else.
*/
export const EVENT_HOLD_MINUTES = TICKET_HOLD_MINUTES + 2
export const EVENT_FORM_MINUTES = EVENT_HOLD_MINUTES - 1

/**
 * AN EARLIER FORM FOR THE SAME SEAT IS CLOSED BEFORE A NEW ONE OPENS. The
 * hold keeps one session per member and event, so with a second tab both
 * forms could be paid and only one became a ticket: the buyer was charged
 * twice. "paid" when the earlier form was already paid (its ticket is on
 * the way), "closed" when it can no longer be paid, "open" when Stripe
 * could not say.
 */
export async function closeEarlierForm(stripe: StripeSessions, sessionId: string): Promise<"paid" | "closed" | "open"> {
  const sessions = stripe.checkout.sessions
  if (!sessions.expire) return "closed"
  try {
    await sessions.expire(sessionId)
    return "closed"
  } catch {
    try {
      const s = await sessions.retrieve(sessionId)
      if (s.status === "complete" || s.payment_status === "paid") return "paid"
      return s.status === "expired" ? "closed" : "open"
    } catch {
      return "open"
    }
  }
}

export function eventCheckoutParams(p: {
  event: Pick<EventRow, "id" | "title" | "cover_url" | "starts_at"> & { price_cents?: number | null }
  community: Pick<CommunityRow, "id" | "name" | "slug">
  buyer: { userId: string; email: string | null }
  creatorId: string
  destination: string
  currency: string
  fee: PlatformFee
  now?: number
}): Stripe.Checkout.SessionCreateParams {
  const amount = p.event.price_cents as number
  const metadata: Record<string, string> = {
    kind: EVENT_SESSION_KIND,
    community_event_id: p.event.id,
    community_id: p.community.id,
    community_slug: p.community.slug.slice(0, 200),
    buyer_id: p.buyer.userId,
    creator_id: p.creatorId,
    price_cents: String(amount),
    platform_fee_cents: String(p.fee.platformFeeCents),
    fee_percent: String(p.fee.feePercent),
    fee_fixed_cents: String(p.fee.feeFixedCents),
    plan_used: p.fee.planId,
    pricing_tier: p.fee.pricingTier ?? "standard",
    fee_rule_version: p.fee.feeRuleVersion ?? "",
  }
  const cover = p.event.cover_url && /^https:\/\//.test(p.event.cover_url) ? [p.event.cover_url] : undefined
  const title = (p.event.title || "Event").slice(0, 250)
  return {
    mode: "payment",
    ui_mode: "embedded",
    expires_at: Math.floor((p.now ?? Date.now()) / 1000) + EVENT_FORM_MINUTES * 60,
    redirect_on_completion: "never",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: p.currency,
          unit_amount: amount,
          product_data: {
            name: title,
            description: `One ticket for ${title} in ${p.community.name}`.slice(0, 500),
            ...(cover ? { images: cover } : {}),
          },
        },
      },
    ],
    ...(p.buyer.email ? { customer_email: p.buyer.email } : {}),
    client_reference_id: p.buyer.userId,
    payment_intent_data: {
      application_fee_amount: p.fee.platformFeeCents,
      transfer_data: { destination: p.destination },
      description: `Ticket: ${title.slice(0, 160)} (${p.community.name.slice(0, 200)})`,
      metadata,
    },
    metadata,
  }
}

/**
 * A session for this member and this paid event, or why not: no such event,
 * free, cancelled, sales closed, sold out, already theirs, or the creator
 * not able to take payments. A seat is held before Stripe is asked, and
 * given straight back if Stripe does not answer with a form.
 */
export async function startEventCheckout(db: Db, deps: CheckoutDeps, a: { community: CommunityRow; viewer: Viewer; eventId: string; email: string | null }): Promise<CheckoutStart> {
  const { community, viewer } = a
  if (!community.events_enabled) return refuse(404, "not_found", "That event is not here.")
  if (!viewer.userId || !viewer.active) return refuse(403, "not_member", "Join the community first.")
  /* Before run-now part 105 no event has a price, so there is nothing to buy and nothing throws. */
  if (!(await ticketsReady(db))) return refuse(409, "free", "This event is free. Say you are going instead.")
  const event = await readPricedEvent(db, community.id, a.eventId)
  if (!event || event.id !== a.eventId) return refuse(404, "not_found", "That event is not here.")
  if (event.status === "cancelled") return refuse(409, "cancelled", "This event was cancelled.")
  if (event.status !== "scheduled") return refuse(409, "closed", "This event is not open for tickets.")
  const pricing = pricingOf(event)
  if (eventPriceMode(pricing) === "free") return refuse(409, "free", "This event is free. Say you are going instead.")
  if (!salesOpen({ ...pricing, startsAt: event.starts_at, cancelled: false })) return refuse(409, "sales_closed", "Tickets for this event have closed.")
  const mine = await readTicketRow(db, event.id, viewer.userId)
  if (mine?.status === "paid") return refuse(409, "already_paid", "You already have a ticket for this event.")
  if (pricing.currency && pricing.currency !== deps.chargeCurrency) return refuse(409, "price_changed", "This event's price is being updated. Try again later.")
  if (!community.creator_id) return refuse(409, "seller_unavailable", "This community cannot take payments right now.")
  const { data: creator } = await db.from("creators").select("id, stripe_account_id").eq("id", community.creator_id).maybeSingle()
  const account = (creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
  if (!account || !account.startsWith("acct_") || !(await deps.ready(community.creator_id))) return refuse(409, "seller_unavailable", "This community cannot take payments right now. Nothing was charged.")
  let fee: PlatformFee
  try {
    fee = await deps.fee(pricing.priceCents as number, community.creator_id, deps.chargeCurrency)
  } catch {
    return refuse(400, "currency", "This currency is not available for checkout yet.")
  }
  const earlier = mine?.checkout_session_id?.startsWith("cs_") && (mine.status === "held" || mine.status === "cancelled") ? mine.checkout_session_id : null
  if (earlier) {
    const closed = await closeEarlierForm(deps.stripe, earlier)
    if (closed === "paid" && mine?.status === "held") return refuse(409, "already_paid", "You already paid for this ticket. It shows here in a moment.")
    if (closed === "open") return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
  }
  /* THE SEAT, BEFORE STRIPE: one locked statement decides it, so the last seat is never sold twice. */
  const held = await holdSeat(db, { eventId: event.id, userId: viewer.userId, session: holdToken(event.id, viewer.userId), minutes: EVENT_HOLD_MINUTES })
  if (held.ok === false) {
    if (held.error === "full") return refuse(409, "full", "This event is sold out.")
    if (held.error === "sales_closed") return refuse(409, "sales_closed", "Tickets for this event have closed.")
    if (held.error === "already_paid") return refuse(409, "already_paid", "You already have a ticket for this event.")
    if (held.error === "free") return refuse(409, "free", "This event is free. Say you are going instead.")
    if (held.error === "not_found") return refuse(404, "not_found", "That event is not here.")
    return refuse(500, "failed", "The ticket could not be held. Nothing was charged. Try again.")
  }
  try {
    const params = eventCheckoutParams({ event, community, buyer: { userId: viewer.userId, email: a.email }, creatorId: community.creator_id, destination: account, currency: deps.chargeCurrency, fee })
    /* A double tap on Buy inside a minute opens the same payment form, not a second one (lib/stripe/resilience). */
    const session = await deps.stripe.checkout.sessions.create(params, { idempotencyKey: stripeIdempotencyKey("community-event", [community.id, event.id, viewer.userId], params) })
    if (!session.client_secret) {
      await releaseTicket(db, { ticketId: held.ticketId, status: "cancelled", reason: "the payment form did not load" })
      return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
    }
    /* The held seat now carries the real session, so the webhook and the sheet find the same row. */
    await claimHoldSession(db, held.ticketId, session.id)
    return { ok: true, clientSecret: session.client_secret, sessionId: session.id, amountCents: pricing.priceCents as number, currency: deps.chargeCurrency }
  } catch (e) {
    await releaseTicket(db, { ticketId: held.ticketId, status: "cancelled", reason: "checkout could not start" })
    console.error("[communities] event checkout:", e instanceof Error ? e.message.slice(0, 200) : "unknown")
    return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
  }
}

/** A Checkout Session this file made. */
export function isEventSession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  const m = session.metadata ?? {}
  return m.kind === EVENT_SESSION_KIND && typeof m.community_event_id === "string" && typeof m.buyer_id === "string"
}

export type GrantAnswer = { ok: true; created: boolean; eventId: string; ticketId: string } | { ok: false; status: number; error: string }

/**
 * THE TICKET IS THEIRS, FROM A PAID SESSION: the webhook's call and the
 * sheet's. Only a session this file made, paid, for an event still in the
 * community it names, for the buyer it names (and, from the sheet, that
 * buyer must be the one asking). Calling it twice grants once.
 */
export async function grantFromSession(db: Db, session: Stripe.Checkout.Session, opts: { userId?: string } = {}): Promise<GrantAnswer> {
  if (!isEventSession(session)) return { ok: false, status: 400, error: "not_an_event_session" }
  const m = session.metadata as Record<string, string>
  if (opts.userId && m.buyer_id !== opts.userId) return { ok: false, status: 403, error: "forbidden" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, error: "not_paid" }
  const event = await readPricedEvent(db, m.community_id, m.community_event_id)
  if (!event || event.id !== m.community_event_id) return { ok: false, status: 404, error: "not_found" }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)
  const fee = Number(m.platform_fee_cents)
  const done = await payTicket(db, {
    sessionId: session.id,
    eventId: event.id,
    userId: m.buyer_id,
    paymentIntentId: intent,
    amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: session.currency ?? null,
    platformFeeCents: Number.isFinite(fee) ? fee : null,
  })
  if (done.ok === false) return { ok: false, status: done.status, error: done.error }
  /* The receipt and the "you're going" row, once per ticket: the webhook and the sheet both land here, and only the one that created it tells anybody. */
  if (done.created) {
    const { ticketPaidNotice } = await import("./jobs/event_ticket_notify")
    await ticketPaidNotice(db, {
      communityId: m.community_id,
      eventId: event.id,
      ticketId: done.ticketId,
      userId: m.buyer_id,
      amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
      currency: session.currency ?? null,
      source: "purchase",
    }).catch(() => "skipped" as const)
  }
  return { ok: true, created: done.created, eventId: event.id, ticketId: done.ticketId }
}

/** The sheet's question after onComplete: the session read from Stripe again, never trusted from the page. */
export async function confirmEventCheckout(db: Db, stripe: StripeSessions, a: { sessionId: unknown; userId: string }): Promise<GrantAnswer> {
  const id = typeof a.sessionId === "string" && /^cs_[A-Za-z0-9_]{8,255}$/.test(a.sessionId) ? a.sessionId : null
  if (!id) return { ok: false, status: 400, error: "bad_session" }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch {
    return { ok: false, status: 502, error: "stripe" }
  }
  return grantFromSession(db, session, { userId: a.userId })
}

/**
 * A FULL REFUND TAKES THE SEAT BACK (app/api/stripe/webhook,
 * charge.refunded), whoever made the refund and wherever from: the ticket on
 * that payment is marked refunded and the seat goes back to the event.
 * Never throws; nothing to do for any other payment.
 */
export async function revokeRefundedTicket(db: Db, paymentIntentId: string | null | undefined): Promise<number> {
  if (!paymentIntentId) return 0
  if (!(await ticketsReady(db))) return 0
  try {
    const { data, error } = await db.from("community_event_tickets").select("id").eq("payment_intent_id", paymentIntentId).eq("status", "paid").limit(50)
    if (error) return 0
    let freed = 0
    for (const row of (data as { id: string }[] | null) ?? []) {
      const done = await releaseTicket(db, { ticketId: row.id, status: "refunded", reason: "refunded in full" })
      if (done.ok && done.changed) freed += 1
    }
    return freed
  } catch {
    return 0
  }
}
