import "server-only"

/**
 * FANOUT_EVENT: tells the members an event is for that it is on the
 * calendar. One inbox row each (dedupe key per event and member, so a run
 * again changes nothing), only for active members the event's access rule
 * lets in and whose notification level includes events, never the person
 * who made it. Payload { eventId, communityId, cursor? }, queued once per
 * event by lib/communities/server/events.ts eventScheduled.
 *
 * 500 members a page by user id, one read and one insert per page; out of
 * time, it carries on from the cursor in the next run. An event that was
 * cancelled or has started by then is not announced.
 *
 * A CHANGE (payload.change "moved", "updated" or "cancelled", queued by
 * notify.ts notifyEventChanged once per change) is told only to the people
 * going, a page of RSVPs at a time: "Event moved: Darkroom night" with the
 * new time, "Event cancelled: ...", "Event updated: ...". It is about their
 * own plans, so it pushes at once (push-bridge.ts pushPriority, the
 * event_change: key), under their Events switch. Once per change: the key
 * names the change and its stamp (the new start, or the moment it was made).
 *
 * A PAID EVENT THAT WAS CALLED OFF (run-now part 105) is told to its ticket
 * HOLDERS instead of to the people going, because refunding a ticket takes
 * that answer away: each holder gets the one message that says the event is
 * off and that the money is on its way (event_ticket_notify.ts), never two,
 * and never a cancellation with nothing about their money. A free event, and
 * any event on a database without part 105, is told exactly as today.
 */
import { evaluateAccess, parseAccessRule } from "../../access"
import { wantsNotification } from "../../permissions"
import { eventTime } from "../../format"
import { EVENT_COLUMNS, type EventRow, type JobRow, type NotifyLevel, type Role } from "../../types"
import { reasonOf, type Db } from "../db"
import { bulkNotify } from "../events"
import { ownedProductIds } from "../membership"
import type { JobContext, JobOutcome } from "./index"
import { carryPushes, communityPushItem, pushFanout, type PushItem } from "@/lib/notifications/push-bridge"
import { cancelledHolderNotice, eventIsPaid, ticketNoticeContext } from "./event_ticket_notify"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const FANOUT_PAGE = 500

