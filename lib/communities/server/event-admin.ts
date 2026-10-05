import "server-only"

/**
 * ===========================================================================
 *  TICKETS ON AN EVENT, FROM /app
 * ===========================================================================
 * The creator's side of a paid event (round 14, run-now part 105). The
 * ticket rows themselves are read and written by worker E's
 * ./event-tickets.ts and ./event-refunds.ts; this file is what the /app
 * screens and their routes ask:
 *
 *   eventTicketBasics    what the Tickets card needs from the database:
 *                        whether part 105 has run, and the community's own
 *                        refund policy (the currency and whether payouts
 *                        take payments are added by ./event-ticket-setup.ts)
 *   eventPriceColumns    the card's fields as columns, with Free clearing
 *                        every one of them
 *   priceChangeRefusal   who may price an event, and why a price cannot be
 *                        taken off one people hold tickets for
 *   eventsTicketMoney    what a page of events took, in one read
 *   loadEventTicketPanel the Tickets panel: the money, the seats, and the
 *                        holders a page at a time with a search
 *   refundOneTicket      one person's money back, with its permission
 *   refundEveryTicketFor everybody's, for a cancelled event
 *   markTicketAttended   they turned up
 *   searchMembersToInvite the Invite free picker
 *
 * EVERY PERMISSION IS DECIDED HERE as well as in the route, so hiding a
 * button is never the only gate: tests/communities-events-admin.test.ts
 * calls these the way the routes do.
 */
import { can, type RolePermissions } from "../permissions"
import { seatsLeft } from "../event-tickets"
import { SEARCH_CAP, safeSearch } from "../search"
import { EVENT_COLUMNS, EVENT_COLUMNS_PRICED, type CommunityRow, type EventRow, type Role } from "../types"
import { isUuid } from "@/components/community/creator/logic"
import type { EventTicketInput } from "@/components/community/creator/logic"
import type { EventTicketMoney, EventTicketPanelView, InvitePickMember } from "@/components/community/creator/view-types"
import { missing, reasonOf, type Db } from "./db"
import { peopleOf } from "./moderation"
import { eventTicketMoney, eventTickets, markAttended, ticketsReady, type TicketHolderRow } from "./event-tickets"
import { defaultTicketRefundDeps, refundEveryTicket, refundTicket, type TicketRefundDeps } from "./event-refunds"

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; status: number; field?: string }
const no = (status: number, error: string, field?: string) => ({ ok: false as const, status, error, field })

/** The columns an event read asks for: the price ones only when the table has them. */
export async function eventReadColumns(db: Db): Promise<string> {
  return (await ticketsReady(db)) ? EVENT_COLUMNS_PRICED : EVENT_COLUMNS
}

/** One event of this community, with its price when the database has one. */
export async function pricedEventOf(db: Db, communityId: string, eventId: string): Promise<EventRow | null> {
  if (!isUuid(eventId) || !isUuid(communityId)) return null
  const { data, error } = await db.from("community_events").select(await eventReadColumns(db)).eq("id", eventId).eq("community_id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] event read: ${reasonOf(error)}`)
    return null
  }
  return (data as EventRow | null) ?? null
}

/**
 * WHO MAY PRICE AN EVENT, and when a price may not move. The permission is
 * its own (price_events, the tickets group), and a price is never taken off
 * an event people are holding tickets for: they are refunded first, which
 * is what the Tickets panel is for. Null means go ahead.
 */
export function priceChangeRefusal(
  a: { role?: Role; perms?: RolePermissions | null; tickets: EventTicketInput | null; event?: Pick<EventRow, "price_cents" | "tickets_sold"> | null },
): { ok: false; error: string; status: number; field?: string } | null {
  if (!a.tickets) return null
  if (a.role && !can(a.role, "price_events", a.perms)) return no(403, "not_allowed", "price")
  const sold = a.event?.tickets_sold ?? 0
  const wasPaid = (a.event?.price_cents ?? 0) > 0
  const stillPaid = typeof a.tickets.priceCents === "number" && a.tickets.priceCents > 0
  if (wasPaid && sold > 0 && !stillPaid) return no(409, `${sold} ${sold === 1 ? "person holds a ticket" : "people hold tickets"}. Refund them before making it free.`, "price")
  return null
}


