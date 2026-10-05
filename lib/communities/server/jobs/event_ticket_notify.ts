import "server-only"

/**
 * ===========================================================================
 *  A TICKET, TOLD TO THE PERSON WHOSE TICKET IT IS
 * ===========================================================================
 * One ticket for a paid event (run-now part 105) turns into exactly one
 * message to the holder, and one quiet grouped row to whoever runs the
 * community:
 *
 *   ticketPaidNotice     the moment the ticket is theirs: their receipt by
 *                        email, with the event as a calendar file, and one
 *                        "You are going" row in the community's bell that
 *                        reaches their phone at once. The receipt and the
 *                        row are one message to a person, not two: there is
 *                        no second email saying they are going. A free
 *                        ticket staff gave them says what a ticket costs
 *                        instead of what they paid, never a price.
 *   ticketRefundedNotice what came back, and how long a card takes. For a
 *                        refund that comes from the event being called off
 *                        it is the cancelled message instead, which says
 *                        both things at once, so nobody is sent two.
 *   cancelledHolderNotice the same cancelled message, for a caller that
 *                        already holds the event and community (the fan out
 *                        job walking the holders of a cancelled event).
 *
 * ONCE PER TICKET. Every email key names the ticket (or the event, for a
 * cancellation) and every bell row has its own dedupe key, so the webhook
 * and the sheet's confirm arriving in either order, a job run again or a
 * refund tried twice all send one message.
 *
 * NOTHING HERE CAN FAIL THE MONEY. Every path catches and logs; a receipt
 * that could not be drawn must never undo a payment or a refund.
 *
 * BEFORE PART 105 none of this is ever called: there are no tickets, so
 * events behave exactly as they do today.
 */
import { pricingOf, readPricedEvent, ticketsReady } from "../event-tickets"
import { eventPriceLabel, type EventPricing, type TicketSource } from "../../event-tickets"
import { eventTime } from "../../format"
import type { EventRow } from "../../types"
import { sendCommunityEmail, type CommunityEmailKind } from "../email"
import { notifyMember, notifyTicketSale } from "../notify"
import { missing, reasonOf, type Db } from "../db"
import { readChoices } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface TicketCommunity {
  id: string
  slug: string
  name: string
  owner_user_id: string | null
}

/** Everything a ticket message says that is not about the person: the community, the event and its money. */
export interface TicketNoticeContext {
  community: TicketCommunity
  event: EventRow
  pricing: EventPricing
  /** This event's refund words, else the community's (part 101), else null. */
  refundPolicy: string | null
}

const COMMUNITY_COLUMNS = "id, slug, name, owner_user_id, status, suspended_at, deleted_at"

