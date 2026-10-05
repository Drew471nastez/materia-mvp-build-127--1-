import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S EVENTS: LISTED, OPENED, ANSWERED, REMINDED
 * ===========================================================================
 * Events are written by the creator's screens (/api/app/community/[id]/
 * events); everything a member sees and does is here.
 *
 *   LISTS        Upcoming (soonest first) and Past (latest first), a page at
 *                a time by a keyset cursor (starts_at, id), never by offset;
 *                and one month for the calendar grid. The viewer's own
 *                answer comes in one read for the whole page.
 *   ACCESS       an event's access rule is evaluateAccess, like a space's
 *                or a course's. A member the rule leaves out sees the event
 *                with the reason in words, and cannot answer or join it.
 *   THE LINK     the meeting address is in an answer only for a member the
 *                rule lets in, and only from 15 minutes before the start
 *                until the end (staff who run events see it any time). It
 *                is never in the .ics file, which carries the event page.
 *   RSVP         public.community_rsvp holds the capacity and the waitlist
 *                in one locked statement; when somebody going changes their
 *                mind, the first person waiting is moved up and told.
 *   REMINDERS    the first "going" on an event queues its two reminder jobs
 *                (24 hours and 1 hour before), each once per start time
 *                (lib/communities/server/jobs/event_reminder.ts). The
 *                creator's screens call eventScheduled after making or
 *                moving an event, which also tells members about a new one
 *                (jobs/fanout_event.ts).
 *   REPLAY       the replay video plays once the event is over
 *                (lib/communities/server/videos.ts videoAccess).
 *   TICKETS      round 14: an event may carry a price, and then its details
 *                belong to the people holding a ticket. ticketGate
 *                (lib/communities/event-tickets.ts) is the only thing that
 *                decides, and eventGateFor below is the rule the view, the
 *                .ics route and the replay check all apply. One ticket read
 *                covers a whole page of cards, never one per card, and the
 *                money columns are only selected once part 105 has run, so
 *                before it every event is free and nothing breaks.
 */
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { siteUrl } from "@/lib/memberships/server"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { evaluateAccess, parseAccessRule } from "../access"
import { can } from "../permissions"
import { eventTime } from "../format"
import { eventPriceMode, ticketGate, type EventPricing, type TicketGate, type TicketView } from "../event-tickets"
import { EVENT_COLUMNS, type CommunityRow, type EventRow, type RsvpStatus } from "../types"
import { JOIN_OPENS_MS, endOf, eventTeaser, googleCalendarUrl, isOver, joinWindowOpen, monthRange, type EventCardView, type EventDetailView, type EventHost } from "@/components/community/events/model"
import type { CourseLock } from "@/components/community/classroom/model"
import type { Viewer } from "./context"
import { lockFor } from "./classroom"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { notifyMember, queueJob } from "./notify"
import { recordActivity } from "./activity"
import { ticketsOf, ticketsReady } from "./event-tickets"
import { communityPolicy } from "./membership-lifecycle"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const EVENTS_PAGE = 20
const HOUR_MS = 60 * 60_000

export type EventWhen = "upcoming" | "past"

export const REMINDER_WINDOWS = { "24h": 24 * HOUR_MS, "1h": HOUR_MS } as const
export type ReminderWindow = keyof typeof REMINDER_WINDOWS

export function isEventId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

function accessViewer(viewer: Viewer) {
  return { role: viewer.role, active: viewer.active, tierId: viewer.tierId, ownedProductIds: viewer.ownedProductIds, level: viewer.level }
}

/** Whether this viewer may run events (sees the meeting link any time). */
function runsEvents(viewer: Viewer): boolean {
  return viewer.active && can(viewer.role, "manage_events")
}

/* ── Money on an event (part 105) ───────────────────────────────────────── */