/**
 * WHAT THE TICKETS CARD NEEDS from the database: whether part 105 has run,
 * and the community's own refund policy, which an event with no words of
 * its own falls back to. The currency and whether payouts take payments are
 * added by ./event-ticket-setup.ts, which keeps the payments code out of
 * everything else that reads events (the way ./learn-builder.ts does).
 */
export async function eventTicketBasics(db: Db, communityId: string): Promise<{ ready: boolean; communityPolicy: string | null; creatorId: string | null }> {
  const policyOf = async (): Promise<{ refund_policy?: string | null; creator_id?: string | null } | null> => {
    const { data } = await db.from("communities").select("refund_policy, creator_id").eq("id", communityId).maybeSingle()
    return (data as { refund_policy?: string | null; creator_id?: string | null } | null) ?? null
  }
  const [ready, policy] = await Promise.all([ticketsReady(db), policyOf().catch(() => null)])
  return { ready, communityPolicy: policy?.refund_policy?.trim() || null, creatorId: policy?.creator_id ?? null }
}

/**
 * The Tickets card as columns, for a person allowed to price events. A free
 * event clears every one of them, so taking the price off an event leaves no
 * sales time, window or policy behind. Without part 105 nothing is written.
 */
export async function eventPriceColumns(db: Db, tickets: EventTicketInput | null, currency: string): Promise<Record<string, unknown>> {
  if (!tickets || !(await ticketsReady(db))) return {}
  const paid = typeof tickets.priceCents === "number" && tickets.priceCents > 0
  return {
    price_cents: paid ? tickets.priceCents : null,
    currency: paid ? currency : null,
    sales_close_at: paid ? tickets.salesCloseAt : null,
    refund_window_hours: paid ? tickets.refundWindowHours : null,
    refund_policy: paid ? tickets.refundPolicy : null,
  }
}

/**
 * What each of these events took, in one read for the whole page rather
 * than one per event: the ticket rows of this community for the ids given,
 * added up by event. An event that was never priced gets null, so a free
 * event's row says nothing about money.
 */
export async function eventsTicketMoney(db: Db, communityId: string, events: EventRow[]): Promise<Map<string, EventTicketMoney>> {
  const out = new Map<string, EventTicketMoney>()
  const ids = events.filter((e) => (e.price_cents ?? 0) > 0 || (e.tickets_sold ?? 0) > 0).map((e) => e.id)
  if (!ids.length) return out
  for (const e of events) if (ids.includes(e.id)) out.set(e.id, { sold: 0, invited: 0, grossCents: 0, refundedCents: 0, currency: e.currency || "usd" })
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    let after: string | null = null
    for (let page = 0; page < 50; page++) {
      let q = db.from("community_event_tickets").select("id, event_id, status, source, amount_cents, currency").eq("community_id", communityId).in("event_id", chunk)
      if (after) q = q.gt("id", after)
      const { data, error } = await q.order("id", { ascending: true }).limit(1000)
      if (error) {
        if (!missing(error)) console.error(`[communities] event ticket money: ${reasonOf(error)}`)
        return out
      }
      const rows = (data as { id: string; event_id: string; status: string; source: string; amount_cents: number | null; currency: string | null }[] | null) ?? []
      for (const t of rows) {
        const m = out.get(t.event_id)
        if (!m) continue
        const amount = Math.max(0, t.amount_cents ?? 0)
        if (t.currency) m.currency = t.currency
        if (t.status === "paid") {
          if (t.source === "purchase") {
            m.sold += 1
            m.grossCents += amount
          } else m.invited += 1
        } else if (t.status === "refunded") m.refundedCents += amount
      }
      if (rows.length < 1000) break
      after = rows[rows.length - 1].id
    }
  }
  return out
}

