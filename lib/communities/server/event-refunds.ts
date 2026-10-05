import "server-only"

/**
 * ===========================================================================
 *  GIVING A TICKET'S MONEY BACK
 * ===========================================================================
 * One ticket, or every ticket on a cancelled event. The money goes back the
 * way /app's Orders and the community's membership refunds already do
 * (./membership-lifecycle.ts): a refund of the destination charge with
 * reverse_transfer, so the creator's share comes back from their connected
 * account rather than out of Storelib's. Then the seat goes back
 * (community_event_ticket_release), which also sets the person's "going"
 * answer to cancelled, so the attendee list and the reminders stop counting
 * them with no extra work.
 *
 * THE ORDER MATTERS: Stripe first, the seat second. A refund that fails
 * leaves the ticket exactly as it was, so the holder is never told their
 * money is coming when it is not. A refund that goes through under the same
 * idempotency key twice is one refund, and the release answers changed:false
 * the second time.
 *
 * A FREE TICKET (an invite, or a grant) has no payment: the seat goes back
 * and nothing is asked of Stripe.
 *
 * A HOLDER'S OWN REFUND is only allowed inside the window the event set
 * (refundWindowOpen); outside it the route answers refund_closed and shows
 * the event's refund policy words instead of a button.
 *
 * Every Stripe call goes through `deps`, so the suite runs all of it
 * against a stub (tests/communities-paid-events.test.ts).
 */
import { refundWindowOpen } from "../event-tickets"
import type { CommunityRow } from "../types"
import { audit } from "./audit"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { pricingOf, readPricedEvent, readTicketRow, releaseTicket, ticketsReady, type TicketRow } from "./event-tickets"

export interface TicketRefundLike {
  id: string
  status: string | null
  currency: string | null
}

export interface TicketRefundDeps {
  /** Stripe's refund of the destination charge, under an idempotency key. */
  createRefund: (params: { payment_intent: string; amount?: number; reason?: string; reverse_transfer?: boolean; metadata?: Record<string, string> }, idempotencyKey: string) => Promise<TicketRefundLike>
  /** The platform ledger catches up (lib/stripe/refund-sync), or charge.refunded does it later. */
  afterRefund: (paymentIntentId: string) => Promise<void>
}

export function defaultTicketRefundDeps(db: Db): TicketRefundDeps {
  return {
    createRefund: async (params, key) => {
      const { stripe } = await import("@/lib/stripe")
      const r = await stripe.refunds.create(params as never, { idempotencyKey: key })
      return { id: r.id, status: r.status ?? null, currency: r.currency ?? null }
    },
    afterRefund: async (paymentIntentId) => {
      try {
        const [{ stripe }, { syncChargeRefund }] = await Promise.all([import("@/lib/stripe"), import("@/lib/stripe/refund-sync")])
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] })
        const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null
        if (charge) await syncChargeRefund(db, stripe, charge as never)
      } catch (e) {
        console.error(`[communities] ticket refund ledger now failed; charge.refunded will apply it: ${reasonOf(e)}`)
      }
    },
  }
}

type Refusal = { ok: false; status: number; error: string }
const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error })

/**
 * ONE REFUND PER TICKET AND AMOUNT, whichever page asked for it. The amount
 * is in the key, so a second press is the same refund and Stripe answers
 * with the one already made.
 */
function refundKey(ticket: TicketRow): string {
  return `storelib-event-ticket-refund:${ticket.id}:${ticket.amount_cents ?? 0}`
}

/** The row in community_refunds (part 101), so the member is emailed once per Stripe refund. */
async function recordRefund(db: Db, a: { communityId: string; ticket: TicketRow; refundId: string; amountCents: number; currency: string; actorId: string; reason: string | null }): Promise<void> {
  try {
    const { error } = await db.from("community_refunds").insert({
      community_id: a.communityId,
      /* There is no order behind a ticket, so the ticket is the thing refunded. */
      order_id: a.ticket.id,
      stripe_refund_id: a.refundId,
      member_user_id: a.ticket.user_id,
      amount_cents: a.amountCents,
      currency: a.currency,
      full_refund: true,
      reason: a.reason ? a.reason.slice(0, 500) : null,
      refunded_by: a.actorId,
      ended_membership: false,
      emailed_at: null,
    })
    if (error && !missing(error) && error.code !== "23505") console.error(`[communities] ticket refund not recorded: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] ticket refund not recorded: ${reasonOf(e)}`)
  }
}

/**
 * ONE TICKET'S MONEY BACK, and its seat. Staff ask with refund_tickets; the
 * holder asks for their own, and only inside the event's refund window. The
 * amount is the ticket's own, never anything a page sent.
 */