/**
 * The money columns part 105 adds. They are only asked for once that part
 * has run: PostgREST refuses a whole select naming a column that is not
 * there, so adding them to EVENT_COLUMNS would empty every events list on
 * a database that has not had the update yet.
 */
const PRICE_COLUMNS = "price_cents, currency, sales_close_at, refund_window_hours, refund_policy, tickets_sold"

/** An event row, with the money columns when they were read. */
type PricedEventRow = EventRow &
  Partial<{
    price_cents: number | null
    currency: string | null
    sales_close_at: string | null
    refund_window_hours: number | null
    refund_policy: string | null
    tickets_sold: number | null
  }>

/**
 * The columns to select for an event: the money ones too once part 105 has
 * run. Exported because the replay check reads events of its own and has to
 * apply the same gate (lib/communities/server/videos.ts).
 */
export async function eventColumns(db: Db): Promise<string> {
  return (await ticketsReady(db)) ? `${EVENT_COLUMNS}, ${PRICE_COLUMNS}` : EVENT_COLUMNS
}

function pricingOf(e: PricedEventRow): EventPricing {
  return {
    priceCents: typeof e.price_cents === "number" ? e.price_cents : null,
    currency: typeof e.currency === "string" ? e.currency : null,
    salesCloseAt: typeof e.sales_close_at === "string" ? e.sales_close_at : null,
    refundWindowHours: typeof e.refund_window_hours === "number" ? e.refund_window_hours : null,
    refundPolicy: typeof e.refund_policy === "string" ? e.refund_policy : null,
  }
}

function soldOf(e: PricedEventRow): number {
  return Math.max(0, typeof e.tickets_sold === "number" ? e.tickets_sold : 0)
}

/** True for an event somebody has to buy a ticket for. */
export function isPaidEvent(e: PricedEventRow): boolean {
  return eventPriceMode(pricingOf(e)) === "paid"
}

/**
 * THE ONE PLACE THAT DECIDES whether an event's details are this viewer's
 * to see. A free event is always open, as every event was before round 14;
 * a paid one opens for staff who run events and for the people holding a
 * ticket. The view, the .ics route and the replay check all ask here.
 */
export function eventGateFor(e: PricedEventRow, viewer: Viewer, ticket: TicketView | null, now: number = Date.now()): TicketGate {
  return ticketGate(
    { ...pricingOf(e), startsAt: e.starts_at, cancelled: e.status === "cancelled", capacity: e.capacity, ticketsSold: soldOf(e) },
    { active: viewer.active, staff: runsEvents(viewer), ticket },
    now,
  )
}

/**
 * Whether this viewer may have a paid event's meeting link, exact address,
 * attendees, calendar file and replay. One ticket read, for the callers
 * outside a page's own view (the .ics route, the replay check).
 */
export async function eventDetailsOpen(db: Db, e: PricedEventRow, viewer: Viewer, now: number = Date.now()): Promise<boolean> {
  if (!isPaidEvent(e)) return true
  const tickets = await ticketsOf(db, viewer.userId, [e.id])
  return eventGateFor(e, viewer, tickets.get(e.id) ?? null, now).open
}

/**
 * A town for a paid event nobody has a ticket for: the last part of the
 * address, so "Online" or "Lisbon" is said without giving the street away.
 */
export function locationHintOf(location: string | null): string | null {
  if (!location) return null
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  return parts[parts.length - 1].slice(0, 60)
}

/* ── Cursor: (starts_at, id), base64url ─────────────────────────────────── */

export function encodeEventCursor(startsAt: string, id: string): string {
  return Buffer.from(`${new Date(startsAt).toISOString()}|${id}`).toString("base64url")
}

export function decodeEventCursor(raw: string | null | undefined): { at: string; id: string } | null {
  if (!raw || raw.length > 200) return null
  try {
    const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|")
    if (!UUID.test(id ?? "") || !Number.isFinite(Date.parse(at ?? ""))) return null
    return { at: new Date(at).toISOString(), id }
  } catch {
    return null
  }
}

