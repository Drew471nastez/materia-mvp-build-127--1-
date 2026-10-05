import "server-only"

/**
 * ===========================================================================
 *  TICKETS FOR A PAID EVENT: THE SERVER SIDE
 * ===========================================================================
 * One row per person and event in public.community_event_tickets, written
 * only by the five functions run-now part 105 installs, because each of
 * them does its counting in one locked statement: a seat is never sold
 * twice and one payment is exactly one ticket.
 *
 *   ticketsReady   part 105 ran. Everything below answers a safe empty
 *                  value without it, so an event on a database that has
 *                  not run it is free and behaves exactly as it does today.
 *   ticketOf       the viewer's ticket for one event.
 *   ticketsOf      the viewer's tickets for a page of events, in one read,
 *                  so a list never asks per card.
 *   eventTickets   the holders, a page at a time, for the creator's panel.
 *   grantTicket    a free ticket: an invite, or staff giving one.
 *   releaseTicket  the seat goes back, after the money has.
 *   releaseDeadHolds  holds nobody paid for, tidied by the job sweep.
 *
 * The money side (Stripe) is in ./event-checkout.ts and ./event-refunds.ts.
 * Nothing here trusts a price or an event id from a page: the rows are read
 * here and the amounts come from the event's own row inside the functions.
 */
import { TICKET_HOLD_MINUTES, type EventPricing, type TicketSource, type TicketStatus, type TicketView } from "../event-tickets"
import { EVENT_COLUMNS, EVENT_COLUMNS_PRICED, type EventRow } from "../types"
import { missing, reasonOf, type Db } from "./db"
import { peopleOf } from "./moderation"

const TABLE = "community_event_tickets"
const TICKET_COLUMNS =
  "id, event_id, community_id, user_id, status, source, checkout_session_id, payment_intent_id, amount_cents, currency, platform_fee_cents, held_until, paid_at, refunded_at, cancelled_at, refund_reason, invited_by, invite_email, attended_at, created_at"

/** While the table is missing, how long before it is looked for again. */
const RECHECK_MS = 5 * 60_000

export interface TicketRow {
  id: string
  event_id: string
  community_id: string
  user_id: string
  status: TicketStatus
  source: TicketSource
  checkout_session_id: string | null
  payment_intent_id: string | null
  amount_cents: number | null
  currency: string | null
  platform_fee_cents: number | null
  held_until: string | null
  paid_at: string | null
  refunded_at: string | null
  cancelled_at: string | null
  refund_reason: string | null
  invited_by: string | null
  invite_email: string | null
  attended_at: string | null
  created_at: string
}

/** One holder in the creator's tickets panel. The email is only ever filled in for staff. */
export interface TicketHolderRow {
  ticketId: string
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  email: string | null
  status: TicketStatus
  source: TicketSource
  amountCents: number | null
  currency: string | null
  paidAt: string | null
  refundedAt: string | null
  attendedAt: string | null
  invitedByName: string | null
  createdAt: string
}

let ready: boolean | null = null
let checkedAt = 0

/** Whether run-now part 105 has made the table, remembered once it has. */
export async function ticketsReady(db: Db): Promise<boolean> {
  if (ready === true) return true
  if (ready === false && Date.now() - checkedAt < RECHECK_MS) return false
  try {
    const { error } = await db.from(TABLE).select("id", { head: true, count: "exact" }).limit(1)
    ready = !error
    if (error && !missing(error)) console.error(`[communities] event tickets check: ${reasonOf(error)}`)
  } catch {
    ready = false
  }
  checkedAt = Date.now()
  return ready === true
}

/** Used by the writes: a missing table turns the remembered answer off again. */
function forgetIfMissing(error: unknown): void {
  if (missing(error as { code?: string })) {
    ready = false
    checkedAt = Date.now()
  }
}

/** Only tests reach for this, to start from a clean answer. */
export function resetTicketsReady(): void {
  ready = null
  checkedAt = 0
}

