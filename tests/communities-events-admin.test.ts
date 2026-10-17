/**
 * ===========================================================================
 *  COMMUNITIES ROUND 14: PRICING AN EVENT FROM /app (worker A)
 * ===========================================================================
 * Held from their inputs:
 *
 *   TICKETS CARD  Free clears every money column; Paid needs at least 0.50,
 *                 sales close in the event's own zone and by the time it
 *                 starts, a refund window of whole hours up to a year, and
 *                 a policy cut at 2,000 characters. Every refusal names its
 *                 field, so the editor shows it under that field and never
 *                 as an alert.
 *   PERMISSION    price_events and refund_tickets are the tickets group:
 *                 on for admins and moderators by default, switchable off
 *                 by the owner, never taken from the owner. A moderator
 *                 whose owner switched the group off is refused by the
 *                 functions the routes call (403), not only by a hidden
 *                 button, and the routes ask can() before they write.
 *   PANEL         sold, given free, taken, refunded and seats left, counted
 *                 from ticket rows; holders a page at a time; a search by
 *                 name reads only the matching people's tickets; an email
 *                 is only ever in the answer for somebody who may see one.
 *   REFUNDS       one ticket's money back through Stripe then its seat; a
 *                 cancelled event refunds everybody before it is called off
 *                 and says how many went back.
 *   PRICE OFF     a price is not taken off an event people hold tickets for.
 *   LIST          the money line on an event is a sum of rows, never a
 *                 price times a count.
 *   ANALYTICS     ticket revenue for the period: sold, gross, refunded, net,
 *                 absent until run-now part 105 has run.
 *   DEGRADE       without part 105 nothing is written, the card is one
 *                 staff line, and every read answers as it did before.
 *   HONEST        a priced event with payouts off is called out once, in the
 *                 checklist and on the overview.
 *   COPY          no em dash, no banned word, no server code in a client file.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_KEYS, OWNER_ONLY_ACTIONS, allowedActions, can, parseRolePermissions } from "@/lib/communities/permissions"
import { eventPriceLabel, seatsLeftLabel } from "@/lib/communities/event-tickets"
import { EVENT_PRICE_MIN_CENTS, EVENT_REFUND_WINDOW_MAX_HOURS, checkEventTickets, nextSteps, refundWindowWords, type NextStepFacts } from "@/components/community/creator/logic"
import {
  eventPriceColumns,
  eventReadColumns,
  eventTicketBasics,
  eventsTicketMoney,
  loadEventTicketPanel,
  TICKET_HOLDERS_PAGE,
  markTicketAttended,
  priceChangeRefusal,
  pricedEventCount,
  refundEveryTicketFor,
  refundOneTicket,
  searchMembersToInvite,
} from "@/lib/communities/server/event-admin"
import { resetTicketsReady } from "@/lib/communities/server/event-tickets"
import { loadEventMoney } from "@/lib/communities/server/stats"
import { EVENT_COLUMNS, type CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const CID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const EID = "2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const OWNER = UID(1)
const MOD = UID(3)
const BUYER = UID(10)
const GUEST = UID(11)
const community = { id: CID, slug: "makers", name: "Makers", status: "published", access: "free", creator_id: UID(90) } as unknown as CommunityRow
const status = (r: unknown) => (r as { status?: number }).status
const errorOf = (r: unknown) => (r as { error?: string }).error
const fieldOf = (r: unknown) => (r as { field?: string }).field

/** A whole event in the editor's words, so only the money fields differ between cases. */
const START = "2026-07-15T17:00:00.000Z"
const draft = (extra: Record<string, unknown> = {}) => ({
  title: "Paid workshop",
  description: "Two hours on pricing.",
  kind: "online",
  startDate: "2026-07-15",
  startTime: "19:00",
  endTime: "21:00",
  timezone: "Europe/Bucharest",
  ...extra,
})

const startedAt = { startsAt: START, timezone: "Europe/Bucharest" }

/** The Stripe stub: the suite never reaches the real one. */
function refundStub() {
  const calls: { intent: string; amount?: number; key: string }[] = []
  return {
    calls,
    deps: {
      createRefund: async (p: { payment_intent: string; amount?: number }, key: string) => {
        calls.push({ intent: p.payment_intent, amount: p.amount, key })
        return { id: `re_${calls.length}`, status: "succeeded", currency: "usd" }
      },
      afterRefund: async () => {},
    },
  }
}

