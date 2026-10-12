/**
 * ===========================================================================
 *  COMMUNITIES: PAID EVENTS, THE MEMBER SIDE (round 14, asks 7 to 12)
 * ===========================================================================
 * An event may carry a price, and then its details belong to the people
 * holding a ticket. Held from the views' own inputs and against an in
 * memory database:
 *
 *   THE LOCKED RULE  a paid event read by somebody with no ticket carries
 *                    no meeting link, no livestream, no exact address, no
 *                    attendees, no calendar file and no replay, and its
 *                    description is a short plain teaser. A holder and the
 *                    staff who run events get all of it. The .ics route and
 *                    the replay check ask the same question.
 *   ONE READ         the viewer's tickets are read once for a whole page of
 *                    cards, never once per card, and not at all when
 *                    nothing on the page costs money.
 *   DEGRADING        with run-now part 105 not run, the money columns are
 *                    never selected, every event is free, and the pages
 *                    work exactly as they did.
 *   ANSWERING        a paid event is not answered through the rsvp route:
 *                    the ticket is the answer.
 *   THE PAGES        the cards state a price once and say Sold out; a free
 *                    event's page says nothing about money; the checkout
 *                    sheet asks the server for the session and confirms it.
 *   COPY             no em dash and no banned word in this work, and no
 *                    client module reaches for server code.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

import { memDb, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import { eventPriceLabel, refundWindowOpen, salesOpen, seatsLeftLabel, ticketGate, type TicketView } from "@/lib/communities/event-tickets"
import { resetTicketsReady } from "@/lib/communities/server/event-tickets"
import { eventDetail, eventDetailsOpen, eventGateFor, isPaidEvent, listEvents, locationHintOf, answerEvent } from "@/lib/communities/server/events"
import { eventTeaser, whenLine } from "@/components/community/events/model"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, MemberRow, Role } from "@/lib/communities/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`
const A = id(1)
const CREATOR = id(10)
const OWNER = id(11)
const ALICE = id(20) /* a member with no ticket */
const BOB = id(21) /* a member holding a paid ticket */
const DANA = id(22) /* a moderator who runs events */
const E_PAID = id(40)
const E_FREE = id(41)
const E_SOLD_OUT = id(42)
const VIDEO = id(60)
const NOW = Date.parse("2026-10-05T12:00:00Z")
const DAY = 86_400_000
const HOUR = 3_600_000
const iso = (t: number) => new Date(t).toISOString()

const ADDRESS = "Rua das Flores 28, Lisbon"
const DESCRIPTION =
  "<p>A whole Saturday at the wheel, from centering a ball of clay to a set of four cups you can take home once they are fired.</p>" +
  "<p>We start slowly, with wedging and the first pull, and keep going until everybody has thrown something they want to keep.</p>" +
  "<p>The door code is 4417 and the studio is on the second floor, up the stairs past the cafe. Clay, tools and glaze are included.</p>"

function community(over: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: A, creator_id: CREATOR, owner_user_id: OWNER, slug: "makers", name: "Makers", tagline: null, description: null, logo_url: null, cover_url: null, cover_video_id: null,
    visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 4, post_count: 0, discovery_enabled: true, approval_required: false,
    default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: true, rules: [], faq: [], benefits: [], links: [],
    onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null,
    deleted_at: null, created_at: iso(NOW - 90 * DAY), updated_at: iso(NOW), ...over,
  } as CommunityRow
}

function member(userId: string, over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: `m${userId.slice(-6)}`, community_id: A, user_id: userId, status: "active", role: "member", tier_id: null, source: "free",
    source_membership_id: null, source_product_id: null, source_order_id: null, invite_id: null, invited_by: null, request_note: null, requested_at: null, approved_by: null,
    joined_at: iso(NOW - 10 * DAY), last_active_at: null, expires_at: null, points: 0, level: 1, muted_until: null, ban_reason: null, banned_at: null, banned_by: null, removed_at: null,
    notify_level: "important", email_announcements: true, email_events: true, onboarded_at: null, bio: null, created_at: iso(NOW - 10 * DAY), updated_at: iso(NOW), ...over,
  } as MemberRow
}

function viewer(m: MemberRow | null, over: Partial<Viewer> = {}): Viewer {
  const active = m?.status === "active"
  return {
    userId: m?.user_id ?? null, member: m, role: active ? (m?.role as Role) : null, active, status: m?.status ?? null, tierId: m?.tier_id ?? null, ownedProductIds: [], level: m?.level ?? 1,
    points: m?.points ?? 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...over,
  } as Viewer
}