export function ticketViewOf(r: TicketRow): TicketView {
  return {
    id: r.id,
    status: r.status,
    source: r.source,
    amountCents: r.amount_cents ?? null,
    currency: r.currency ?? null,
    paidAt: r.paid_at ?? null,
    refundedAt: r.refunded_at ?? null,
    attendedAt: r.attended_at ?? null,
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/** The full row for one person and event, or null. Reads nothing before part 105. */
export async function readTicketRow(db: Db, eventId: string, userId: string | null): Promise<TicketRow | null> {
  if (!isUuid(eventId) || !isUuid(userId)) return null
  if (!(await ticketsReady(db))) return null
  try {
    const { data, error } = await db.from(TABLE).select(TICKET_COLUMNS).eq("event_id", eventId).eq("user_id", userId).maybeSingle()
    if (error) {
      forgetIfMissing(error)
      if (!missing(error)) console.error(`[communities] ticket read: ${reasonOf(error)}`)
      return null
    }
    return (data as TicketRow | null) ?? null
  } catch (e) {
    console.error(`[communities] ticket read: ${reasonOf(e)}`)
    return null
  }
}

/** The viewer's ticket for one event. */
export async function ticketOf(db: Db, eventId: string, userId: string | null): Promise<TicketView | null> {
  const row = await readTicketRow(db, eventId, userId)
  return row ? ticketViewOf(row) : null
}

/**
 * The viewer's tickets for a page of events, in one read: a list draws a
 * price, a "you're going" mark and a seat count without asking per card.
 */
export async function ticketsOf(db: Db, userId: string | null, eventIds: string[]): Promise<Map<string, TicketView>> {
  const out = new Map<string, TicketView>()
  const ids = [...new Set(eventIds.filter(isUuid))]
  if (!isUuid(userId) || ids.length === 0) return out
  if (!(await ticketsReady(db))) return out
  try {
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await db
        .from(TABLE)
        .select(TICKET_COLUMNS)
        .eq("user_id", userId)
        .in("event_id", ids.slice(i, i + 150))
      if (error) {
        forgetIfMissing(error)
        if (!missing(error)) console.error(`[communities] tickets read: ${reasonOf(error)}`)
        return out
      }
      for (const r of (data as TicketRow[] | null) ?? []) out.set(r.event_id, ticketViewOf(r))
    }
  } catch (e) {
    console.error(`[communities] tickets read: ${reasonOf(e)}`)
  }
  return out
}

/**
 * ONE EVENT, WITH ITS PRICE, read from the community in the URL. Before
 * part 105 the priced columns are not there, so the plain columns are read
 * instead and the event comes back free, exactly as it is today.
 */
export async function readPricedEvent(db: Db, communityId: string, eventId: string): Promise<EventRow | null> {
  if (!isUuid(eventId) || !isUuid(communityId)) return null
  const columns = (await ticketsReady(db)) ? EVENT_COLUMNS_PRICED : EVENT_COLUMNS
  try {
    const { data, error } = await db.from("community_events").select(columns).eq("id", eventId).eq("community_id", communityId).maybeSingle()
    if (error) {
      forgetIfMissing(error)
      if (!missing(error)) console.error(`[communities] priced event read: ${reasonOf(error)}`)
      if (!missing(error) || columns === EVENT_COLUMNS) return null
      const plain = await db.from("community_events").select(EVENT_COLUMNS).eq("id", eventId).eq("community_id", communityId).maybeSingle()
      return (plain.data as EventRow | null) ?? null
    }
    return (data as EventRow | null) ?? null
  } catch (e) {
    console.error(`[communities] priced event read: ${reasonOf(e)}`)
    return null
  }
}

/** An event's pricing, as the pure rules want it. A free event answers nulls. */
export function pricingOf(e: EventRow): EventPricing {
  return {
    priceCents: typeof e.price_cents === "number" ? e.price_cents : null,
    currency: e.currency ?? null,
    salesCloseAt: e.sales_close_at ?? null,
    refundWindowHours: typeof e.refund_window_hours === "number" ? e.refund_window_hours : null,
    refundPolicy: e.refund_policy ?? null,
  }
}

/**
 * THE WORDS THIS EVENT REFUNDS BY: its own if it has any, else the
 * community's (run-now part 101), else nothing. Null means the event says
 * nothing about refunds, and the page says nothing either.
 */
export async function refundPolicyFor(db: Db, communityId: string, event: Pick<EventRow, "refund_policy">): Promise<string | null> {
  const own = (event.refund_policy ?? "").trim()
  if (own) return own.slice(0, 2000)
  if (!isUuid(communityId)) return null
  try {
    const { data, error } = await db.from("communities").select("refund_policy").eq("id", communityId).maybeSingle()
    if (error) return null
    const text = ((data as { refund_policy?: string | null } | null)?.refund_policy ?? "").trim()
    return text ? text.slice(0, 2000) : null
  } catch {
    return null
  }
}

/* ── The creator's panel ────────────────────────────────────────────────── */

const encodeCursor = (createdAt: string, id: string): string => Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url")

function decodeCursor(raw: string | null | undefined): { at: string; id: string } | null {
  if (!raw) return null
  try {
    const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|")
    return at && isUuid(id) ? { at, id } : null
  } catch {
    return null
  }
}

/**
 * The holders of one event, newest first, a page at a time by a keyset
 * cursor on (created_at, id). Emails are included because only staff with
 * the tickets permission ever call this.
 */
export async function eventTickets(
  db: Db,
  eventId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<{ rows: TicketHolderRow[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 25)))
  const empty = { rows: [] as TicketHolderRow[], nextCursor: null }
  if (!isUuid(eventId)) return empty
  if (!(await ticketsReady(db))) return empty
  try {
    let q = db.from(TABLE).select(TICKET_COLUMNS).eq("event_id", eventId)
    const cursor = decodeCursor(opts.cursor)
    if (cursor) q = q.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`)
    const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)
    if (error) {
      forgetIfMissing(error)
      if (!missing(error)) console.error(`[communities] event tickets: ${reasonOf(error)}`)
      return empty
    }
    const all = (data as TicketRow[] | null) ?? []
    const page = all.slice(0, limit)
    const last = page[page.length - 1]
    const people = await peopleOf(db, [...page.map((r) => r.user_id), ...page.map((r) => r.invited_by).filter(isUuid)], { email: true })
    const rows: TicketHolderRow[] = page.map((r) => {
      const p = people.get(r.user_id)
      const by = r.invited_by ? people.get(r.invited_by) : null
      return {
        ticketId: r.id,
        userId: r.user_id,
        name: p?.name ?? "Member",
        username: p?.username ?? null,
        avatarUrl: p?.avatarUrl ?? null,
        email: p?.email ?? r.invite_email ?? null,
        status: r.status,
        source: r.source,
        amountCents: r.amount_cents ?? null,
        currency: r.currency ?? null,
        paidAt: r.paid_at ?? null,
        refundedAt: r.refunded_at ?? null,
        attendedAt: r.attended_at ?? null,
        invitedByName: by?.name ?? null,
        createdAt: r.created_at,
      }
    })
    return { rows, nextCursor: all.length > limit && last ? encodeCursor(last.created_at, last.id) : null }
  } catch (e) {
    console.error(`[communities] event tickets: ${reasonOf(e)}`)
    return empty
  }
}

/**
 * What one event took: tickets sold, free invites, gross, refunded. Real
 * rows only, counted in pages so a big event never loads at once.
 */
export async function eventTicketMoney(db: Db, eventId: string): Promise<{ sold: number; invited: number; grossCents: number; refundedCents: number; currency: string }> {
  const empty = { sold: 0, invited: 0, grossCents: 0, refundedCents: 0, currency: "usd" }
  if (!isUuid(eventId)) return empty
  if (!(await ticketsReady(db))) return empty
  const out = { ...empty }
  try {
    const page = 500
    for (let from = 0; ; from += page) {
      const { data, error } = await db
        .from(TABLE)
        .select("status, source, amount_cents, currency")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .range(from, from + page - 1)
      if (error) {
        forgetIfMissing(error)
        if (!missing(error)) console.error(`[communities] event ticket money: ${reasonOf(error)}`)
        return out
      }
      const rows = (data as { status: TicketStatus; source: TicketSource; amount_cents: number | null; currency: string | null }[] | null) ?? []
      for (const r of rows) {
        if (r.currency) out.currency = r.currency
        const amount = Math.max(0, r.amount_cents ?? 0)
        if (r.status === "paid") {
          if (r.source === "purchase") {
            out.sold += 1
            out.grossCents += amount
          } else out.invited += 1
        } else if (r.status === "refunded") {
          out.refundedCents += amount
        }
      }
      if (rows.length < page) break
    }
  } catch (e) {
    console.error(`[communities] event ticket money: ${reasonOf(e)}`)
  }
  return out
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

type Refusal = { ok: false; status: number; error: string }

const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error })

/** Whether this event is the one in the URL's community. */
export async function eventBelongsTo(db: Db, eventId: string, communityId: string): Promise<boolean> {
  if (!isUuid(eventId) || !isUuid(communityId)) return false
  try {
    const { data, error } = await db.from("community_events").select("id").eq("id", eventId).eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] event owner check: ${reasonOf(error)}`)
      return false
    }
    return Boolean(data)
  } catch (e) {
    console.error(`[communities] event owner check: ${reasonOf(e)}`)
    return false
  }
}