/* ── The tickets of one event (round 14) ────────────────────────────────── */

export const TICKET_HOLDERS_PAGE = 25

/** The cursor shape worker E's eventTickets() reads: when it was made and its id. */
function holderCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`, "utf8").toString("base64url")
}

function holderCursorParts(raw: unknown): { at: string; id: string } | null {
  if (typeof raw !== "string" || !raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null
  try {
    const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|")
    return at && isUuid(id) ? { at, id } : null
  } catch {
    return null
  }
}

/** The people whose name (or email, for whoever may see one) matches, at most SEARCH_CAP of them. */
async function profileIdsMatching(db: Db, q: string, withEmail: boolean): Promise<{ ids: string[]; capped: boolean }> {
  const s = safeSearch(q)
  if (s.length < 2) return { ids: [], capped: false }
  const parts = [`display_name.ilike.*${s}*`, `username.ilike.*${s.replace(/^@/, "")}*`]
  if (withEmail && s.includes("@")) parts.push(`email.ilike.*${s}*`)
  const { data, error } = await db.from("profiles").select("id").or(parts.join(",")).limit(SEARCH_CAP)
  if (error) return { ids: [], capped: false }
  const ids = ((data as { id: string }[] | null) ?? []).map((p) => p.id)
  return { ids, capped: ids.length >= SEARCH_CAP }
}

/**
 * A SEARCH OVER THE HOLDERS. The people are matched first (the member
 * search this file already uses) and then only their ticket rows are read,
 * so typing a name on an event with ten thousand tickets stays one small
 * read rather than a walk through all of them.
 */
async function holdersMatching(db: Db, a: { eventId: string; q: string; cursor: unknown; withEmail: boolean }): Promise<{ rows: TicketHolderRow[]; nextCursor: string | null; capped: boolean }> {
  const found = await profileIdsMatching(db, a.q, a.withEmail)
  if (!found.ids.length) return { rows: [], nextCursor: null, capped: found.capped }
  let q = db
    .from("community_event_tickets")
    .select("id, user_id, status, source, amount_cents, currency, paid_at, refunded_at, attended_at, invited_by, invite_email, created_at")
    .eq("event_id", a.eventId)
    .in("user_id", found.ids)
  const cursor = holderCursorParts(a.cursor)
  if (cursor) q = q.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`)
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(TICKET_HOLDERS_PAGE + 1)
  if (error) {
    if (!missing(error)) console.error(`[communities] ticket search: ${reasonOf(error)}`)
    return { rows: [], nextCursor: null, capped: found.capped }
  }
  type Row = { id: string; user_id: string; status: TicketHolderRow["status"]; source: TicketHolderRow["source"]; amount_cents: number | null; currency: string | null; paid_at: string | null; refunded_at: string | null; attended_at: string | null; invited_by: string | null; invite_email: string | null; created_at: string }
  const all = (data as Row[] | null) ?? []
  const page = all.slice(0, TICKET_HOLDERS_PAGE)
  const last = page[page.length - 1]
  const people = await peopleOf(db, [...page.map((r) => r.user_id), ...page.map((r) => r.invited_by).filter((x): x is string => isUuid(x))], { email: a.withEmail })
  const rows: TicketHolderRow[] = page.map((r) => {
    const person = people.get(r.user_id)
    const by = r.invited_by ? people.get(r.invited_by) : null
    return {
      ticketId: r.id,
      userId: r.user_id,
      name: person?.name ?? "Member",
      username: person?.username ?? null,
      avatarUrl: person?.avatarUrl ?? null,
      email: a.withEmail ? (person?.email ?? r.invite_email ?? null) : null,
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
  return { rows, nextCursor: all.length > TICKET_HOLDERS_PAGE && last ? holderCursor(last.created_at, last.id) : null, capped: found.capped }
}

export async function loadEventTicketPanel(
  db: Db,
  a: { communityId: string; eventId: string; cursor?: unknown; q?: string; withEmail: boolean },
): Promise<Result<{ panel: EventTicketPanelView }>> {
  const e = await pricedEventOf(db, a.communityId, a.eventId)
  if (!e) return no(404, "That event is not in this community.")
  const ready = await ticketsReady(db)
  const money = ready ? await eventTicketMoney(db, e.id) : { sold: 0, invited: 0, grossCents: 0, refundedCents: 0, currency: e.currency || "usd" }
  const search = (a.q ?? "").trim()
  const page = !ready
    ? { rows: [] as TicketHolderRow[], nextCursor: null, capped: false }
    : search.length >= 2
      ? await holdersMatching(db, { eventId: e.id, q: search, cursor: a.cursor, withEmail: a.withEmail })
      : { ...(await eventTickets(db, e.id, { limit: TICKET_HOLDERS_PAGE, cursor: typeof a.cursor === "string" ? a.cursor : null })), capped: false }
  const rows = a.withEmail ? page.rows : page.rows.map((r) => ({ ...r, email: null }))
  const sold = e.tickets_sold ?? 0
  return {
    ok: true,
    panel: {
      eventId: e.id,
      title: e.title,
      startsAt: e.starts_at,
      cancelled: e.status === "cancelled",
      priceCents: e.price_cents ?? null,
      currency: e.currency ?? null,
      capacity: e.capacity,
      ticketsSold: sold,
      seatsLeft: seatsLeft(e.capacity, sold),
      money,
      rows,
      nextCursor: page.nextCursor,
      capped: page.capped,
      ready,
    },
  }
}

/**
 * MEMBERS TO INVITE FREE: active members whose name (or email, for whoever
 * may see emails) matches, with whoever already holds a ticket marked so
 * nobody is invited twice. At most twenty, which is as many as the picker
 * shows at once.
 */
export async function searchMembersToInvite(db: Db, a: { communityId: string; eventId: string; q: string; withEmail: boolean; role: Role; perms?: RolePermissions | null }): Promise<InvitePickMember[]> {
  if (!can(a.role, "price_events", a.perms)) return []
  const found = await profileIdsMatching(db, a.q, a.withEmail)
  if (!found.ids.length) return []
  const { data, error } = await db.from("community_members").select("user_id").eq("community_id", a.communityId).eq("status", "active").in("user_id", found.ids).limit(20)
  if (error) return []
  const ids = ((data as { user_id: string }[] | null) ?? []).map((m) => m.user_id)
  if (!ids.length) return []
  const [people, held] = await Promise.all([
    peopleOf(db, ids, { email: a.withEmail }),
    (async () => {
      if (!(await ticketsReady(db)) || !isUuid(a.eventId)) return new Set<string>()
      const { data: rows } = await db.from("community_event_tickets").select("user_id").eq("event_id", a.eventId).eq("status", "paid").in("user_id", ids).limit(20)
      return new Set(((rows as { user_id: string }[] | null) ?? []).map((t) => t.user_id))
    })(),
  ])
  return ids.map((userId) => {
    const person = people.get(userId)
    return { userId, name: person?.name ?? "Member", username: person?.username ?? null, avatarUrl: person?.avatarUrl ?? null, email: a.withEmail ? (person?.email ?? null) : null, hasTicket: held.has(userId) }
  })
}

/**
 * ONE TICKET REFUNDED BY STAFF. The permission is checked here, the ticket
 * is checked to be this event's in this community, and then the money goes
 * back through worker E's refundTicket (Stripe, then the seat).
 */
export async function refundOneTicket(
  db: Db,
  a: { community: CommunityRow; role: Role; perms?: RolePermissions | null; eventId: string; ticketId: string; actorId: string; reason?: string | null },
  deps?: TicketRefundDeps,
): Promise<Result<{ refundedCents: number; userId: string }>> {
  if (!can(a.role, "refund_tickets", a.perms)) return no(403, "not_allowed")
  const owns = await ticketInCommunity(db, a.community.id, a.eventId, a.ticketId)
  if (!owns.ok) return no(owns.status, owns.error)
  const done = await refundTicket(db, { community: a.community, ticketId: a.ticketId, actorId: a.actorId, reason: a.reason ?? null }, deps ?? defaultTicketRefundDeps(db))
  if (done.ok !== true) return no(done.status, done.error)
  return { ok: true, refundedCents: done.amountCents, userId: done.userId }
}

/**
 * THEY TURNED UP, or they did not. Managing the calendar is enough for
 * this: it is a note on the ticket, not money.
 */
export async function markTicketAttended(
  db: Db,
  a: { community: CommunityRow; role: Role; perms?: RolePermissions | null; eventId: string; ticketId: string; came: boolean },
): Promise<Result> {
  if (!can(a.role, "manage_events", a.perms)) return no(403, "not_allowed")
  const owns = await ticketInCommunity(db, a.community.id, a.eventId, a.ticketId)
  if (!owns.ok) return no(owns.status, owns.error)
  const done = await markAttended(db, { ticketId: a.ticketId, at: a.came ? undefined : null })
  if (!done) return no(500, "failed")
  return { ok: true }
}

/**
 * EVERYBODY'S MONEY BACK, for an event that is being called off. Its own
 * permission, and the route calls this BEFORE it cancels the event, so a
 * member never reads "cancelled" while their money is still with us.
 * Worker E's refundEveryTicket walks a page at a time and keeps going past
 * one failure, so the counts are what actually happened.
 */
export async function refundEveryTicketFor(
  db: Db,
  a: { community: CommunityRow; role: Role; perms?: RolePermissions | null; eventId: string; actorId: string; reason?: string | null },
  deps?: TicketRefundDeps,
): Promise<Result<{ refunded: number; failed: number; refundedCents: number }>> {
  if (!can(a.role, "refund_tickets", a.perms)) return no(403, "not_allowed")
  const event = await pricedEventOf(db, a.community.id, a.eventId)
  if (!event) return no(404, "not_found")
  const out = await refundEveryTicket(db, { community: a.community, eventId: a.eventId, actorId: a.actorId, reason: a.reason ?? "The event was cancelled." }, deps ?? defaultTicketRefundDeps(db))
  return { ok: true, refunded: out.refunded, failed: out.failed, refundedCents: out.totalCents }
}

/** The ticket this id names, only when it belongs to an event of this community. */
export async function ticketInCommunity(db: Db, communityId: string, eventId: string, ticketId: string): Promise<{ ok: boolean; status: number; error: string }> {
  const away = (status: number, error: string) => ({ ok: false, status, error })
  if (!isUuid(ticketId) || !isUuid(eventId)) return away(404, "not_found")
  const { data, error } = await db.from("community_event_tickets").select("id, event_id, community_id").eq("id", ticketId).maybeSingle()
  if (error) return away(missing(error) ? 409 : 500, missing(error) ? "not_set_up" : "failed")
  const row = data as { event_id?: string; community_id?: string } | null
  if (!row || row.event_id !== eventId || row.community_id !== communityId) return away(404, "not_found")
  return { ok: true, status: 200, error: "" }
}

/** How many scheduled events carry a price, for the honest line when payouts are not connected. */
export async function pricedEventCount(db: Db, communityId: string): Promise<number> {
  if (!(await ticketsReady(db))) return 0
  const { count, error } = await db.from("community_events").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "scheduled").gt("price_cents", 0)
  if (error) return 0
  return count ?? 0
}