/** A database with part 105 run: the tickets table and the five functions answering. */
function ticketDb(rows: { events?: Record<string, unknown>[]; tickets?: Record<string, unknown>[]; members?: Record<string, unknown>[]; profiles?: Record<string, unknown>[] } = {}) {
  const db = fakeDb({
    communities: [{ id: CID, name: "Makers", slug: "makers", creator_id: UID(90), refund_policy: "Ask us up to a week before." }],
    community_events: rows.events ?? [{ id: EID, community_id: CID, title: "Paid workshop", starts_at: START, ends_at: null, timezone: "Europe/Bucharest", status: "scheduled", capacity: 10, going_count: 2, access: {}, kind: "online", price_cents: 2500, currency: "usd", tickets_sold: 2, description: null, cover_url: null, location: null, meeting_url: null, livestream_url: null, replay_video_id: null }],
    community_event_tickets: rows.tickets ?? [],
    community_members: rows.members ?? [],
    profiles: rows.profiles ?? [],
    community_audit_log: [],
    community_refunds: [],
    community_event_rsvps: [],
  })
  /* The locked SQL functions, as the only two this side calls: release and grant. */
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "community_event_ticket_release") {
      const t = db.tables.community_event_tickets.find((x: Record<string, unknown>) => x.id === args.p_ticket)
      if (!t) return { data: { ok: false, reason: "not_found" }, error: null }
      const changed = t.status !== (args.p_status ?? "refunded")
      t.status = args.p_status ?? "refunded"
      t.refunded_at = new Date().toISOString()
      return { data: { ok: true, changed, event_id: t.event_id, user_id: t.user_id, payment_intent_id: t.payment_intent_id ?? null, amount_cents: t.amount_cents ?? null }, error: null }
    }
    return { data: null, error: null }
  }
  return { ...db, rpc, tables: db.tables, log: db.log }
}