/** The reason the SQL function gave back, as a route's code. */
function grantRefusal(reason: string): Refusal {
  if (reason === "full") return refuse(409, "full")
  if (reason === "not_found") return refuse(404, "not_found")
  return refuse(500, "failed")
}

/**
 * A FREE TICKET: somebody invited, or staff putting a person in. One row
 * per person and event, so inviting twice changes nothing, and the SQL
 * writes their "going" answer so the reminders and the attendee avatars
 * pick it up with no extra work.
 */
export async function grantTicket(
  db: Db,
  a: { eventId: string; userId: string; communityId: string; source?: TicketSource; by?: string | null; email?: string | null; force?: boolean },
): Promise<{ ok: true; created: boolean; ticketId: string } | Refusal> {
  if (!isUuid(a.eventId) || !isUuid(a.userId) || !isUuid(a.communityId)) return refuse(404, "not_found")
  if (!(await ticketsReady(db))) return refuse(409, "not_set_up")
  /* THE EVENT MUST BE THE ONE IN THE URL: a ticket is never granted for another community's event. */
  if (!(await eventBelongsTo(db, a.eventId, a.communityId))) return refuse(404, "not_found")
  try {
    const { data, error } = await db.rpc("community_event_ticket_grant", {
      p_event: a.eventId,
      p_user: a.userId,
      p_source: a.source === "grant" ? "grant" : "invite",
      p_by: isUuid(a.by) ? a.by : null,
      p_email: a.email ? a.email.slice(0, 254) : null,
      p_force: a.force === true,
    })
    if (error) {
      forgetIfMissing(error)
      if (missing(error)) return refuse(409, "not_set_up")
      console.error(`[communities] ticket grant: ${reasonOf(error)}`)
      return refuse(500, "failed")
    }
    const answer = (data ?? {}) as { ok?: boolean; created?: boolean; ticket_id?: string; reason?: string }
    if (!answer.ok) return grantRefusal(answer.reason ?? "failed")
    if (!answer.ticket_id) return refuse(500, "failed")
    return { ok: true, created: answer.created === true, ticketId: answer.ticket_id }
  } catch (e) {
    console.error(`[communities] ticket grant: ${reasonOf(e)}`)
    return refuse(500, "failed")
  }
}