export async function fanoutEvent(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  /* Pushes an earlier run could not send in time go first (lib/notifications/push-bridge.ts). */
  const carried = await carryPushes(job.payload, ctx.deadline)
  if (carried.left.length) return { again: { payload: { ...carried.payload, pushLeft: carried.left } } }
  const payload = carried.payload
  const eventId = typeof payload.eventId === "string" ? payload.eventId : ""
  if (!UUID.test(eventId)) throw new Error("fanout_event needs payload.eventId")
  if (isEventChange(payload.change)) return eventChangeFanout(db, payload, eventId, payload.change, ctx)
  let after = typeof payload.cursor === "string" && UUID.test(payload.cursor) ? payload.cursor : null

  const { data: row, error } = await db.from("community_events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle()
  if (error) throw new Error(`event read: ${reasonOf(error)}`)
  const e = row as EventRow | null
  if (!e || e.status === "cancelled" || Date.parse(e.starts_at) <= ctx.now) return
  const { data: community } = await db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", e.community_id).maybeSingle()
  const c = community as { id: string; slug: string; name?: string | null; status: string; suspended_at: string | null; deleted_at: string | null } | null
  if (!c || c.deleted_at || c.suspended_at || c.status === "suspended" || c.status === "archived") return

  const rule = parseAccessRule(e.access)
  const when = eventTime(e.starts_at, e.ends_at, { timeZone: e.timezone || undefined })
  for (;;) {
    let q = db
      .from("community_members")
      .select("user_id, role, tier_id, level, notify_level")
      .eq("community_id", c.id)
      .eq("status", "active")
      .order("user_id", { ascending: true })
      .limit(FANOUT_PAGE)
    if (after) q = q.gt("user_id", after)
    const { data: members, error: memberError } = await q
    if (memberError) throw new Error(`members read: ${reasonOf(memberError)}`)
    const page = (members as { user_id: string; role: Role; tier_id: string | null; level: number; notify_level: NotifyLevel }[] | null) ?? []
    if (page.length === 0) break

    const notices = []
    for (const m of page) {
      if (m.user_id === e.created_by || !wantsNotification(m.notify_level, "event")) continue
      const v = { role: m.role, active: true, tierId: m.tier_id, ownedProductIds: [] as string[], level: m.level || 1 }
      let allowed = evaluateAccess(rule, v).ok
      /* A rule that names products: only then is what this member owns looked up. */
      if (!allowed && rule.productIds?.length) allowed = evaluateAccess(rule, { ...v, ownedProductIds: await ownedProductIds(db, m.user_id, rule.productIds) }).ok
      if (!allowed) continue
      notices.push({ userId: m.user_id, title: `New event: ${e.title}`, body: when, url: `/community/${c.slug}/events/${e.id}`, dedupeKey: `event_new:${e.id}:${m.user_id}` })
    }
    const fresh = await bulkNotify(db, c.id, "event", { type: "event", id: e.id }, notices)
    /* The members whose row is new this run, to their phones; a low priority kind, so held when they just had one (lib/notifications/push-bridge.ts). */
    const levels = new Map(page.map((m) => [m.user_id, m.notify_level]))
    const items = notices
      .filter((n) => fresh.has(n.userId))
      .map((n) => communityPushItem({ userId: n.userId, communityId: c.id, kind: "event", actorId: e.created_by, title: n.title, body: n.body, url: n.url, dedupeKey: n.dedupeKey, level: levels.get(n.userId) ?? null }, c.name ?? null))
      .filter((i): i is PushItem => !!i)
    const left = await pushFanout(db, items, { deadline: ctx.deadline })
    after = page[page.length - 1].user_id
    if (left.length) return { again: { payload: { ...payload, cursor: after, pushLeft: left } } }
    if (page.length < FANOUT_PAGE) break
    if (Date.now() >= ctx.deadline - 8_000) return { again: { payload: { ...payload, cursor: after } } }
  }
}

/* ── A change to an event, told to the people going ─────────────────────── */

export const EVENT_CHANGES = ["moved", "updated", "cancelled"] as const
export type EventChange = (typeof EVENT_CHANGES)[number]
const RSVP_PAGE = 200

export function isEventChange(v: unknown): v is EventChange {
  return typeof v === "string" && (EVENT_CHANGES as readonly string[]).includes(v)
}

/** "Event moved: Darkroom night". */
export function eventChangeTitle(change: EventChange, title: string): string {
  const what = change === "moved" ? "Event moved" : change === "cancelled" ? "Event cancelled" : "Event updated"
  return `${what}: ${title}`.slice(0, 200)
}

async function eventChangeFanout(db: Db, payload: Record<string, unknown>, eventId: string, change: EventChange, ctx: JobContext): Promise<JobOutcome | void> {
  const stamp = typeof payload.stamp === "string" ? payload.stamp.slice(0, 40) : ""
  let after = typeof payload.cursor === "string" && UUID.test(payload.cursor) ? payload.cursor : null
  const { data: row, error } = await db.from("community_events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle()
  if (error) throw new Error(`event read: ${reasonOf(error)}`)
  const e = row as EventRow | null
  if (!e) return
  /* Told as it is now: a change undone before the job ran is not news (restored, or moved back). */
  if ((change === "cancelled") !== (e.status === "cancelled")) return
  if (change === "moved" && stamp && new Date(e.starts_at).toISOString() !== stamp) return
  if (change !== "cancelled" && Date.parse(e.starts_at) <= ctx.now) return
  const { data: community } = await db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", e.community_id).maybeSingle()
  const c = community as { id: string; slug: string; name?: string | null; status: string; suspended_at: string | null; deleted_at: string | null } | null
  if (!c || c.deleted_at || c.suspended_at || c.status === "suspended" || c.status === "archived") return
  /* A paid event called off: its holders, with their money in the same message. */
  if (change === "cancelled" && (await eventIsPaid(db, e.id))) return cancelledTicketFanout(db, payload, e.id, c.id, ctx)

  const when = eventTime(e.starts_at, e.ends_at, { timeZone: e.timezone || undefined })
  const title = eventChangeTitle(change, e.title)
  const body = change === "cancelled" ? `It was set for ${when}.` : when
  const url = `/community/${c.slug}/events/${e.id}`
  for (;;) {
    let q = db.from("community_event_rsvps").select("user_id").eq("event_id", e.id).eq("status", "going").order("user_id", { ascending: true }).limit(RSVP_PAGE)
    if (after) q = q.gt("user_id", after)
    const { data: rsvps, error: rsvpError } = await q
    if (rsvpError) throw new Error(`rsvps read: ${reasonOf(rsvpError)}`)
    const ids = ((rsvps as { user_id: string }[] | null) ?? []).map((r) => r.user_id)
    if (ids.length === 0) return
    const { data: members } = await db.from("community_members").select("user_id, status, notify_level").eq("community_id", c.id).in("user_id", ids)
    const wanted = ((members as { user_id: string; status: string; notify_level: NotifyLevel }[] | null) ?? []).filter((m) => m.status === "active" && m.user_id !== payload.actorId && wantsNotification(m.notify_level, "event"))
    const notices = wanted.map((m) => ({ userId: m.user_id, title, body, url, dedupeKey: `event_change:${e.id}:${change}:${stamp}:${m.user_id}` }))
    const fresh = await bulkNotify(db, c.id, "event", { type: "event", id: e.id }, notices)
    const levels = new Map(wanted.map((m) => [m.user_id, m.notify_level]))
    const items = notices
      .filter((n) => fresh.has(n.userId))
      .map((n) => communityPushItem({ userId: n.userId, communityId: c.id, kind: "event", actorId: typeof payload.actorId === "string" ? payload.actorId : null, title: n.title, body: n.body, url: n.url, dedupeKey: n.dedupeKey, level: levels.get(n.userId) ?? null }, c.name ?? null))
      .filter((i): i is PushItem => !!i)
    const left = await pushFanout(db, items, { deadline: ctx.deadline })
    after = ids[ids.length - 1]
    if (left.length) return { again: { payload: { ...payload, cursor: after, pushLeft: left } } }
    if (ids.length < RSVP_PAGE) return
    if (Date.now() >= ctx.deadline - 8_000) return { again: { payload: { ...payload, cursor: after } } }
  }
}

/* ── A paid event called off, told to the people holding tickets ───────── */

export const TICKET_PAGE = 100

/**
 * Each holder of a cancelled paid event, a page at a time by user id: one
 * row and one email that says the event is off and that the money is coming
 * back. Keyed per event and person, and the refund path uses the same keys,
 * so whichever gets there first is the only message that goes. Out of time,
 * it carries on from its cursor in the next run.
 */
async function cancelledTicketFanout(db: Db, payload: Record<string, unknown>, eventId: string, communityId: string, ctx: JobContext): Promise<JobOutcome | void> {
  const notice = await ticketNoticeContext(db, communityId, eventId)
  if (!notice) return
  let after = typeof payload.cursor === "string" && UUID.test(payload.cursor) ? payload.cursor : null
  for (;;) {
    let q = db
      .from("community_event_tickets")
      .select("user_id, amount_cents, currency, status")
      .eq("event_id", eventId)
      .in("status", ["paid", "refunded"])
      .order("user_id", { ascending: true })
      .limit(TICKET_PAGE)
    if (after) q = q.gt("user_id", after)
    const { data, error } = await q
    if (error) throw new Error(`tickets read: ${reasonOf(error)}`)
    const rows = (data as { user_id: string; amount_cents: number | null; currency: string | null; status: string }[] | null) ?? []
    if (rows.length === 0) return
    for (const r of rows) {
      await cancelledHolderNotice(db, notice, { userId: r.user_id, amountCents: r.amount_cents, currency: r.currency, now: ctx.now })
    }
    after = rows[rows.length - 1].user_id
    if (rows.length < TICKET_PAGE) return
    if (Date.now() >= ctx.deadline - 8_000) return { again: { payload: { ...payload, cursor: after } } }
  }
}