async function main() {
  const tickets = () => [
    { id: UID(50), event_id: EID, community_id: CID, user_id: BUYER, status: "paid", source: "purchase", amount_cents: 2500, currency: "usd", payment_intent_id: "pi_1", paid_at: "2026-07-01T10:00:00.000Z", created_at: "2026-07-01T10:00:00.000Z", attended_at: null, refunded_at: null, invited_by: null, invite_email: null, checkout_session_id: "cs_1", held_until: null, cancelled_at: null, refund_reason: null, platform_fee_cents: 250 },
    { id: UID(51), event_id: EID, community_id: CID, user_id: GUEST, status: "paid", source: "invite", amount_cents: 0, currency: "usd", payment_intent_id: null, paid_at: "2026-07-02T10:00:00.000Z", created_at: "2026-07-02T10:00:00.000Z", attended_at: null, refunded_at: null, invited_by: OWNER, invite_email: null, checkout_session_id: null, held_until: null, cancelled_at: null, refund_reason: null, platform_fee_cents: null },
    { id: UID(52), event_id: EID, community_id: CID, user_id: UID(12), status: "refunded", source: "purchase", amount_cents: 2500, currency: "usd", payment_intent_id: "pi_2", paid_at: "2026-06-30T10:00:00.000Z", refunded_at: "2026-07-03T10:00:00.000Z", created_at: "2026-06-30T10:00:00.000Z", attended_at: null, invited_by: null, invite_email: null, checkout_session_id: "cs_2", held_until: null, cancelled_at: null, refund_reason: null, platform_fee_cents: 250 },
  ]
  const profiles = [
    { id: BUYER, display_name: "Ann Petrescu", username: "ann", avatar_url: null, email: "ann@example.com" },
    { id: GUEST, display_name: "Dan Ionescu", username: "dan", avatar_url: null, email: "dan@example.com" },
    { id: UID(12), display_name: "Mara Vlad", username: "mara", avatar_url: null, email: "mara@example.com" },
    { id: OWNER, display_name: "The owner", username: "owner", avatar_url: null, email: "owner@example.com" },
  ]

  /* ── The Tickets card's rules ────────────────────────────────────────── */
  console.log("\nthe Tickets card")
  const free = checkEventTickets(draft({ priceMode: "free", price: "25", refundWindow: "24", refundPolicy: "No refunds" }), startedAt)
  check("Free clears the price, the sales time, the window and the policy", free.ok && Object.values(free.value).every((v) => v === null))
  const paid = checkEventTickets(draft({ priceMode: "paid", price: "25" }), startedAt)
  check("Paid keeps the price in cents and nothing else by itself", paid.ok && paid.value.priceCents === 2500 && paid.value.salesCloseAt === null && paid.value.refundWindowHours === null && paid.value.refundPolicy === null)
  const cents = checkEventTickets(draft({ priceMode: "paid", price: "25.50" }), startedAt)
  check("a price with cents is read exactly", cents.ok && cents.value.priceCents === 2550)
  const tooLittle = checkEventTickets(draft({ priceMode: "paid", price: "0.40" }), startedAt)
  check(`under ${EVENT_PRICE_MIN_CENTS} cents is refused under the price field`, !tooLittle.ok && fieldOf(tooLittle) === "price" && /0.50/.test(errorOf(tooLittle) ?? ""))
  const noPrice = checkEventTickets(draft({ priceMode: "paid", price: "" }), startedAt)
  check("Paid with nothing typed is refused, never saved as free", !noPrice.ok && fieldOf(noPrice) === "price")
  const junk = checkEventTickets(draft({ priceMode: "paid", price: "twenty" }), startedAt)
  check("a price that is not a number is refused", !junk.ok && fieldOf(junk) === "price")
  const huge = checkEventTickets(draft({ priceMode: "paid", price: "1000000" }), startedAt)
  check("a typing slip of a million is refused", !huge.ok && fieldOf(huge) === "price")
  const close = checkEventTickets(draft({ priceMode: "paid", price: "25", salesCloseDate: "2026-07-14", salesCloseTime: "20:00" }), startedAt)
  check("sales close is read in the event's own zone", close.ok && close.value.salesCloseAt === "2026-07-14T17:00:00.000Z")
  const late = checkEventTickets(draft({ priceMode: "paid", price: "25", salesCloseDate: "2026-07-16", salesCloseTime: "20:00" }), startedAt)
  check("sales closing after it starts is refused", !late.ok && fieldOf(late) === "salesClose")
  const half = checkEventTickets(draft({ priceMode: "paid", price: "25", salesCloseDate: "2026-07-14" }), startedAt)
  check("a date with no time is refused", !half.ok && fieldOf(half) === "salesClose")
  const window24 = checkEventTickets(draft({ priceMode: "paid", price: "25", refundWindow: "24" }), startedAt)
  check("a refund window of whole hours is kept", window24.ok && window24.value.refundWindowHours === 24)
  const window0 = checkEventTickets(draft({ priceMode: "paid", price: "25", refundWindow: "0" }), startedAt)
  check("zero hours means up to the start, which is not the same as none", window0.ok && window0.value.refundWindowHours === 0)
  const windowBad = checkEventTickets(draft({ priceMode: "paid", price: "25", refundWindow: "9999" }), startedAt)
  check(`over ${EVENT_REFUND_WINDOW_MAX_HOURS} hours is refused under its own field`, !windowBad.ok && fieldOf(windowBad) === "refundWindow")
  const policy = checkEventTickets(draft({ priceMode: "paid", price: "25", refundPolicy: `  Ask us.\n\n\n\nWe are kind.  ${"x".repeat(2100)}` }), startedAt)
  check("the policy is tidied and cut at 2,000 characters", policy.ok && (policy.value.refundPolicy ?? "").length === 2000 && (policy.value.refundPolicy ?? "").startsWith("Ask us.\n\nWe are kind."))
  const blank = checkEventTickets(draft({ priceMode: "paid", price: "25", refundPolicy: "   " }), startedAt)
  check("an empty policy is null, so the community's words are used", blank.ok && blank.value.refundPolicy === null)
  check("the refund window in words", refundWindowWords(null) === null && refundWindowWords(0) === "until it starts" && refundWindowWords(1) === "until an hour before it starts" && refundWindowWords(24) === "until 24 hours before it starts" && refundWindowWords(72) === "until 3 days before it starts")
  check("a price reads plainly", eventPriceLabel(2500, "usd") === "$25" && eventPriceLabel(2550, "usd") === "$25.50" && seatsLeftLabel(10, 9) === "1 seat left" && seatsLeftLabel(10, 10) === "Sold out" && seatsLeftLabel(null, 4) === null)

  /* ── The tickets permission ──────────────────────────────────────────── */
  console.log("\nthe tickets permission")
  const group = PERMISSION_GROUPS.find((g) => g.key === "tickets")
  check("the tickets group holds both actions", Boolean(group) && (group?.actions as readonly string[]).slice().sort().join() === "price_events,refund_tickets")
  check("on for admins and moderators with nothing chosen", DEFAULT_ROLE_PERMISSIONS.admin.tickets === true && DEFAULT_ROLE_PERMISSIONS.moderator.tickets === true && can("admin", "price_events") && can("moderator", "refund_tickets"))
  check("never an owner only action, and the owner always has both", !OWNER_ONLY_ACTIONS.includes("price_events") && !OWNER_ONLY_ACTIONS.includes("refund_tickets") && can("owner", "price_events") && can("owner", "refund_tickets"))
  const ticketsOff = parseRolePermissions({ moderator: { tickets: false } })
  check("the owner can switch it off for moderators and keep the rest", !can("moderator", "price_events", ticketsOff) && !can("moderator", "refund_tickets", ticketsOff) && can("moderator", "moderate_content", ticketsOff) && can("admin", "price_events", ticketsOff))
  check("a member never prices or refunds", !can("member", "price_events") && !can("member", "refund_tickets") && !allowedActions("member").price_events)
  check("every key is still grouped once", PERMISSION_KEYS.filter((k) => k === "tickets").length === 1)

  /* ── The routes' own gates ──────────────────────────────────────────── */
  console.log("\nthe routes")
  const eventsRoute = code("app/api/app/community/[id]/events/route.ts")
  const eventRoute = code("app/api/app/community/[id]/events/[eventId]/route.ts")
  const ticketsRoute = code("app/api/app/community/[id]/events/[eventId]/tickets/route.ts")
  for (const [name, src] of [
    ["events", eventsRoute],
    ["one event", eventRoute],
    ["tickets", ticketsRoute],
  ] as const) {
    check(`the ${name} route: the switch first, then the gate`, /requireCommunitiesOn\(\)[\s\S]*requireCreatorCommunity\(/.test(src))
    check(`the ${name} route: every can() is given the community's choices`, !/can\(gate\.role, "[a-z_]+"\)/.test(src) && (!/can\(/.test(src) || /can\(gate\.role, "[a-z_]+", gate\.viewer\.perms\)/.test(src)))
  }
  check("pricing is asked before the event is written", /can\(gate\.role, "price_events", gate\.viewer\.perms\)[\s\S]*createEvent\(/.test(eventsRoute) && /can\(gate\.role, "price_events", gate\.viewer\.perms\)[\s\S]*updateEvent\(/.test(eventRoute))
  check("refunding everybody is asked before the event is cancelled", /can\(gate\.role, "refund_tickets", gate\.viewer\.perms\)[\s\S]*refundEveryTicketFor\(/.test(eventRoute))
  check("a refund is asked before a ticket is touched", /can\(gate\.role, "refund_tickets", gate\.viewer\.perms\)[\s\S]*refundOneTicket\(/.test(ticketsRoute))
  check("every write route is rate limited", [eventsRoute, eventRoute, ticketsRoute].every((src) => /manageLimit\(gate\.ctx\.userId\)/.test(src)))
  check("the tickets route never hands an email to somebody who may not see one", /can\(gate\.role, "manage_members", gate\.viewer\.perms\)/.test(ticketsRoute) && /withEmail/.test(ticketsRoute))

  /* ── A moderator with the group off is refused, not only hidden ──────── */
  console.log("\na moderator with tickets switched off")
  const db1 = ticketDb({ tickets: tickets().slice(0, 1), profiles })
  const priced = checkEventTickets(draft({ priceMode: "paid", price: "25" }), startedAt)
  const money25 = priced.ok ? priced.value : null
  const pricingOff = priceChangeRefusal({ role: "moderator", perms: ticketsOff, tickets: money25 })
  check("setting a price is refused (403) under the price field", Boolean(pricingOff) && status(pricingOff) === 403 && errorOf(pricingOff) === "not_allowed" && fieldOf(pricingOff) === "price")
  check("and the same answer when the event already has one", status(priceChangeRefusal({ role: "moderator", perms: ticketsOff, tickets: money25, event: { price_cents: 2500, tickets_sold: 1 } })) === 403)
  check("with the group on, a moderator may price it", priceChangeRefusal({ role: "moderator", perms: null, tickets: money25 }) === null && priceChangeRefusal({ role: "admin", perms: null, tickets: money25 }) === null)
  check("the owner is never narrowed", priceChangeRefusal({ role: "owner", perms: ticketsOff, tickets: money25 }) === null)
  check("an edit that says nothing about money is never refused", priceChangeRefusal({ role: "moderator", perms: ticketsOff, tickets: null }) === null)
  const refundOff = await refundOneTicket(db1, { community, role: "moderator", perms: ticketsOff, eventId: EID, ticketId: UID(50), actorId: MOD })
  check("refunding one ticket is refused (403), and the ticket is untouched", !refundOff.ok && status(refundOff) === 403 && errorOf(refundOff) === "not_allowed" && db1.tables.community_event_tickets[0].status === "paid")
  const everyOff = await refundEveryTicketFor(db1, { community, role: "moderator", perms: ticketsOff, eventId: EID, actorId: MOD })
  check("refunding everybody is refused (403)", !everyOff.ok && status(everyOff) === 403 && db1.tables.community_event_tickets[0].status === "paid")
  const inviteOff = await searchMembersToInvite(db1, { communityId: CID, eventId: EID, q: "ann", withEmail: true, role: "moderator", perms: ticketsOff })
  check("the invite picker finds nobody for them", inviteOff.length === 0)
  const attendedOff = await markTicketAttended(db1, { community, role: "admin", perms: parseRolePermissions({ admin: { events: false } }), eventId: EID, ticketId: UID(50), came: true })
  check("and without the calendar group nobody marks somebody as having come", !attendedOff.ok && status(attendedOff) === 403 && db1.tables.community_event_tickets[0].attended_at === null)
  const creatorSrc = code("lib/communities/server/creator.ts")
  check("scheduling and editing an event both ask priceChangeRefusal before they write", (creatorSrc.match(/priceChangeRefusal\(/g) ?? []).length === 2 && /priceChangeRefusal\([\s\S]*?\.insert\(/.test(creatorSrc) && /priceChangeRefusal\([\s\S]*?\.update\(patch\)/.test(creatorSrc))

  /* ── Writing a price, and taking it off ─────────────────────────────── */
  console.log("\nwriting a price")
  resetTicketsReady()
  const db2 = ticketDb()
  const columns = await eventPriceColumns(db2, { priceCents: 2500, salesCloseAt: "2026-07-14T17:00:00.000Z", refundWindowHours: 24, refundPolicy: "Ask us." }, "ron")
  check("Paid writes the price, the sales time, the window and the policy", columns.price_cents === 2500 && columns.sales_close_at === "2026-07-14T17:00:00.000Z" && columns.refund_window_hours === 24 && columns.refund_policy === "Ask us.")
  /* Changed on purpose (the owner: a community's prices are Storelib's currency,
     never a store's). The card still gets its currency from the server and the
     write still uses exactly that one; what the server answers is now
     STORELIB_CHARGE_CURRENCY rather than the deployment's charge currency, so a
     creator moving their store to lei does not move a ticket's price.
     tests/surface-currency.test.ts holds the whole boundary. */
  check("and the currency is the one the card was told, never one a page sent", columns.currency === "ron" && /currency: STORELIB_CHARGE_CURRENCY,/.test(code("lib/communities/server/event-ticket-setup.ts")) && /checkoutReadyForCreator\(/.test(code("lib/communities/server/event-ticket-setup.ts")))
  const cleared = await eventPriceColumns(db2, { priceCents: null, salesCloseAt: "2026-07-14T17:00:00.000Z", refundWindowHours: 24, refundPolicy: "Ask us." }, "ron")
  check("Free clears every money column, leaving nothing behind", Object.keys(cleared).length === 5 && Object.values(cleared).every((v) => v === null))
  check("an edit that says nothing about money writes no money column", Object.keys(await eventPriceColumns(db2, null, "ron")).length === 0)
  const sold3 = priceChangeRefusal({ role: "owner", tickets: { priceCents: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null }, event: { price_cents: 2500, tickets_sold: 3 } })
  check("a price is not taken off under three people holding tickets", Boolean(sold3) && status(sold3) === 409 && /3 people hold tickets/.test(errorOf(sold3) ?? "") && fieldOf(sold3) === "price")
  check("but the price itself may be changed while they hold them", priceChangeRefusal({ role: "owner", tickets: { priceCents: 3000, salesCloseAt: null, refundWindowHours: null, refundPolicy: null }, event: { price_cents: 2500, tickets_sold: 3 } }) === null)
  check("the community's own policy is the card's fallback", (await eventTicketBasics(db2, CID)).communityPolicy === "Ask us up to a week before.")

  /* ── The Tickets panel ──────────────────────────────────────────────── */
  console.log("\nthe Tickets panel")
  resetTicketsReady()
  const db4 = ticketDb({ tickets: tickets(), profiles, members: [{ id: "m1", community_id: CID, user_id: BUYER, status: "active", role: "member", source: "free", tier_id: null }] })
  const panel = await loadEventTicketPanel(db4, { communityId: CID, eventId: EID, withEmail: true })
  const p = panel.ok ? panel.panel : null
  check("the money is a sum of rows: one sold, one free, one refunded", Boolean(p) && p?.money.sold === 1 && p?.money.invited === 1 && p?.money.grossCents === 2500 && p?.money.refundedCents === 2500)
  check("seats left comes off the capacity and the tickets sold", p?.capacity === 10 && p?.ticketsSold === 2 && p?.seatsLeft === 8)
  check("every holder is there, with how each got in", (p?.rows ?? []).length === 3 && p?.rows.find((r) => r.name === "Dan Ionescu")?.source === "invite" && p?.rows.find((r) => r.name === "Dan Ionescu")?.invitedByName === "The owner" && p?.rows.find((r) => r.name === "Ann Petrescu")?.amountCents === 2500)
  check("and the page is asked for newest first, 25 at a time", TICKET_HOLDERS_PAGE === 25 && /created_at", \{ ascending: false \}/.test(code("lib/communities/server/event-tickets.ts")))
  const hidden = await loadEventTicketPanel(db4, { communityId: CID, eventId: EID, withEmail: false })
  check("without manage_members no email is in the answer", hidden.ok && hidden.panel.rows.every((r) => r.email === null) && (p?.rows ?? []).some((r) => r.email === "ann@example.com"))
  const found = await loadEventTicketPanel(db4, { communityId: CID, eventId: EID, withEmail: true, q: "ann" })
  check("a search by name reads only the matching people's tickets", found.ok && found.panel.rows.length === 1 && found.panel.rows[0].name === "Ann Petrescu")
  const byEmail = await loadEventTicketPanel(db4, { communityId: CID, eventId: EID, withEmail: true, q: "dan@example.com" })
  check("and by email for whoever may see emails", byEmail.ok && byEmail.panel.rows.length === 1 && byEmail.panel.rows[0].name === "Dan Ionescu")
  const elsewhere = await loadEventTicketPanel(db4, { communityId: "7f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a", eventId: EID, withEmail: true })
  check("an event of another community is not found", !elsewhere.ok && status(elsewhere) === 404)
  const attended = await markTicketAttended(db4, { community, role: "admin", perms: null, eventId: EID, ticketId: UID(50), came: true })
  check("Mark attended writes the time on that ticket", attended.ok && typeof db4.tables.community_event_tickets[0].attended_at === "string")
  const strayTicket = await markTicketAttended(db4, { community, role: "owner", eventId: "3a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", ticketId: UID(50), came: true })
  check("a ticket of another event is refused", !strayTicket.ok && status(strayTicket) === 404)
  const pick = await searchMembersToInvite(db4, { communityId: CID, eventId: EID, q: "ann", withEmail: true, role: "owner" })
  check("the invite picker says who already holds a ticket instead of hiding them", pick.length === 1 && pick[0].name === "Ann Petrescu" && pick[0].hasTicket === true && pick[0].email === "ann@example.com")
  const pickQuiet = await searchMembersToInvite(db4, { communityId: CID, eventId: EID, q: "ann", withEmail: false, role: "owner" })
  check("and hands over no email to somebody who may not see one", pickQuiet.length === 1 && pickQuiet[0].email === null)

  /* ── Refunds ─────────────────────────────────────────────────────────── */
  console.log("\nrefunds")
  resetTicketsReady()
  const db5 = ticketDb({ tickets: tickets(), profiles })
  const stub = refundStub()
  const gone = await refundOneTicket(db5, { community, role: "owner", eventId: EID, ticketId: UID(50), actorId: OWNER, reason: "They asked" }, stub.deps)
  check("one ticket: Stripe first with reverse_transfer, then the seat", gone.ok && stub.calls.length === 1 && stub.calls[0].intent === "pi_1" && db5.tables.community_event_tickets[0].status === "refunded")
  check("and the answer says what went back, to whom", gone.ok && (gone as { refundedCents: number }).refundedCents === 2500 && (gone as { userId: string }).userId === BUYER)
  const again = await refundOneTicket(db5, { community, role: "owner", eventId: EID, ticketId: UID(50), actorId: OWNER }, stub.deps)
  check("asking twice refunds once", !again.ok && stub.calls.length === 1)
  const freeSeat = await refundOneTicket(db5, { community, role: "owner", eventId: EID, ticketId: UID(51), actorId: OWNER }, stub.deps)
  check("a free ticket gives the seat back and asks Stripe for nothing", freeSeat.ok && stub.calls.length === 1 && db5.tables.community_event_tickets[1].status === "refunded")

  resetTicketsReady()
  const db6 = ticketDb({ tickets: tickets(), profiles })
  const stub2 = refundStub()
  const everybody = await refundEveryTicketFor(db6, { community, role: "owner", eventId: EID, actorId: OWNER }, stub2.deps)
  check("a cancelled event gives everybody their money back and says how many went", everybody.ok && (everybody as { refunded: number }).refunded === 2 && (everybody as { refundedCents: number }).refundedCents === 2500)
  check("and every ticket on it is refunded", db6.tables.community_event_tickets.every((t: Record<string, unknown>) => t.status === "refunded"))
  check("the route refunds first and only then calls the event off", /refundEveryTicketFor\([\s\S]*setEventCancelled\(/.test(eventRoute) && !/setEventCancelled\([\s\S]*refundEveryTicketFor\(/.test(eventRoute))
  const strayEvent = await refundEveryTicketFor(db6, { community, role: "owner", eventId: "3a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", actorId: OWNER }, stub2.deps)
  check("an event of another community refunds nothing", !strayEvent.ok && status(strayEvent) === 404)

  /* ── The list's money line, and the figures ──────────────────────────── */
  console.log("\nthe money on the screen")
  resetTicketsReady()
  const db8 = ticketDb({ tickets: tickets(), profiles })
  const events = db8.tables.community_events as { id: string; price_cents: number | null; tickets_sold: number; currency: string | null }[]
  const perEvent = await eventsTicketMoney(db8, CID, events as never)
  const line = perEvent.get(EID)
  check("each event in the list carries what it really took", Boolean(line) && line?.sold === 1 && line?.grossCents === 2500 && line?.invited === 1 && line?.refundedCents === 2500)
  const reads = db8.log.filter((l) => l.table === "community_event_tickets" && l.op === "select").length
  check("the whole list's money is one read, not one per event", reads === 1, `${reads} reads`)
  const freeOnly = await eventsTicketMoney(db8, CID, [{ id: "4a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", price_cents: null, tickets_sold: 0 }] as never)
  check("an event that was never priced says nothing about money", freeOnly.size === 0)
  check("the card is told the update has run", (await eventTicketBasics(db8, CID)).ready === true)
  check("a priced event that is still scheduled is counted for the honest line", (await pricedEventCount(db8, CID)) === 1)

  resetTicketsReady()
  const money = await loadEventMoney(db8, CID, "2026-06-01T00:00:00.000Z")
  check("the analytics figures: sold, gross, refunded, net", money?.sold === 2 && money?.grossCents === 5000 && money?.refundedCents === 2500 && money?.netCents === 2500 && money?.invited === 1)
  const quiet = await loadEventMoney(db8, CID, "2027-01-01T00:00:00.000Z")
  check("a period with nothing in it says nothing at all", quiet === null)

  /* ── Without run-now part 105 ────────────────────────────────────────── */
  console.log("\nbefore part 105 has run")
  resetTicketsReady()
  const old = fakeDb(
    {
      communities: [{ id: CID, name: "Makers", slug: "makers", creator_id: UID(90), refund_policy: null }],
      community_events: [{ id: EID, community_id: CID, title: "Free call", starts_at: START, ends_at: null, timezone: "Europe/Bucharest", status: "scheduled", capacity: null, going_count: 4, access: {}, kind: "online", description: null, cover_url: null, location: null, meeting_url: null, livestream_url: null, replay_video_id: null }],
      community_audit_log: [],
    },
    { failWith: { community_event_tickets: { code: "42P01", message: 'relation "public.community_event_tickets" does not exist' } } },
  )
  check("an event read asks only for the columns that are there", (await eventReadColumns(old)) === EVENT_COLUMNS && !(await eventReadColumns(old)).includes("price_cents"))
  resetTicketsReady()
  const oldSetup = await eventTicketBasics(old, CID)
  check("the card is told the update has not run", oldSetup.ready === false && oldSetup.communityPolicy === null)
  resetTicketsReady()
  check("a price sent early is not written anywhere", Object.keys(await eventPriceColumns(old, { priceCents: 2500, salesCloseAt: null, refundWindowHours: null, refundPolicy: null }, "usd")).length === 0)
  resetTicketsReady()
  check("nothing is counted and no event is called priced", (await eventsTicketMoney(old, CID, [{ id: EID, price_cents: 2500, tickets_sold: 0 }] as never)).size === 1 && (await pricedEventCount(old, CID)) === 0)
  resetTicketsReady()
  const oldPanel = await loadEventTicketPanel(old, { communityId: CID, eventId: EID, withEmail: true })
  check("the panel opens empty and says the update is needed", oldPanel.ok && oldPanel.panel.ready === false && oldPanel.panel.rows.length === 0)
  resetTicketsReady()
  check("and the analytics figures are absent, never zero", (await loadEventMoney(old, CID, "2026-01-01T00:00:00.000Z")) === null)
  resetTicketsReady()

  /* ── Honest about a price nobody can pay ─────────────────────────────── */
  console.log("\nhonest")
  const facts: NextStepFacts = { published: true, paid: false, paymentsReady: false, members: 40, invites: 3, posts: 5, courses: 1, events: 2, customized: true, rules: 2, classroomEnabled: true, eventsEnabled: true, pricedEventsUnsellable: 2 }
  const steps = nextSteps(facts, "/app/community/x")
  const step = steps.find((s) => s.id === "event_payouts")
  check("a priced event with payouts off adds one step that names the number", Boolean(step) && /2 events have a price/.test(step?.detail ?? "") && step?.href === "/app/settings?tab=payments")
  check("with payouts connected it is gone", !nextSteps({ ...facts, paymentsReady: true }, "/x").some((s) => s.id === "event_payouts"))
  check("with no priced event it is gone", !nextSteps({ ...facts, pricedEventsUnsellable: 0 }, "/x").some((s) => s.id === "event_payouts"))
  check("and an older answer with nothing about it is fine", !nextSteps({ ...facts, pricedEventsUnsellable: undefined }, "/x").some((s) => s.id === "event_payouts"))
  check("the overview says it once: only when the checklist did not", /pricedEventsUnsellable \?\? 0\) > 0 && !data\.steps\.some/.test(code("components/community/creator/overview.tsx")))

  /* ── The screens ────────────────────────────────────────────────────── */
  console.log("\nthe screens")
  const section = read("components/community/creator/events-section.tsx")
  const panelFile = read("components/community/creator/event-tickets.tsx")
  check("the Tickets card is only drawn for somebody who may price events", /head\.can\.price_events === true/.test(section) && /\{mayPrice \?/.test(section))
  check("without the update the card is one quiet staff line", /data-tickets-missing/.test(section) && /run-now part 105/.test(section))
  check("without payouts the Paid choice is off and says where to fix it", /paidOff/.test(section) && /\/app\/settings\?tab=payments/.test(section) && /data-payouts-off/.test(section))
  check("the community's policy is shown as the fallback", /tickets\.communityPolicy/.test(section))
  check("cancelling asks about the money, with the total", /data-cancel-refund/.test(section) && /Refund everybody/.test(section) && /grossCents/.test(section))
  check("validation is inline, never an alert", !/alert\(/.test(section) && !/alert\(/.test(panelFile) && /aria-invalid/.test(section))
  check("Refund is only drawn with refund_tickets, and Came only on a paid ticket", /head\.can\.refund_tickets === true/.test(panelFile) && /mayRefund && t\.status === "paid"/.test(panelFile))
  check("the panel pages rather than loading everybody", /data-tickets-more/.test(panelFile) && /cursor/.test(panelFile))
  for (const f of ["components/community/creator/events-section.tsx", "components/community/creator/event-tickets.tsx"]) {
    const src = read(f)
    check(`${f}: no server code in a client screen`, /"use client"/.test(src) && !/next\/headers|lib\/communities\/server|server-only/.test(src))
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nthe copy")
  const BANNED = /\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)\b/i
  for (const f of [
    "components/community/creator/events-section.tsx",
    "components/community/creator/event-tickets.tsx",
    "components/community/creator/logic.ts",
    "components/community/creator/view-types.ts",
    "components/community/creator/analytics-section.tsx",
    "components/community/creator/overview.tsx",
    "lib/communities/server/creator.ts",
    "lib/communities/server/stats.ts",
    "app/api/app/community/[id]/events/route.ts",
    "app/api/app/community/[id]/events/[eventId]/route.ts",
    "app/api/app/community/[id]/events/[eventId]/tickets/route.ts",
    "lib/communities/server/event-admin.ts",
    "lib/communities/server/event-ticket-setup.ts",
    "lib/communities/search.ts",
  ]) {
    const src = read(f)
    check(`${f}: no em dash, none of the banned words`, !src.includes("—") && !BANNED.test(src))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

void main()