/**
 * A SEAT KEPT WHILE SOMEBODY PAYS FOR IT. The checkout holds one before it
 * asks Stripe for a session, so two people cannot buy the last seat at
 * once. `session` is a token of this attempt; the real Stripe session id
 * replaces it once Stripe has given one (claimHoldSession below).
 */
export async function holdSeat(
  db: Db,
  a: { eventId: string; userId: string; session: string; minutes?: number },
): Promise<{ ok: true; ticketId: string; heldUntil: string | null; amountCents: number | null; currency: string | null; seatsLeft: number | null } | Refusal> {
  if (!isUuid(a.eventId) || !isUuid(a.userId)) return refuse(404, "not_found")
  if (!(await ticketsReady(db))) return refuse(409, "free")
  try {
    const { data, error } = await db.rpc("community_event_ticket_hold", {
      p_event: a.eventId,
      p_user: a.userId,
      p_session: a.session,
      p_minutes: Math.max(5, Math.min(180, Math.floor(a.minutes ?? TICKET_HOLD_MINUTES))),
    })
    if (error) {
      forgetIfMissing(error)
      if (missing(error)) return refuse(409, "free")
      console.error(`[communities] ticket hold: ${reasonOf(error)}`)
      return refuse(500, "failed")
    }
    const answer = (data ?? {}) as { ok?: boolean; reason?: string; ticket_id?: string; held_until?: string | null; amount_cents?: number | null; currency?: string | null; seats_left?: number | null }
    if (!answer.ok) {
      const reason = answer.reason ?? "failed"
      const status = reason === "not_found" ? 404 : reason === "failed" ? 500 : 409
      return refuse(status, reason)
    }
    if (!answer.ticket_id) return refuse(500, "failed")
    return {
      ok: true,
      ticketId: answer.ticket_id,
      heldUntil: answer.held_until ?? null,
      amountCents: typeof answer.amount_cents === "number" ? answer.amount_cents : null,
      currency: answer.currency ?? null,
      seatsLeft: typeof answer.seats_left === "number" ? answer.seats_left : null,
    }
  } catch (e) {
    console.error(`[communities] ticket hold: ${reasonOf(e)}`)
    return refuse(500, "failed")
  }
}