/** The community's own refund words, read softly: before part 101 there is no column and the answer is null. */
async function communityRefundPolicy(db: Db, communityId: string): Promise<string | null> {
  const { data, error } = await db.from("communities").select("refund_policy").eq("id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] refund policy read: ${reasonOf(error)}`)
    return null
  }
  const value = (data as { refund_policy?: string | null } | null)?.refund_policy
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * The event and its community, or null when there is nothing to say (no such
 * event, or a community that is suspended, deleted or gone).
 */
export async function ticketNoticeContext(db: Db, communityId: string, eventId: string): Promise<TicketNoticeContext | null> {
  if (!UUID.test(communityId) || !UUID.test(eventId)) return null
  try {
    const { data, error } = await db.from("communities").select(COMMUNITY_COLUMNS).eq("id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] ticket notice community: ${reasonOf(error)}`)
      return null
    }
    const c = data as (TicketCommunity & { status: string; suspended_at: string | null; deleted_at: string | null }) | null
    if (!c || c.deleted_at || c.suspended_at || c.status === "suspended") return null
    const event = await readPricedEvent(db, communityId, eventId)
    if (!event) return null
    const pricing = pricingOf(event)
    const refundPolicy = pricing.refundPolicy?.trim() || (await communityRefundPolicy(db, communityId))
    return { community: { id: c.id, slug: c.slug, name: c.name, owner_user_id: c.owner_user_id ?? null }, event, pricing, refundPolicy }
  } catch (e) {
    console.error(`[communities] ticket notice context: ${reasonOf(e)}`)
    return null
  }
}

/** The event's page in its community. */
export function eventPath(slug: string, eventId: string): string {
  return `/community/${slug}/events/${eventId}`
}

/** "You are going to Darkroom night". */
export function goingTitle(eventTitle: string): string {
  return `You are going to ${eventTitle || "the event"}`.slice(0, 200)
}

/** The zone a time is written in for this person: their own when Storelib knows it, else the event's. */
async function zoneFor(db: Db, userId: string, event: EventRow): Promise<string> {
  try {
    const choice = (await readChoices(db, [userId])).get(userId)
    if (choice?.tz) return choice.tz
  } catch {
    /* The event's own zone below. */
  }
  return event.timezone || "UTC"
}

/** Whether the event is online, the way the reminder email decides it. */
function isOnline(event: EventRow): boolean {
  return !event.location && Boolean(event.meeting_url || event.livestream_url)
}

/** The facts every ticket email shares. */
function eventData(ctx: TicketNoticeContext, zone: string): Record<string, unknown> {
  const e = ctx.event
  return {
    eventId: e.id,
    eventTitle: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at ?? "",
    timezone: zone,
    location: e.location ?? "",
    online: isOnline(e),
    eventUpdatedAt: e.updated_at ?? e.starts_at,
    eventDescription: typeof e.description === "string" ? e.description.slice(0, 600) : "",
    currency: ctx.pricing.currency || "usd",
  }
}

export type TicketNoticeOutcome = "sent" | "skipped"

export interface TicketPaidNotice {
  communityId: string
  eventId: string
  ticketId: string
  userId: string
  /** What they paid, in the smallest unit. Zero or null for a free ticket staff gave them. */
  amountCents?: number | null
  currency?: string | null
  source?: TicketSource
  /** Who invited them, for a free ticket: their name is in the email. */
  invitedByName?: string | null
  /** What staff wrote in the invite sheet, if anything. */
  message?: string | null
  /** True when the caller already knows the communities switch is on, so it is not read again. */
  enabled?: boolean
  now?: number
}

/**
 * THE TICKET IS THEIRS. Called once per ticket, the moment it is paid or
 * given: the receipt (or the invite note), the bell row, and the grouped
 * sales row for whoever runs the community. Answers "skipped" when there is
 * nothing to say and never throws.
 */
export async function ticketPaidNotice(db: Db, a: TicketPaidNotice): Promise<TicketNoticeOutcome> {
  if (!UUID.test(a.userId) || !UUID.test(a.ticketId)) return "skipped"
  try {
    const ctx = await ticketNoticeContext(db, a.communityId, a.eventId)
    if (!ctx) return "skipped"
    const invited = a.source === "invite" || a.source === "grant"
    const paidCents = typeof a.amountCents === "number" ? a.amountCents : null
    const zone = await zoneFor(db, a.userId, ctx.event)
    const path = eventPath(ctx.community.slug, ctx.event.id)
    const when = eventTime(ctx.event.starts_at, ctx.event.ends_at, { timeZone: zone })

    /* ONE ROW, which also reaches their phone at once as a ticket (push-bridge.ts). */
    await notifyMember(db, {
      userId: a.userId,
      communityId: ctx.community.id,
      kind: "event",
      target: { type: "event", id: ctx.event.id },
      title: goingTitle(ctx.event.title),
      body: when,
      url: path,
      dedupeKey: `ticket:${a.ticketId}`,
      pushKind: "ticket",
    })

    /* AND ONE EMAIL, their receipt or the note about the seat they were given. There is never a second one. */
    const kind: CommunityEmailKind = invited ? "event_ticket_invite" : "event_ticket"
    const data: Record<string, unknown> = {
      ...eventData(ctx, zone),
      ...(a.currency ? { currency: a.currency } : {}),
      ...(ctx.refundPolicy ? { refundPolicy: ctx.refundPolicy } : {}),
    }
    if (invited) {
      data.priceCents = ctx.pricing.priceCents ?? 0
      if (a.invitedByName) data.inviterName = a.invitedByName
      if (a.message) data.message = a.message.slice(0, 400)
    } else {
      data.amountCents = paidCents ?? 0
      data.ticketSource = a.source ?? "purchase"
      data.paidAt = new Date(a.now ?? Date.now()).toISOString()
    }
    await sendCommunityEmail(db, kind, { userId: a.userId, communityId: ctx.community.id, data, key: `ticket:${a.ticketId}` }, { enabled: a.enabled })

    /* WHOEVER RUNS IT HEARS SALES, GROUPED, and nothing for a ticket that cost nothing. */
    if (!invited && paidCents && paidCents > 0 && ctx.community.owner_user_id) {
      await notifyTicketSale(db, {
        communityId: ctx.community.id,
        userId: ctx.community.owner_user_id,
        eventId: ctx.event.id,
        eventTitle: ctx.event.title,
        buyerId: a.userId,
        currency: a.currency || ctx.pricing.currency,
        now: a.now,
      })
    }
    return "sent"
  } catch (e) {
    console.error(`[communities] ticket notice ${a.ticketId}: ${reasonOf(e)}`)
    return "skipped"
  }
}

/* ── Who still holds a ticket ───────────────────────────────────────────── */

/**
 * WHETHER THIS EVENT IS SOLD RATHER THAN FREE. False before part 105 has
 * run, and false for every event nobody priced, so the reminders and the fan
 * outs take exactly the road they take today.
 */
export async function eventIsPaid(db: Db, eventId: string): Promise<boolean> {
  if (!UUID.test(eventId)) return false
  if (!(await ticketsReady(db))) return false
  try {
    const { data, error } = await db.from("community_events").select("price_cents").eq("id", eventId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] event price read: ${reasonOf(error)}`)
      return false
    }
    const price = (data as { price_cents?: number | null } | null)?.price_cents
    return typeof price === "number" && price > 0
  } catch (e) {
    console.error(`[communities] event price read: ${reasonOf(e)}`)
    return false
  }
}

/**
 * OF THESE PEOPLE, THE ONES WHO STILL HOLD A TICKET. A paid event's
 * reminders are for holders alone: the SQL writes a "going" answer when a
 * ticket is paid and takes it away when it is released, so this is mostly a
 * second pair of eyes, and it is the one that counts. A refunded or
 * cancelled ticket, and a hold nobody paid, are nobody.
 *
 * Null means the question cannot be answered here (part 105 has not run, or
 * the read failed), and the caller carries on exactly as it does today.
 */
export async function liveTicketHolders(db: Db, eventId: string, userIds: readonly string[]): Promise<Set<string> | null> {
  const ids = [...new Set(userIds.filter((id) => UUID.test(id)))]
  if (ids.length === 0) return new Set()
  if (!(await ticketsReady(db))) return null
  try {
    const { data, error } = await db.from("community_event_tickets").select("user_id, status").eq("event_id", eventId).in("user_id", ids)
    if (error) {
      if (!missing(error)) console.error(`[communities] ticket holders read: ${reasonOf(error)}`)
      return null
    }
    const rows = (data as { user_id: string; status: string }[] | null) ?? []
    return new Set(rows.filter((r) => r.status === "paid").map((r) => r.user_id))
  } catch (e) {
    console.error(`[communities] ticket holders read: ${reasonOf(e)}`)
    return null
  }
}

/* ── Money back ─────────────────────────────────────────────────────────── */

export interface TicketRefundNotice {
  communityId: string
  eventId: string
  ticketId: string
  userId: string
  /** What is going back, in the smallest unit. */
  amountCents?: number | null
  currency?: string | null
  /** The holder gave up their own seat, rather than staff refunding them. */
  byHolder?: boolean
  /**
   * Why the money is going back. "event_cancelled" sends the one cancelled
   * message, which says the event is off AND that the money is on its way,
   * so a holder is never sent two.
   */
  because?: "refund" | "event_cancelled"
  /** True when the caller already knows the communities switch is on. */
  enabled?: boolean
  now?: number
}

/** The money is going back for one ticket. */
export async function ticketRefundedNotice(db: Db, a: TicketRefundNotice): Promise<TicketNoticeOutcome> {
  if (!UUID.test(a.userId)) return "skipped"
  try {
    const ctx = await ticketNoticeContext(db, a.communityId, a.eventId)
    if (!ctx) return "skipped"
    if (a.because === "event_cancelled") return cancelledHolderNotice(db, ctx, { userId: a.userId, amountCents: a.amountCents, currency: a.currency, enabled: a.enabled, now: a.now })
    const zone = await zoneFor(db, a.userId, ctx.event)
    const path = eventPath(ctx.community.slug, ctx.event.id)
    const back = typeof a.amountCents === "number" && a.amountCents > 0 ? eventPriceLabel(a.amountCents, a.currency || ctx.pricing.currency) : ""
    await notifyMember(db, {
      userId: a.userId,
      communityId: ctx.community.id,
      kind: "event",
      target: { type: "event", id: ctx.event.id },
      title: back ? `${back} refunded for ${ctx.event.title}`.slice(0, 200) : `Your ticket for ${ctx.event.title} was refunded`.slice(0, 200),
      body: back ? "It goes back to the card you paid with." : null,
      url: path,
      dedupeKey: `ticket_refund:${a.ticketId}`,
      pushKind: "ticket",
    })
    await sendCommunityEmail(db, "event_refund", {
      userId: a.userId,
      communityId: ctx.community.id,
      data: {
        ...eventData(ctx, zone),
        ...(a.currency ? { currency: a.currency } : {}),
        amountCents: typeof a.amountCents === "number" ? a.amountCents : 0,
        refundedAt: new Date(a.now ?? Date.now()).toISOString(),
        byHolder: a.byHolder === true,
      },
      key: `refund:${a.ticketId}`,
    }, { enabled: a.enabled })
    return "sent"
  } catch (e) {
    console.error(`[communities] refund notice ${a.ticketId}: ${reasonOf(e)}`)
    return "skipped"
  }
}

/**
 * THE EVENT IS OFF, told to one holder: one bell row and one email that says
 * it is cancelled and that the money is coming back. Both the refund path
 * and the fan out over a cancelled event's holders call this, with the same
 * keys, so whichever gets there first is the only message that goes.
 */
export async function cancelledHolderNotice(
  db: Db,
  ctx: TicketNoticeContext,
  a: { userId: string; amountCents?: number | null; currency?: string | null; enabled?: boolean; now?: number },
): Promise<TicketNoticeOutcome> {
  if (!UUID.test(a.userId)) return "skipped"
  try {
    const zone = await zoneFor(db, a.userId, ctx.event)
    const back = typeof a.amountCents === "number" && a.amountCents > 0 ? eventPriceLabel(a.amountCents, a.currency || ctx.pricing.currency) : ""
    await notifyMember(db, {
      userId: a.userId,
      communityId: ctx.community.id,
      kind: "event",
      target: { type: "event", id: ctx.event.id },
      title: `Cancelled: ${ctx.event.title}`.slice(0, 200),
      body: back ? `${back} is coming back to your card.` : "It is not going ahead.",
      url: eventPath(ctx.community.slug, ctx.event.id),
      dedupeKey: `event_cancelled:${ctx.event.id}:${a.userId}`,
      pushKind: "ticket",
    })
    await sendCommunityEmail(db, "event_cancelled", {
      userId: a.userId,
      communityId: ctx.community.id,
      data: {
        ...eventData(ctx, zone),
        ...(a.currency ? { currency: a.currency } : {}),
        amountCents: typeof a.amountCents === "number" ? a.amountCents : 0,
        refundedAt: new Date(a.now ?? Date.now()).toISOString(),
      },
      key: `cancelled:${ctx.event.id}`,
    }, { enabled: a.enabled })
    return "sent"
  } catch (e) {
    console.error(`[communities] cancelled notice ${ctx.event.id}: ${reasonOf(e)}`)
    return "skipped"
  }
}