/* ── Rows to views ──────────────────────────────────────────────────────── */

async function rsvpsOf(db: Db, userId: string | null, eventIds: string[]): Promise<Map<string, RsvpStatus>> {
  if (!userId || eventIds.length === 0) return new Map()
  const { data } = await db.from("community_event_rsvps").select("event_id, status").eq("user_id", userId).in("event_id", eventIds)
  return new Map(((data as { event_id: string; status: RsvpStatus }[] | null) ?? []).map((r) => [r.event_id, r.status]))
}

async function locksFor(db: Db, communityId: string, viewer: Viewer, rows: EventRow[]): Promise<Map<string, CourseLock>> {
  const v = accessViewer(viewer)
  const denials = rows.map((e) => [e.id, evaluateAccess(parseAccessRule(e.access), v)] as const).filter(([, r]) => !r.ok) as [string, { ok: false; reason: string; need?: string }][]
  if (denials.length === 0) return new Map()
  const tierIds = [...new Set(denials.filter(([, d]) => d.reason === "tier" && d.need).map(([, d]) => d.need as string))]
  const productIds = [...new Set(denials.filter(([, d]) => d.reason === "product" && d.need).map(([, d]) => d.need as string))]
  const [tiers, products] = await Promise.all([
    tierIds.length ? db.from("community_tiers").select("id, name").eq("community_id", communityId).in("id", tierIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : Promise.resolve({ data: [] }),
  ])
  const names = {
    tier: new Map(((tiers.data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name])),
    product: new Map(((products.data as { id: string; title: string | null }[] | null) ?? []).map((p) => [p.id, p.title || "a product"])),
  }
  return new Map(denials.map(([id, d]) => [id, lockFor(d, names)]))
}

function cardOf(community: CommunityRow, e: PricedEventRow, myRsvp: RsvpStatus | null, locked: CourseLock | null, ticket: TicketView | null, gate: TicketGate): EventCardView {
  const paid = isPaidEvent(e)
  const sold = soldOf(e)
  const seatsLeft = paid && e.capacity ? Math.max(0, e.capacity - sold) : null
  /* The exact address stays behind the gate; a town is fine (locationHintOf). */
  const open = gate.open
  return {
    id: e.id,
    title: e.title,
    coverUrl: e.cover_url,
    kind: e.kind,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone || "UTC",
    location: open ? e.location : null,
    locationHint: open ? null : locationHintOf(e.location),
    online: !e.location,
    capacity: e.capacity,
    goingCount: Math.max(0, e.going_count || 0),
    cancelled: e.status === "cancelled",
    myRsvp,
    locked,
    hasReplay: Boolean(e.replay_video_id),
    href: `/community/${community.slug}/events/${e.id}`,
    priceCents: paid ? pricingOf(e).priceCents : null,
    currency: paid ? pricingOf(e).currency : null,
    ticket,
    seatsLeft,
    soldOut: paid ? seatsLeft === 0 : false,
  }
}

/**
 * A page of cards. The viewer's answers come in one read, their locks in
 * one, and their tickets in ONE for the whole page (never one per card),
 * asked for only when something on the page costs money.
 */
async function cards(db: Db, community: CommunityRow, viewer: Viewer, rows: PricedEventRow[], now: number = Date.now()): Promise<EventCardView[]> {
  const paidIds = rows.filter((r) => isPaidEvent(r)).map((r) => r.id)
  const [rsvps, locks, tickets] = await Promise.all([
    rsvpsOf(db, viewer.userId, rows.map((r) => r.id)),
    locksFor(db, community.id, viewer, rows),
    paidIds.length ? ticketsOf(db, viewer.userId, paidIds) : Promise.resolve(new Map<string, TicketView>()),
  ])
  return rows.map((e) => {
    const ticket = tickets.get(e.id) ?? null
    return cardOf(community, e, rsvps.get(e.id) ?? null, locks.get(e.id) ?? null, ticket, eventGateFor(e, viewer, ticket, now))
  })
}

/* ── Lists ──────────────────────────────────────────────────────────────── */

/**
 * Upcoming (not over yet, soonest first) or Past (over, latest first), a
 * page at a time. "Over" is the end, or an hour after the start for an
 * event with no end, the same rule the page uses (model.ts isOver).
 */
export async function listEvents(
  db: Db,
  community: CommunityRow,
  viewer: Viewer,
  opts: { when: EventWhen; cursor?: string | null; limit?: number; now?: number },
): Promise<{ events: EventCardView[]; nextCursor: string | null }> {
  const now = opts.now ?? Date.now()
  const limit = Math.max(1, Math.min(50, opts.limit ?? EVENTS_PAGE))
  const nowAt = nowIso(now)
  const hourAgo = nowIso(now - HOUR_MS)
  const upcoming = opts.when === "upcoming"
  let q = db
    .from("community_events")
    .select(await eventColumns(db))
    .eq("community_id", community.id)
    .or(upcoming ? `ends_at.gt."${nowAt}",and(ends_at.is.null,starts_at.gt."${hourAgo}")` : `ends_at.lte."${nowAt}",and(ends_at.is.null,starts_at.lte."${hourAgo}")`)
  const cursor = decodeEventCursor(opts.cursor)
  if (cursor) {
    q = upcoming
      ? q.or(`starts_at.gt."${cursor.at}",and(starts_at.eq."${cursor.at}",id.gt.${cursor.id})`)
      : q.or(`starts_at.lt."${cursor.at}",and(starts_at.eq."${cursor.at}",id.lt.${cursor.id})`)
  }
  const { data, error } = await q.order("starts_at", { ascending: upcoming }).order("id", { ascending: upcoming }).limit(limit + 1)
  if (error) {
    if (!missing(error)) console.error(`[communities] events list: ${reasonOf(error)}`)
    return { events: [], nextCursor: null }
  }
  const rows = (data as PricedEventRow[] | null) ?? []
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return { events: await cards(db, community, viewer, page, now), nextCursor: rows.length > limit && last ? encodeEventCursor(last.starts_at, last.id) : null }
}

/** Every event the month grid shows (a few days either side, so any zone's are in it). At most 300. */
export async function monthEvents(db: Db, community: CommunityRow, viewer: Viewer, year: number, month: number): Promise<EventCardView[]> {
  const { from, to } = monthRange(year, month)
  const { data, error } = await db
    .from("community_events")
    .select(await eventColumns(db))
    .eq("community_id", community.id)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true })
    .limit(300)
  if (error) {
    if (!missing(error)) console.error(`[communities] events month: ${reasonOf(error)}`)
    return []
  }
  return cards(db, community, viewer, (data as PricedEventRow[] | null) ?? [])
}