/** The real Stripe session id onto the held seat, once Stripe has given one. */
export async function claimHoldSession(db: Db, ticketId: string, sessionId: string): Promise<boolean> {
  if (!isUuid(ticketId) || !sessionId) return false
  try {
    const { error } = await db.from(TABLE).update({ checkout_session_id: sessionId, updated_at: new Date().toISOString() }).eq("id", ticketId).eq("status", "held")
    if (error) {
      if (!missing(error)) console.error(`[communities] ticket hold session: ${reasonOf(error)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[communities] ticket hold session: ${reasonOf(e)}`)
    return false
  }
}

/**
 * ONE PAYMENT IS EXACTLY ONE TICKET. Both the webhook and the sheet's own
 * confirm call this, whichever is first; the SQL answers created:false the
 * second time and changes nothing, so nobody is charged twice and nobody
 * gets two seats.
 */
export async function payTicket(
  db: Db,
  a: { sessionId: string | null; eventId: string; userId: string; paymentIntentId: string | null; amountCents: number | null; currency: string | null; platformFeeCents: number | null },
): Promise<{ ok: true; created: boolean; ticketId: string; amountCents: number | null; currency: string | null } | Refusal> {
  if (!isUuid(a.eventId) || !isUuid(a.userId)) return refuse(404, "not_found")
  if (!(await ticketsReady(db))) return refuse(409, "not_set_up")
  try {
    const { data, error } = await db.rpc("community_event_ticket_pay", {
      p_session: a.sessionId,
      p_event: a.eventId,
      p_user: a.userId,
      p_intent: a.paymentIntentId,
      p_amount: typeof a.amountCents === "number" ? a.amountCents : null,
      p_currency: a.currency ? a.currency.toLowerCase() : null,
      p_fee: typeof a.platformFeeCents === "number" ? a.platformFeeCents : null,
    })
    if (error) {
      forgetIfMissing(error)
      if (missing(error)) return refuse(409, "not_set_up")
      console.error(`[communities] ticket pay: ${reasonOf(error)}`)
      return refuse(500, "failed")
    }
    const answer = (data ?? {}) as { ok?: boolean; created?: boolean; ticket_id?: string; amount_cents?: number | null; currency?: string | null; reason?: string }
    if (!answer.ok || !answer.ticket_id) return refuse(answer.reason === "not_found" ? 404 : 500, answer.reason ?? "failed")
    return {
      ok: true,
      created: answer.created === true,
      ticketId: answer.ticket_id,
      amountCents: typeof answer.amount_cents === "number" ? answer.amount_cents : null,
      currency: answer.currency ?? null,
    }
  } catch (e) {
    console.error(`[communities] ticket pay: ${reasonOf(e)}`)
    return refuse(500, "failed")
  }
}

/**
 * THE SEAT GOES BACK, after the money has: refunded (staff or the holder
 * inside the window) or cancelled (a hold nobody paid, a removed member).
 * Answers the payment it was on, so the caller can refund it, and whether
 * anything actually changed, so calling twice refunds once.
 */
export async function releaseTicket(
  db: Db,
  a: { ticketId: string; status?: "refunded" | "cancelled"; reason?: string | null },
): Promise<{ ok: true; changed: boolean; eventId: string; userId: string; paymentIntentId: string | null; amountCents: number | null } | Refusal> {
  if (!isUuid(a.ticketId)) return refuse(404, "not_found")
  if (!(await ticketsReady(db))) return refuse(409, "not_set_up")
  try {
    const { data, error } = await db.rpc("community_event_ticket_release", {
      p_ticket: a.ticketId,
      p_status: a.status === "cancelled" ? "cancelled" : "refunded",
      p_reason: a.reason ? a.reason.slice(0, 500) : null,
    })
    if (error) {
      forgetIfMissing(error)
      if (missing(error)) return refuse(409, "not_set_up")
      console.error(`[communities] ticket release: ${reasonOf(error)}`)
      return refuse(500, "failed")
    }
    const answer = (data ?? {}) as { ok?: boolean; changed?: boolean; event_id?: string; user_id?: string; payment_intent_id?: string | null; amount_cents?: number | null; reason?: string }
    if (!answer.ok) return refuse(answer.reason === "not_found" ? 404 : 500, answer.reason ?? "failed")
    return {
      ok: true,
      changed: answer.changed === true,
      eventId: answer.event_id ?? "",
      userId: answer.user_id ?? "",
      paymentIntentId: answer.payment_intent_id ?? null,
      amountCents: typeof answer.amount_cents === "number" ? answer.amount_cents : null,
    }
  } catch (e) {
    console.error(`[communities] ticket release: ${reasonOf(e)}`)
    return refuse(500, "failed")
  }
}

/** They turned up. Quiet when the part has not run. */
export async function markAttended(db: Db, a: { ticketId: string; at?: string | null }): Promise<boolean> {
  if (!isUuid(a.ticketId)) return false
  if (!(await ticketsReady(db))) return false
  const when = a.at === null ? null : (a.at ?? new Date().toISOString())
  try {
    const { error } = await db.from(TABLE).update({ attended_at: when, updated_at: new Date().toISOString() }).eq("id", a.ticketId).eq("status", "paid")
    if (error) {
      forgetIfMissing(error)
      if (!missing(error)) console.error(`[communities] ticket attended: ${reasonOf(error)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[communities] ticket attended: ${reasonOf(e)}`)
    return false
  }
}

/**
 * HOLDS NOBODY PAID FOR, TIDIED. A seat is kept while a person is in the
 * Stripe sheet; if they close it the seat must come back, so the community
 * job sweep calls this (lib/communities/server/jobs/runner.ts). Answers how
 * many went back, and 0 on anything at all going wrong.
 */
export async function releaseDeadHolds(db: Db): Promise<number> {
  if (!(await ticketsReady(db))) return 0
  try {
    const { data, error } = await db.rpc("community_event_release_holds")
    if (error) {
      forgetIfMissing(error)
      if (!missing(error)) console.error(`[communities] ticket holds sweep: ${reasonOf(error)}`)
      return 0
    }
    const n = Number(data)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch (e) {
    console.error(`[communities] ticket holds sweep: ${reasonOf(e)}`)
    return 0
  }
}