const event = (eid: string, over: Record<string, unknown> = {}) => ({
  id: eid, community_id: A, title: "Wheel throwing, a whole Saturday", description: DESCRIPTION, cover_url: null, kind: "workshop",
  starts_at: iso(NOW + 5 * DAY), ends_at: iso(NOW + 5 * DAY + 6 * HOUR), timezone: "Europe/Lisbon", location: ADDRESS,
  meeting_url: "https://zoom.us/j/1234567890", livestream_url: "https://youtube.com/live/x", capacity: 12, going_count: 7, access: {},
  host_id: OWNER, replay_video_id: VIDEO, status: "scheduled", reminder_24h_at: null, reminder_1h_at: null, created_by: OWNER,
  created_at: iso(NOW - DAY), updated_at: iso(NOW - DAY),
  price_cents: 2500, currency: "usd", sales_close_at: null, refund_window_hours: 48, refund_policy: null, tickets_sold: 7,
  ...over,
})

const ticketRow = (eid: string, userId: string, over: Record<string, unknown> = {}) => ({
  id: `t${eid.slice(-3)}${userId.slice(-3)}`, event_id: eid, community_id: A, user_id: userId, status: "paid", source: "purchase",
  checkout_session_id: "cs_1", payment_intent_id: "pi_1", amount_cents: 2500, currency: "usd", platform_fee_cents: 125, held_until: null,
  paid_at: iso(NOW - DAY), refunded_at: null, cancelled_at: null, refund_reason: null, invited_by: null, invite_email: null,
  attended_at: null, created_at: iso(NOW - DAY), updated_at: iso(NOW - DAY), ...over,
})

function eventsDb(opts: { tickets?: boolean } = {}) {
  resetTicketsReady()
  return memDb(
    {
      communities: [community()],
      community_members: [member(ALICE), member(BOB), member(DANA, { role: "admin" })],
      community_events: [
        event(E_PAID),
        event(E_FREE, { id: E_FREE, title: "Open studio hour", price_cents: null, currency: null, refund_window_hours: null, tickets_sold: 0, capacity: null, location: null, replay_video_id: null }),
        event(E_SOLD_OUT, { id: E_SOLD_OUT, title: "Glaze night", capacity: 2, tickets_sold: 2, price_cents: 4000 }),
      ],
      community_event_rsvps: [
        { event_id: E_PAID, user_id: BOB, community_id: A, status: "going", created_at: iso(NOW - DAY), updated_at: iso(NOW - DAY) },
        { event_id: E_FREE, user_id: ALICE, community_id: A, status: "going", created_at: iso(NOW - DAY), updated_at: iso(NOW - DAY) },
      ],
      community_event_tickets: opts.tickets === false ? [] : [ticketRow(E_PAID, BOB)],
      profiles: [
        { id: OWNER, display_name: "Mara", username: "mara", avatar_url: null },
        { id: ALICE, display_name: "Alice", username: "alice", avatar_url: null },
        { id: BOB, display_name: "Bob", username: "bob", avatar_url: null },
      ],
      community_jobs: [],
      community_notifications: [],
    },
    opts.tickets === false ? { failWith: { community_event_tickets: { code: "42P01", message: "relation does not exist" } } } : {},
  )
}

const alice = () => viewer(member(ALICE))
const bob = () => viewer(member(BOB))
const dana = () => viewer(member(DANA, { role: "admin" }))