/* ── One event ──────────────────────────────────────────────────────────── */

/** An event of THIS community, or null. */
export async function readEvent(db: Db, communityId: string, eventId: string): Promise<PricedEventRow | null> {
  if (!isEventId(eventId)) return null
  const { data, error } = await db.from("community_events").select(await eventColumns(db)).eq("id", eventId).eq("community_id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] event read: ${reasonOf(error)}`)
    return null
  }
  return (data as PricedEventRow | null) ?? null
}

async function people(db: Db, ids: string[]): Promise<Map<string, EventHost>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from("profiles").select("id, display_name, username, avatar_url").in("id", ids)
  return new Map(
    ((data as { id: string; display_name: string | null; username: string | null; avatar_url: string | null }[] | null) ?? []).map((p) => [
      p.id,
      { name: (p.display_name || p.username || "Member").trim(), avatarUrl: p.avatar_url },
    ]),
  )
}

/**
 * The plain words of an event for a calendar entry: its description, and
 * where to find it. `open` false is a paid event nobody here has a ticket
 * for, and then only the teaser goes into the file.
 */
function calendarDetails(e: EventRow, pageUrl: string, open: boolean = true): string {
  const text = open ? (e.description ? htmlToPlainText(e.description).trim().slice(0, 1200) : "") : eventTeaser(e.description) || ""
  return [text, `Event page: ${pageUrl}`].filter(Boolean).join("\n\n")
}