export async function refundTicket(
  db: Db,
  a: { community: CommunityRow; ticketId: string; actorId: string; reason?: string | null; byHolder?: boolean },
  deps: TicketRefundDeps = defaultTicketRefundDeps(db),
): Promise<{ ok: true; amountCents: number; userId: string } | Refusal> {
  if (!(await ticketsReady(db))) return refuse(409, "not_set_up")
  let ticket: TicketRow | null = null
  try {
    const { data, error } = await db.from("community_event_tickets").select("*").eq("id", a.ticketId).eq("community_id", a.community.id).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] ticket refund read: ${reasonOf(error)}`)
      return refuse(missing(error) ? 409 : 500, missing(error) ? "not_set_up" : "failed")
    }
    ticket = (data as TicketRow | null) ?? null
  } catch (e) {
    console.error(`[communities] ticket refund read: ${reasonOf(e)}`)
    return refuse(500, "failed")
  }
  if (!ticket) return refuse(404, "not_found")
  if (ticket.status === "refunded") return refuse(409, "already_refunded")
  if (ticket.status !== "paid") return refuse(409, "not_paid")
  if (a.byHolder) {
    if (ticket.user_id !== a.actorId) return refuse(403, "forbidden")
    const event = await readPricedEvent(db, a.community.id, ticket.event_id)
    if (!event) return refuse(404, "not_found")
    const amount = ticket.amount_cents ?? 0
    /* A free seat is always theirs to give up; a paid one only inside the window the event set. */
    if (amount > 0 && !refundWindowOpen({ ...pricingOf(event), startsAt: event.starts_at }, { status: "paid", amountCents: amount })) return refuse(409, "refund_closed")
  }
  const reason = a.reason ? a.reason.slice(0, 500) : null
  const amountCents = Math.max(0, ticket.amount_cents ?? 0)

  /* AN INVITED OR GRANTED SEAT COST NOTHING: the seat goes back and Stripe is not asked. */
  if (amountCents === 0 || !ticket.payment_intent_id) {
    const freed = await releaseTicket(db, { ticketId: ticket.id, status: "refunded", reason })
    if (freed.ok === false) return freed
    await audit(db, {
      communityId: a.community.id,
      actorId: a.actorId,
      actorKind: "member",
      action: "event.ticket_released",
      targetType: "event_ticket",
      targetId: ticket.id,
      reason,
      detail: { eventId: ticket.event_id, userId: ticket.user_id, amountCents: 0, byHolder: a.byHolder === true },
    })
    return { ok: true, amountCents: 0, userId: ticket.user_id }
  }

  let refund: TicketRefundLike
  try {
    refund = await deps.createRefund(
      {
        payment_intent: ticket.payment_intent_id,
        amount: amountCents,
        reason: "requested_by_customer",
        /* Destination charge: the creator's share comes back from their connected account, as from Orders. */
        reverse_transfer: true,
        metadata: {
          community_event_ticket_id: ticket.id,
          community_event_id: ticket.event_id,
          community_id: a.community.id,
          refund_reason: reason || "requested_by_customer",
          refunded_by: a.actorId,
        },
      },
      refundKey(ticket),
    )
  } catch (e) {
    console.error(`[communities] ticket refund failed for ${ticket.id}: ${reasonOf(e)}`)
    return refuse(502, "stripe")
  }
  if (refund.status === "failed" || refund.status === "canceled") return refuse(402, "refund_failed")

  /* THE SEAT ONLY AFTER THE MONEY: a refund that did not happen never frees a seat. */
  const freed = await releaseTicket(db, { ticketId: ticket.id, status: "refunded", reason })
  if (freed.ok === false) {
    console.error(`[communities] ticket ${ticket.id} refunded (${refund.id}) but the seat did not go back: ${freed.error}`)
    return refuse(500, "seat_not_released")
  }
  const currency = (refund.currency || ticket.currency || "usd").toLowerCase()
  await recordRefund(db, { communityId: a.community.id, ticket, refundId: refund.id, amountCents, currency, actorId: a.actorId, reason })
  await deps.afterRefund(ticket.payment_intent_id).catch(() => undefined)
  await audit(db, {
    communityId: a.community.id,
    actorId: a.actorId,
    actorKind: "member",
    action: "event.ticket_refunded",
    targetType: "event_ticket",
    targetId: ticket.id,
    reason,
    detail: { eventId: ticket.event_id, userId: ticket.user_id, amountCents, currency, refundId: refund.id, byHolder: a.byHolder === true, at: nowIso() },
  })
  return { ok: true, amountCents, userId: ticket.user_id }
}

/**
 * EVERY TICKET ON ONE EVENT, a page at a time. A cancelled event gives
 * everybody their money back, however many went: the paid tickets are read
 * 50 at a time and never all at once, one failure does not stop the rest,
 * and the counts are what actually happened.
 */
export async function refundEveryTicket(
  db: Db,
  a: { community: CommunityRow; eventId: string; actorId: string; reason?: string | null },
  deps: TicketRefundDeps = defaultTicketRefundDeps(db),
): Promise<{ refunded: number; failed: number; totalCents: number }> {
  const out = { refunded: 0, failed: 0, totalCents: 0 }
  if (!(await ticketsReady(db))) return out
  const PAGE = 50
  /* A refunded ticket leaves the 'paid' set, so the first page is always the next work: no cursor, no loop. */
  for (let round = 0; round < 400; round += 1) {
    let ids: string[] = []
    try {
      const { data, error } = await db
        .from("community_event_tickets")
        .select("id")
        .eq("event_id", a.eventId)
        .eq("community_id", a.community.id)
        .eq("status", "paid")
        .order("created_at", { ascending: true })
        .limit(PAGE)
      if (error) {
        if (!missing(error)) console.error(`[communities] refund every ticket: ${reasonOf(error)}`)
        return out
      }
      ids = ((data as { id: string }[] | null) ?? []).map((r) => r.id)
    } catch (e) {
      console.error(`[communities] refund every ticket: ${reasonOf(e)}`)
      return out
    }
    if (ids.length === 0) break
    let changed = 0
    for (const id of ids) {
      const done = await refundTicket(db, { community: a.community, ticketId: id, actorId: a.actorId, reason: a.reason ?? "the event was cancelled" }, deps)
      if (done.ok) {
        out.refunded += 1
        out.totalCents += done.amountCents
        changed += 1
      } else {
        out.failed += 1
      }
    }
    /* Nothing on this page could be refunded: a second round would read the same rows for ever. */
    if (changed === 0) break
  }
  return out
}