async function main() {
  /* ── The pure rules the pages lean on ───────────────────────────────────── */

  console.log("\nTHE PURE RULES")
  {
    check("a teaser carries words and no html", eventTeaser(DESCRIPTION)?.startsWith("A whole Saturday at the wheel") === true && !/[<>]/.test(eventTeaser(DESCRIPTION) ?? ""))
    check("a teaser stops near 280 characters", (eventTeaser(DESCRIPTION) ?? "").length <= 281, (eventTeaser(DESCRIPTION) ?? "").length)
    check("a long teaser never carries the whole description", !(eventTeaser(DESCRIPTION) ?? "").includes("second floor"), eventTeaser(DESCRIPTION))
    check("a short description is left whole", eventTeaser("<p>Two lines only.</p>") === "Two lines only.")
    check("nothing to say is null", eventTeaser(null) === null && eventTeaser("<p> </p>") === null)
    check("a town is the last part of an address", locationHintOf(ADDRESS) === "Lisbon", locationHintOf(ADDRESS))
    check("a one part address gives no town away", locationHintOf("The studio") === null && locationHintOf(null) === null)
    check("the price label is plain", eventPriceLabel(2500, "usd") === "$25" && eventPriceLabel(2550, "usd") === "$25.50")
    check("seats left reads as a sentence", seatsLeftLabel(12, 7) === "5 seats left" && seatsLeftLabel(12, 12) === "Sold out" && seatsLeftLabel(null, 7) === null)
    check("when says the day and the hour", /October 10/.test(whenLine(iso(Date.parse("2026-10-10T18:00:00Z")), "UTC")))
  }

  /* ── The locked rule, on the detail view ────────────────────────────────── */

  console.log("\nTHE LOCKED RULE")
  {
    const db = eventsDb()
    const c = community()
    const shut = await eventDetail(db as never, c, alice(), E_PAID, NOW)
    check("a paid event is still readable with no ticket", !!shut && shut.title === "Wheel throwing, a whole Saturday")
    check("the gate says what to do: pay", shut?.gate.open === false && shut?.gate.reason === "pay", shut?.gate)
    check("no meeting link", shut?.meetingUrl === null)
    check("no livestream", shut?.livestreamUrl === null)
    check("no exact address", shut?.location === null, shut?.location)
    check("a town instead", shut?.locationHint === "Lisbon", shut?.locationHint)
    check("no attendees", (shut?.attendees ?? ["x"]).length === 0)
    check("no calendar file", shut?.icsUrl === null)
    check("no replay", shut?.replayVideoId === null)
    check("the description is the teaser, not the words behind the door", !!shut?.description && !shut.description.includes("4417") && !shut.description.includes("<p>"), shut?.description)
    check("nothing private is anywhere in the answer", !JSON.stringify(shut).includes("zoom.us") && !JSON.stringify(shut).includes("4417") && !JSON.stringify(shut).includes("Rua das Flores"))
    check("the public facts are all there", shut?.goingCount === 7 && shut?.priceCents === 2500 && shut?.ticketsSold === 7 && shut?.seatsLeft === 5 && !!shut?.host)
    check("and so is what the money does", shut?.pricing.refundWindowHours === 48 && shut?.currency === "usd")

    const open = await eventDetail(db as never, c, bob(), E_PAID, NOW)
    check("a holder's gate is open through their ticket", open?.gate.open === true && open?.gate.via === "ticket", open?.gate)
    check("a holder gets the exact address", open?.location === ADDRESS)
    check("a holder gets the attendees", (open?.attendees ?? []).length === 1)
    check("a holder gets the calendar file", typeof open?.icsUrl === "string")
    check("a holder gets the whole description", open?.description?.includes("4417") === true)
    check("a holder's own ticket comes with the page", open?.ticket?.status === "paid" && open?.ticket?.amountCents === 2500)

    const staff = await eventDetail(db as never, c, dana(), E_PAID, NOW)
    check("somebody who runs events sees it all without a ticket", staff?.gate.open === true && staff?.gate.via === "staff" && staff?.location === ADDRESS)

    const free = await eventDetail(db as never, c, alice(), E_FREE, NOW)
    check("A FREE EVENT IS EXACTLY AS IT WAS: open, no price, no ticket", free?.gate.open === true && free?.gate.via === "free" && free?.priceCents === null && free?.ticket === null)
    check("a free event keeps its calendar file and its words", typeof free?.icsUrl === "string" && free?.description?.includes("4417") === true)
    check("a free event says nothing about refunds", free?.refundPolicyText === null && free?.pricing.priceCents === null)

    const soldOut = await eventDetail(db as never, c, alice(), E_SOLD_OUT, NOW)
    check("a full paid event reads sold out, not an error", soldOut?.gate.open === false && soldOut?.gate.reason === "sold_out" && soldOut?.soldOut === true)
  }

  /* ── The .ics route and the replay check ask the same question ──────────── */

  console.log("\nTHE SAME RULE EVERYWHERE")
  {
    const db = eventsDb()
    const paid = db.tables.community_events.find((e) => e.id === E_PAID)
    const free = db.tables.community_events.find((e) => e.id === E_FREE)
    check("a member with no ticket is refused the event's details", !(await eventDetailsOpen(db as never, paid as never, alice(), NOW)))
    check("a holder is not", await eventDetailsOpen(db as never, paid as never, bob(), NOW))
    check("staff are not", await eventDetailsOpen(db as never, paid as never, dana(), NOW))
    check("a free event is open to every member", await eventDetailsOpen(db as never, free as never, alice(), NOW))

    const ics = code("app/api/community/[communityId]/events/[eventId]/ics/route.ts")
    check("THE .ICS ROUTE REFUSES A NON HOLDER, before it writes the file", /eventDetailsOpen\(db, event, gate\.viewer\)[\s\S]{0,120}status: 403/.test(ics), ics.slice(ics.indexOf("eventDetailsOpen"), ics.indexOf("eventDetailsOpen") + 200))
    check("and it answers with a reason a page can read", /"ticket_needed"/.test(ics))

    const videos = code("lib/communities/server/videos.ts")
    check("the replay check applies the same gate", /eventDetailsOpen\(db, e, viewer, now\)/.test(videos))
    check("and reads the event's money columns to do it", /select\(await eventColumns\(db\)\)/.test(videos))
  }

  /* ── One ticket read for a page ─────────────────────────────────────────── */

  console.log("\nONE READ PER PAGE")
  {
    const db = eventsDb()
    const c = community()
    const page = await listEvents(db as never, c, alice(), { when: "upcoming", now: NOW })
    const mine = (dbx: MemDb) => dbx.log.filter((l) => l.table === "community_event_tickets" && l.filters.some((f) => f.startsWith("user_id")))
    check("a page of cards reads tickets once, not once per card", mine(db).length === 1 && page.events.length === 3, { reads: mine(db).length, cards: page.events.length })
    check("each card carries its own price", page.events.map((e) => e.priceCents).sort().join() === [2500, 4000, null].sort().join(), page.events.map((e) => e.priceCents))
    check("a free card carries no price and no ticket", page.events.find((e) => e.id === E_FREE)?.priceCents === null)
    check("a full paid card reads sold out", page.events.find((e) => e.id === E_SOLD_OUT)?.soldOut === true)
    check("a card with no ticket keeps the address behind the gate", page.events.find((e) => e.id === E_PAID)?.location === null)

    const held = await listEvents(db as never, c, bob(), { when: "upcoming", now: NOW })
    check("a holder's card carries their ticket", held.events.find((e) => e.id === E_PAID)?.ticket?.status === "paid")

    const freeOnly = memDb({ communities: [community()], community_members: [member(ALICE)], community_events: [event(E_FREE, { id: E_FREE, price_cents: null, tickets_sold: 0 })], community_event_rsvps: [], community_event_tickets: [] })
    resetTicketsReady()
    await listEvents(freeOnly as never, c, alice(), { when: "upcoming", now: NOW })
    check("a page with nothing to pay for never asks for anybody's tickets", mine(freeOnly).length === 0, freeOnly.log.filter((l) => l.table === "community_event_tickets"))
  }

  /* ── Before run-now part 105 ────────────────────────────────────────────── */

  console.log("\nBEFORE PART 105")
  {
    /* The rows have no money columns at all, which is what the database looks like before the update. */
    const bare = (eid: string, over: Record<string, unknown> = {}) => {
      const row = { ...event(eid, over) } as Record<string, unknown>
      for (const col of ["price_cents", "currency", "sales_close_at", "refund_window_hours", "refund_policy", "tickets_sold"]) delete row[col]
      return row
    }
    resetTicketsReady()
    const db = memDb(
      {
        communities: [community()],
        community_members: [member(ALICE)],
        community_events: [bare(E_PAID), bare(E_FREE, { id: E_FREE, title: "Open studio hour" }), bare(E_SOLD_OUT, { id: E_SOLD_OUT, title: "Glaze night" })],
        community_event_rsvps: [],
        profiles: [{ id: OWNER, display_name: "Mara", username: "mara", avatar_url: null }],
      },
      { failWith: { community_event_tickets: { code: "42P01", message: "relation does not exist" } } },
    )
    const c = community()
    const page = await listEvents(db as never, c, alice(), { when: "upcoming", now: NOW })
    check("every event is still listed", page.events.length === 3)
    check("every event reads as free", page.events.every((e) => e.priceCents === null && e.ticket === null && !e.soldOut), page.events.map((e) => e.priceCents))
    const detail = await eventDetail(db as never, c, alice(), E_PAID, NOW)
    check("the page opens as it always did", detail?.gate.open === true && detail?.location === ADDRESS && detail?.description?.includes("4417") === true)
    check("and the calendar file is there", typeof detail?.icsUrl === "string")
    const src = code("lib/communities/server/events.ts")
    check("the money columns ride on ticketsReady, so PostgREST is never asked for a column that is not there", /ticketsReady\(db\)\) \? EVENT_COLUMNS_PRICED : EVENT_COLUMNS/.test(src))
  }

  /* ── A paid event is answered by its ticket ─────────────────────────────── */

  console.log("\nANSWERING")
  {
    const db = eventsDb()
    const c = community()
    const paid = await answerEvent(db as never, c, alice(), E_PAID, true, NOW)
    check("a member with no ticket cannot put themselves on a paid event's list", paid.ok === false && paid.status === 403 && paid.error === "ticket", paid)
    check("and is told what to do instead, calmly", paid.ok === false && /ticket/i.test(paid.message) && !/error|failed/i.test(paid.message), paid.ok === false ? paid.message : "")
    const held = await answerEvent(db as never, c, bob(), E_PAID, false, NOW)
    check("nor does a holder drop their seat through the rsvp route", held.ok === false && held.error === "ticket")
    const free = await answerEvent(db as never, c, alice(), E_FREE, true, NOW)
    check("A FREE EVENT IS STILL ANSWERED THE SAME WAY, never about a ticket", free.ok === true || free.error !== "ticket", free)
  }

  /* ── The gate itself ────────────────────────────────────────────────────── */

  console.log("\nTHE GATE")
  {
    const db = eventsDb()
    const row = db.tables.community_events.find((e) => e.id === E_PAID)
    check("a paid event is paid", isPaidEvent(row as never))
    check("a zero price is free", !isPaidEvent({ ...(row as Record<string, unknown>), price_cents: 0 } as never))
    const t: TicketView = { id: "t", status: "paid", source: "purchase", amountCents: 2500, currency: "usd", paidAt: iso(NOW - DAY), refundedAt: null, attendedAt: null }
    check("inside the refund window the holder may give the seat up", refundWindowOpen({ refundWindowHours: 48, startsAt: iso(NOW + 5 * DAY) }, t, NOW))
    check("inside the last 48 hours they may not", !refundWindowOpen({ refundWindowHours: 48, startsAt: iso(NOW + HOUR) }, t, NOW))
    check("with no window set there is no button at all", !refundWindowOpen({ refundWindowHours: null, startsAt: iso(NOW + 5 * DAY) }, t, NOW))
    check("an invited seat has nothing to give back", !refundWindowOpen({ refundWindowHours: 48, startsAt: iso(NOW + 5 * DAY) }, { ...t, amountCents: 0 }, NOW))
    check("sales close at the start when no time is set", salesOpen({ priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: null, refundPolicy: null, startsAt: iso(NOW + HOUR), cancelled: false }, NOW))
    check("and are shut once it has started", !salesOpen({ priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: null, refundPolicy: null, startsAt: iso(NOW - HOUR), cancelled: false }, NOW))
    const shut = ticketGate({ priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: null, refundPolicy: null, startsAt: iso(NOW + DAY), cancelled: false, capacity: 2, ticketsSold: 0 }, { active: false, staff: false, ticket: null }, NOW)
    check("a visitor is asked to join first, not to pay", shut.open === false && shut.reason === "not_member", shut)
    check("eventGateFor is the one call the views make", /export function eventGateFor/.test(code("lib/communities/server/events.ts")))
    check("and the detail view asks it rather than deciding on its own", /const gate = eventGateFor\(e, viewer, card\.ticket, now\)/.test(code("lib/communities/server/events.ts")))
    check("a staff gate is open", eventGateFor(row as never, dana(), null, NOW).open)
  }

  /* ── The pages ──────────────────────────────────────────────────────────── */

  console.log("\nTHE PAGES")
  {
    const cards = code("components/community/events/events-page.tsx")
    check("a card draws a price only when there is one, and never beside a seat already bought", /const price = event\.priceCents && !hasTicket/.test(cards))
    check("a card says Sold out instead of a price", /data-event-sold-out/.test(cards) && /const soldOut = event\.soldOut && !hasTicket/.test(cards))
    check("Full is not said beside Sold out", /!past && !event\.cancelled && !soldOut && \(event\.goingCount > 0/.test(cards))
    check("the month grid carries the price too", /data-calendar-price/.test(cards))

    const detail = code("components/community/events/event-detail.tsx")
    check("the page opens the checkout sheet rather than sending anybody away", /TicketCheckoutSheet/.test(detail) && !/window\.location/.test(detail))
    check("Get a ticket carries the price", /Get a ticket · \{price\}/.test(detail))
    check("a holder's line says what they paid, and an invited one says no price", /Paid \$\{paidLabel\}/.test(detail) && /You were invited to this event, with nothing to pay/.test(detail))
    check("giving up a seat goes through the ticket route with DELETE", /method: "DELETE"[\s\S]{0,200}\/ticket`|\/ticket`[\s\S]{0,200}method: "DELETE"/.test(detail))
    check("and asks first, with a Storelib confirm that says what comes back", /ConfirmDialog/.test(detail) && /goes back to the card you paid with/.test(detail))
    check("outside the window the policy words stand in for the button", /!canGiveUpSeat[\s\S]{0,120}refundPolicyText/.test(detail))
    check("a reader with no ticket is given plain words, never html", /gate\.open \?[\s\S]{0,200}dangerouslySetInnerHTML/.test(detail))
    check("a cancelled paid event says where the money went", /on its way back to the card you paid with/.test(detail))
    check("on a large screen the event cover stays a modest 16:9, not a stretched banner", /data-event-layout="stack"/.test(detail) && /max-w-\[640px\]/.test(detail) && /aspect-\[16\/9\]/.test(detail) && /data-event-cover/.test(detail))
    check("an event can be shared, and its picture follows the cover, title and description", /data-event-share=""/.test(detail) && /eventMetadata\(facts\)/.test(code("app/(marketing)/community/[slug]/(member)/events/[eventId]/page.tsx")) && /coverSrc/.test(code("app/(marketing)/community/[slug]/(member)/events/[eventId]/share.png/route.tsx")) && /f\.event\.coverUrl/.test(code("app/(marketing)/community/[slug]/(member)/events/[eventId]/event-seo.ts")) && /f\.event\.description/.test(code("app/(marketing)/community/[slug]/(member)/events/[eventId]/event-seo.ts")))

    const sheet = code("components/community/events/ticket-checkout.tsx")
    check("the sheet asks the server for the session", /\/api\/community\/\$\{communityId\}\/events\/\$\{eventId\}\/checkout/.test(sheet))
    check("and confirms it when Stripe says it is paid", /\$\{base\}\/confirm/.test(sheet) && /onComplete/.test(sheet))
    check("the sheet never carries a price of its own into Stripe", !/amount|price_cents/.test(sheet.replace(/priceLabel/g, "")))
    check("it is a sheet on a phone and a dialog on a computer", /SheetDialog/.test(sheet) && /max-w-\[520px\]/.test(sheet))
    check("Stripe.js is loaded only when it opens", /getStripePromise/.test(sheet) && /\{open \? \(/.test(sheet))
    check("the session is asked for once per open", /if \(open\) setPhase\(\{ kind: "form" \}\)\s*\n\s*else setAttempt/.test(sheet))
  }

  /* ── Nothing of the server reaches the browser ──────────────────────────── */

  console.log("\nCLIENT AND SERVER")
  {
    const client = walk("components/community/events").filter((p) => /\.tsx?$/.test(p))
    const bad = client.filter((p) => /from "@\/lib\/communities\/server\//.test(read(p)) || /from "next\/headers"/.test(read(p)) || /server-only/.test(read(p)))
    check("no module under components/community/events imports server code", bad.length === 0, bad)
    check("the model only takes types from the ticket rules", /import type \{ EventPricing, TicketGate, TicketView \} from "@\/lib\/communities\/event-tickets"/.test(read("components/community/events/model.ts")))
  }

  /* ── Copy ───────────────────────────────────────────────────────────────── */

  console.log("\nCOPY")
  {
    const mine = [
      "lib/communities/server/events.ts",
      "components/community/events/model.ts",
      "components/community/events/events-page.tsx",
      "components/community/events/event-detail.tsx",
      "components/community/events/ticket-checkout.tsx",
      "app/api/community/[communityId]/events/[eventId]/ics/route.ts",
      "scripts/render-community-events-paid.tsx",
      "scripts/check-community-events-paid.mjs",
      "tests/communities-events-member.test.ts",
    ]
    /* Spelled by code point and by halves, so this suite does not trip over its own list. */
    const dash = String.fromCharCode(0x2014)
    const words = ["unl" + "ock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge", "trans" + "form"]
    const banned = new RegExp(`${dash}|\\b(${words.join("|")})`, "i")
    const offenders = mine.filter((f) => banned.test(read(f)))
    check("no em dash and none of the banned words in this work", offenders.length === 0, offenders)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