/**
 * The event page's data. The meeting link and livestream link are filled in
 * only inside the join window for a member the rule lets in.
 *
 * THE LOCKED RULE (round 14). For a paid event whose gate is shut, the
 * meeting link, the livestream, the exact address, the people going, the
 * calendar file and the replay are all null, and the description is cut to
 * a short plain teaser. The gate answer travels with the view so the page
 * can say, calmly, what would open it. A free event is untouched: its
 * gate is always open.
 */
export async function eventDetail(db: Db, community: CommunityRow, viewer: Viewer, eventId: string, now: number = Date.now()): Promise<EventDetailView | null> {
  const e = await readEvent(db, community.id, eventId)
  if (!e) return null
  const [card] = await cards(db, community, viewer, [e], now)
  const gate = eventGateFor(e, viewer, card.ticket, now)
  const paid = isPaidEvent(e)
  const pricing = pricingOf(e)
  const allowed = !card.locked && viewer.active && gate.open
  const cancelled = e.status === "cancelled"
  const window = joinWindowOpen({ startsAt: e.starts_at, endsAt: e.ends_at }, now)
  const showLinks = allowed && !cancelled && (window || (runsEvents(viewer) && !isOver({ startsAt: e.starts_at, endsAt: e.ends_at }, now)))
  /* Nobody without a ticket is told who else is going, so that read is skipped too. */
  const { data: goingRows } = allowed
    ? await db.from("community_event_rsvps").select("user_id").eq("event_id", e.id).eq("status", "going").order("created_at", { ascending: true }).limit(6)
    : { data: null }
  const goingIds = ((goingRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id)
  const who = await people(db, [...new Set([...(e.host_id ? [e.host_id] : []), ...goingIds])])
  const pageUrl = siteUrl(card.href)
  /* The event's own refund words, else the community's (part 101); only worth a read for a paid event. */
  const refundPolicyText = paid ? (pricing.refundPolicy?.trim() || (await communityPolicy(db, community.id)).refundPolicy) : null
  return {
    ...card,
    description: allowed ? (e.description ? sanitizeDescription(e.description) : null) : eventTeaser(e.description),
    host: e.host_id ? (who.get(e.host_id) ?? null) : null,
    meetingUrl: showLinks ? safeUrl(e.meeting_url) : null,
    livestreamUrl: showLinks ? safeUrl(e.livestream_url) : null,
    joinOpensAt: !card.locked && viewer.active && !cancelled && (e.meeting_url || e.livestream_url) && !isOver({ startsAt: e.starts_at, endsAt: e.ends_at }, now) ? new Date(Date.parse(e.starts_at) - JOIN_OPENS_MS).toISOString() : null,
    replayVideoId: allowed && e.replay_video_id && isOver({ startsAt: e.starts_at, endsAt: e.ends_at }, now) ? e.replay_video_id : null,
    communityId: community.id,
    communityName: community.name,
    attendees: goingIds.map((id) => who.get(id)).filter((p): p is EventHost => !!p),
    googleUrl: googleCalendarUrl({ title: e.title, startsAt: e.starts_at, endsAt: e.ends_at, details: calendarDetails(e, pageUrl, allowed), location: allowed ? e.location : card.locationHint }),
    icsUrl: allowed ? `/api/community/${community.id}/events/${e.id}/ics` : null,
    pageUrl,
    pricing,
    gate,
    ticketsSold: soldOf(e),
    refundPolicyText: refundPolicyText || null,
  }
}

/** Only an http(s) address is ever handed to a page as a link. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

/** The .ics data for an event: no meeting link, the event page instead. */
export function icsFields(community: CommunityRow, e: EventRow) {
  const url = siteUrl(`/community/${community.slug}/events/${e.id}`)
  return {
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    description: calendarDetails(e, url),
    location: e.location,
    url,
    updatedAt: e.updated_at,
    cancelled: e.status === "cancelled",
  }
}

/* ── Answering ──────────────────────────────────────────────────────────── */

export type RsvpOutcome =
  | { ok: true; status: RsvpStatus; goingCount: number; capacity: number | null }
  | { ok: false; status: number; error: "not_found" | "locked" | "cancelled" | "over" | "not_set_up" | "failed" | "ticket"; message: string }

/**
 * Going or not, through public.community_rsvp (capacity and waitlist held
 * in the database). The event must be this community's, open to the
 * member, not cancelled and not over.
 *
 * A PAID EVENT IS NOT ANSWERED HERE: the ticket is the answer, and the
 * ticket functions write the going row themselves. Somebody with no ticket
 * cannot put themselves on the attendee list, and a holder gives up their
 * seat through the ticket route so the money goes back with it.
 */
export async function answerEvent(db: Db, community: CommunityRow, viewer: Viewer, eventId: string, going: boolean, now: number = Date.now()): Promise<RsvpOutcome> {
  const e = await readEvent(db, community.id, eventId)
  if (!e || !viewer.userId) return { ok: false, status: 404, error: "not_found", message: "Event not found." }
  if (!evaluateAccess(parseAccessRule(e.access), accessViewer(viewer)).ok) return { ok: false, status: 403, error: "locked", message: "This event is not open to your membership." }
  if (isPaidEvent(e)) return { ok: false, status: 403, error: "ticket", message: "This event has a ticket. Getting one puts you on the list." }
  if (going && e.status === "cancelled") return { ok: false, status: 409, error: "cancelled", message: "This event was cancelled." }
  if (going && now >= endOf({ startsAt: e.starts_at, endsAt: e.ends_at })) return { ok: false, status: 409, error: "over", message: "This event is over." }

  /* Who is first in line, before a "not going" might move them up. */
  let firstWaiting: string | null = null
  if (!going && e.capacity) {
    const { data } = await db.from("community_event_rsvps").select("user_id").eq("event_id", e.id).eq("status", "waitlist").order("updated_at", { ascending: true }).order("user_id", { ascending: true }).limit(1)
    firstWaiting = ((data as { user_id: string }[] | null) ?? [])[0]?.user_id ?? null
  }

  const { data: status, error } = await db.rpc("community_rsvp", { p_event: e.id, p_user: viewer.userId, p_going: going })
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_set_up", message: "Events are not set up on Storelib yet. Try again later." }
    if (error.code === "P0002") return { ok: false, status: 404, error: "not_found", message: "Event not found." }
    console.error(`[communities] rsvp ${e.id}: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed", message: "That did not save. Try again." }
  }
  const answer = (typeof status === "string" ? status : "cancelled") as RsvpStatus
  if (answer === "going") {
    await recordActivity(db, { communityId: community.id, userId: viewer.userId, kind: "rsvp", targetType: "event", targetId: e.id })
    await ensureReminders(db, e, now)
  }
  if (firstWaiting && firstWaiting !== viewer.userId) await tellPromoted(db, community, e, firstWaiting)

  const { data: fresh } = await db.from("community_events").select("going_count, capacity").eq("id", e.id).maybeSingle()
  const f = fresh as { going_count: number; capacity: number | null } | null
  return { ok: true, status: answer, goingCount: Math.max(0, f?.going_count ?? e.going_count ?? 0), capacity: f?.capacity ?? e.capacity }
}

/** The member moved up from the waitlist hears about it, once. */
async function tellPromoted(db: Db, community: CommunityRow, e: EventRow, userId: string): Promise<void> {
  const { data } = await db.from("community_event_rsvps").select("status").eq("event_id", e.id).eq("user_id", userId).maybeSingle()
  if ((data as { status?: string } | null)?.status !== "going") return
  await notifyMember(db, {
    userId,
    communityId: community.id,
    kind: "event",
    target: { type: "event", id: e.id },
    title: `A spot opened: you are going to ${e.title}`.slice(0, 200),
    body: eventTime(e.starts_at, e.ends_at, { timeZone: e.timezone || undefined }),
    url: `/community/${community.slug}/events/${e.id}`,
    dedupeKey: `event_promoted:${e.id}:${userId}:${e.starts_at}`,
  })
  await ensureReminders(db, e)
}

/* ── Jobs ───────────────────────────────────────────────────────────────── */

/**
 * The event's two reminder jobs, each once per start time, run 24 hours and
 * 1 hour before it. A window already past is skipped (somebody answering
 * twenty minutes before the start is not told it is tomorrow).
 */
export async function ensureReminders(db: Db, e: Pick<EventRow, "id" | "starts_at" | "status">, now: number = Date.now()): Promise<number> {
  if (e.status === "cancelled") return 0
  const start = Date.parse(e.starts_at)
  let n = 0
  for (const window of Object.keys(REMINDER_WINDOWS) as ReminderWindow[]) {
    const runAt = start - REMINDER_WINDOWS[window]
    if (window === "24h" && now >= start - REMINDER_WINDOWS["1h"]) continue
    if (now >= start) continue
    const outcome = await queueJob(db, {
      kind: "event_reminder",
      payload: { eventId: e.id, window, startsAt: new Date(start).toISOString() },
      runAt: new Date(Math.max(runAt, now)),
      idempotencyKey: `event_reminder:${e.id}:${window}:${new Date(start).toISOString()}`,
    })
    if (outcome === "queued") n++
  }
  return n
}

/**
 * For the creator's screens, after an event is made or moved: members hear
 * about a new event (fanout_event, once per event), and anyone already
 * going gets their reminders for the new time.
 */
export async function eventScheduled(db: Db, e: Pick<EventRow, "id" | "community_id" | "starts_at" | "status">, opts: { announce: boolean }): Promise<void> {
  if (e.status === "cancelled") return
  if (opts.announce && Date.parse(e.starts_at) > Date.now()) {
    await queueJob(db, { kind: "fanout_event", payload: { eventId: e.id, communityId: e.community_id }, idempotencyKey: `fanout_event:${e.id}` })
  }
  const { count } = await db.from("community_event_rsvps").select("user_id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "going")
  if ((count ?? 0) > 0) await ensureReminders(db, e)
}

/* ── Many members at once, for the jobs ─────────────────────────────────── */

export interface BulkNotice {
  userId: string
  title: string
  body: string | null
  url: string
  dedupeKey: string
}

/**
 * One insert for a page of members' inbox rows, each once per dedupe key
 * (the same rule as notifyMember, without a read per member: the caller has
 * already kept only active members who want this kind). Answers the members
 * whose row is new, which is what makes an email after it happen once.
 */
export async function bulkNotify(db: Db, communityId: string, kind: "event" | "event_reminder", target: { type: string; id: string }, notices: BulkNotice[]): Promise<Set<string>> {
  if (notices.length === 0) return new Set()
  const { data, error } = await db
    .from("community_notifications")
    .upsert(
      notices.map((n) => ({
        user_id: n.userId,
        community_id: communityId,
        kind,
        target_type: target.type,
        target_id: target.id,
        title: n.title.slice(0, 200),
        body: n.body ? n.body.slice(0, 500) : null,
        url: n.url,
        dedupe_key: n.dedupeKey.slice(0, 300),
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("user_id")
  if (error) {
    if (missing(error)) return new Set()
    throw new Error(`notifications not written: ${reasonOf(error)}`)
  }
  return new Set(((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id))
}
