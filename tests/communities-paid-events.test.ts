/**
 * ===========================================================================
 *  COMMUNITIES: PAID EVENTS (round 14, the engine)
 * ===========================================================================
 * An event can carry a price, and then its details are only for people
 * holding a ticket. Held from the rules outward, and against an in memory
 * database that stands in for run-now part 105's five functions, so the
 * money paths run end to end here:
 *
 *   RULES      eventPriceMode, eventPriceLabel, salesOpen,
 *              refundWindowOpen, ticketGate in every branch, seatsLeftLabel.
 *   PARAMS     what Stripe is asked for: embedded, never redirecting, the
 *              price from the event's row, the creator's account as the
 *              destination, the platform's fee kept back, and metadata that
 *              the product checkout's fulfilment can never mistake for a
 *              sale of a product.
 *   CHECKOUT   every refusal; the seat held BEFORE Stripe is asked; the
 *              real session id onto the hold; a Stripe failure giving the
 *              seat straight back.
 *   ONE SEAT   two seats, three buyers: the third is refused.
 *   ONE TICKET the webhook and the sheet both pay: granted once.
 *   REFUNDS    reverse_transfer, the seat back, community_refunds written,
 *              the holder's own refund inside the window and refused
 *              outside it, a second refund changing nothing, and a whole
 *              event refunded a page at a time past one failure.
 *   STAFF      price_events and refund_tickets: the owner always, admins and
 *              moderators by default, nobody once the owner switches the
 *              tickets group off, never a member.
 *   DEGRADE    with part 105 not run: every event free, no ticket anywhere,
 *              nothing thrown.
 *   WIRING     the webhook branch, the holds sweep in the community cron,
 *              the three routes' switch, member check and rate limit, and
 *              no server import in the browser safe module.
 *   COPY       no em dash and no banned word in this work.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { memDb, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import {
  MIN_EVENT_PRICE_CENTS,
  eventPriceLabel,
  eventPriceMode,
  refundWindowOpen,
  salesOpen,
  seatsLeftLabel,
  ticketGate,
  type EventPricing,
  type TicketView,
} from "@/lib/communities/event-tickets"
import {
  eventTicketMoney,
  eventTickets,
  grantTicket,
  markAttended,
  readPricedEvent,
  refundPolicyFor,
  releaseDeadHolds,
  resetTicketsReady,
  ticketOf,
  ticketsOf,
  ticketsReady,
} from "@/lib/communities/server/event-tickets"
import { EVENT_HOLD_MINUTES, eventCheckoutParams, grantFromSession, isEventSession, revokeRefundedTicket, startEventCheckout, type CheckoutDeps } from "@/lib/communities/server/event-checkout"
import { refundEveryTicket, refundTicket, type TicketRefundDeps } from "@/lib/communities/server/event-refunds"
import { DEFAULT_ROLE_PERMISSIONS, OWNER_ONLY_ACTIONS, PERMISSION_GROUPS, can, parseRolePermissions } from "@/lib/communities/permissions"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow } from "@/lib/communities/types"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const HOUR = 3_600_000
const DAY = 24 * HOUR
/* The server modules read the real clock, so the fixtures sit around it rather than at a fixed date. */
const NOW = Date.now()
const iso = (t: number) => new Date(t).toISOString()

const CID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const EID = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d"
const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const OWNER = UID(1)
const BUYER = UID(2)
const SECOND = UID(3)
const THIRD = UID(4)
const CREATOR = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"

const community = {
  id: CID,
  slug: "makers",
  name: "Makers",
  status: "published",
  access: "free",
  creator_id: CREATOR,
  events_enabled: true,
  classroom_enabled: true,
} as unknown as CommunityRow

const pricing = (over: Partial<EventPricing> = {}): EventPricing => ({ priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: 24, refundPolicy: null, ...over })

const eventRow = (over: Record<string, unknown> = {}) => ({
  id: EID,
  community_id: CID,
  title: "Paid workshop",
  description: "<p>A long afternoon of building.</p>",
  cover_url: "https://cdn.storelib.com/cover.jpg",
  kind: "online",
  starts_at: iso(NOW + 7 * DAY),
  ends_at: iso(NOW + 7 * DAY + 2 * HOUR),
  timezone: "Europe/Bucharest",
  location: null,
  meeting_url: "https://meet.example.com/x",
  livestream_url: null,
  capacity: null,
  going_count: 0,
  access: {},
  host_id: OWNER,
  replay_video_id: null,
  status: "scheduled",
  reminder_24h_at: null,
  reminder_1h_at: null,
  created_by: OWNER,
  created_at: iso(NOW - 30 * DAY),
  updated_at: iso(NOW - 30 * DAY),
  price_cents: 2500,
  currency: "usd",
  sales_close_at: null,
  refund_window_hours: 24,
  refund_policy: null,
  tickets_sold: 0,
  ...over,
})

function viewerOf(userId: string | null, over: Partial<Viewer> = {}): Viewer {
  return {
    userId,
    member: null,
    role: userId ? "member" : null,
    active: Boolean(userId),
    status: userId ? "active" : null,
    tierId: null,
    ownedProductIds: [],
    level: 1,
    points: 0,
    isOwner: false,
    isCreatorAccount: false,
    banned: false,
    mutedUntil: null,
    perms: null,
    ...over,
  } as unknown as Viewer
}

/* ───────────────────────────────────────────────────────────────────────────
   RUN-NOW PART 105'S FIVE FUNCTIONS, IN MEMORY
   The SQL itself is proven against Postgres 16; these stand in for it so the
   TypeScript around the money runs for real in this suite.
   ─────────────────────────────────────────────────────────────────────────── */

type Row = Record<string, any>

function seatsTaken(db: MemDb, eventId: string, except: string | null, now: number): number {
  return ((db.tables.community_event_tickets ??= []) as Row[]).filter(
    (t) => t.event_id === eventId && (!except || t.user_id !== except) && (t.status === "paid" || (t.status === "held" && t.held_until && Date.parse(t.held_until) > now)),
  ).length
}

function recount(db: MemDb, eventId: string): void {
  const e = ((db.tables.community_events ??= []) as Row[]).find((r) => r.id === eventId)
  if (e) e.tickets_sold = ((db.tables.community_event_tickets ??= []) as Row[]).filter((t) => t.event_id === eventId && t.status === "paid").length
}

function rsvp(db: MemDb, eventId: string, userId: string, status: string): void {
  const rows = (db.tables.community_event_rsvps ??= []) as Row[]
  const have = rows.find((r) => r.event_id === eventId && r.user_id === userId)
  if (have) have.status = status
  else rows.push({ event_id: eventId, user_id: userId, community_id: CID, status })
}

function part105(clock: { now: number }) {
  let serial = 0
  const ticketId = () => `20000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`
  const tickets = (db: MemDb) => (db.tables.community_event_tickets ??= []) as Row[]
  const events = (db: MemDb) => (db.tables.community_events ??= []) as Row[]
  return {
    community_event_ticket_hold(a: Row, db: MemDb) {
      const e = events(db).find((r) => r.id === a.p_event)
      if (!e) return { data: { ok: false, reason: "not_found" }, error: null }
      if (e.status !== "scheduled") return { data: { ok: false, reason: "closed" }, error: null }
      if (!(e.price_cents > 0)) return { data: { ok: false, reason: "free" }, error: null }
      if (Date.parse(e.sales_close_at ?? e.starts_at) <= clock.now) return { data: { ok: false, reason: "sales_closed" }, error: null }
      const mine = tickets(db).find((t) => t.event_id === a.p_event && t.user_id === a.p_user)
      if (mine?.status === "paid") return { data: { ok: false, reason: "already_paid", ticket_id: mine.id }, error: null }
      const taken = seatsTaken(db, a.p_event, a.p_user, clock.now)
      if (e.capacity !== null && taken >= e.capacity) return { data: { ok: false, reason: "full", seats_left: 0 }, error: null }
      const heldUntil = iso(clock.now + Math.max(5, Math.min(180, a.p_minutes ?? 30)) * 60_000)
      const row = mine ?? { id: ticketId(), event_id: a.p_event, community_id: e.community_id, user_id: a.p_user, created_at: iso(clock.now), attended_at: null, invited_by: null, invite_email: null, payment_intent_id: null, platform_fee_cents: null, paid_at: null }
      Object.assign(row, { status: "held", source: "purchase", checkout_session_id: a.p_session, amount_cents: e.price_cents, currency: e.currency ?? "usd", held_until: heldUntil, cancelled_at: null, refunded_at: null, refund_reason: null })
      if (!mine) tickets(db).push(row)
      return { data: { ok: true, ticket_id: row.id, held_until: heldUntil, amount_cents: row.amount_cents, currency: row.currency, seats_left: e.capacity === null ? null : Math.max(0, e.capacity - taken - 1) }, error: null }
    },
    community_event_ticket_pay(a: Row, db: MemDb) {
      const e = events(db).find((r) => r.id === a.p_event)
      if (!e) return { data: { ok: false, reason: "not_found" }, error: null }
      let row = a.p_session ? tickets(db).find((t) => t.checkout_session_id === a.p_session) : undefined
      if (!row) row = tickets(db).find((t) => t.event_id === a.p_event && t.user_id === a.p_user)
      if (row?.status === "paid") return { data: { ok: true, created: false, ticket_id: row.id, event_id: e.id, user_id: row.user_id }, error: null }
      const fresh = row ?? { id: ticketId(), event_id: a.p_event, community_id: e.community_id, user_id: a.p_user, created_at: iso(clock.now), attended_at: null, invited_by: null, invite_email: null }
      Object.assign(fresh, {
        status: "paid",
        source: "purchase",
        checkout_session_id: a.p_session ?? fresh.checkout_session_id ?? null,
        payment_intent_id: a.p_intent ?? fresh.payment_intent_id ?? null,
        amount_cents: a.p_amount ?? fresh.amount_cents ?? null,
        currency: a.p_currency ?? fresh.currency ?? e.currency ?? "usd",
        platform_fee_cents: a.p_fee ?? fresh.platform_fee_cents ?? null,
        held_until: null,
        cancelled_at: null,
        refunded_at: null,
        refund_reason: null,
        paid_at: fresh.paid_at ?? iso(clock.now),
      })
      if (!row) tickets(db).push(fresh)
      recount(db, a.p_event)
      rsvp(db, a.p_event, a.p_user, "going")
      return { data: { ok: true, created: true, ticket_id: fresh.id, event_id: e.id, user_id: fresh.user_id, amount_cents: fresh.amount_cents, currency: fresh.currency }, error: null }
    },
    community_event_ticket_grant(a: Row, db: MemDb) {
      const e = events(db).find((r) => r.id === a.p_event)
      if (!e) return { data: { ok: false, reason: "not_found" }, error: null }
      const mine = tickets(db).find((t) => t.event_id === a.p_event && t.user_id === a.p_user)
      if (mine?.status === "paid") return { data: { ok: true, created: false, ticket_id: mine.id }, error: null }
      const taken = seatsTaken(db, a.p_event, a.p_user, clock.now)
      if (!a.p_force && e.capacity !== null && taken >= e.capacity) return { data: { ok: false, reason: "full" }, error: null }
      const source = a.p_source === "grant" ? "grant" : "invite"
      const row = mine ?? { id: ticketId(), event_id: a.p_event, community_id: e.community_id, user_id: a.p_user, created_at: iso(clock.now), attended_at: null, payment_intent_id: null, platform_fee_cents: null, checkout_session_id: null }
      Object.assign(row, { status: "paid", source, amount_cents: 0, currency: e.currency ?? "usd", held_until: null, cancelled_at: null, refunded_at: null, refund_reason: null, paid_at: row.paid_at ?? iso(clock.now), invited_by: a.p_by ?? row.invited_by ?? null, invite_email: a.p_email ?? row.invite_email ?? null })
      if (!mine) tickets(db).push(row)
      recount(db, a.p_event)
      rsvp(db, a.p_event, a.p_user, "going")
      return { data: { ok: true, created: true, ticket_id: row.id, source }, error: null }
    },
    community_event_ticket_release(a: Row, db: MemDb) {
      const row = tickets(db).find((t) => t.id === a.p_ticket)
      if (!row) return { data: { ok: false, reason: "not_found" }, error: null }
      const want = a.p_status === "cancelled" ? "cancelled" : "refunded"
      if (row.status === want) return { data: { ok: true, changed: false, event_id: row.event_id, user_id: row.user_id, payment_intent_id: row.payment_intent_id, amount_cents: row.amount_cents }, error: null }
      Object.assign(row, {
        status: want,
        refunded_at: want === "refunded" ? iso(clock.now) : row.refunded_at,
        cancelled_at: want === "cancelled" ? iso(clock.now) : row.cancelled_at,
        refund_reason: a.p_reason ?? row.refund_reason ?? null,
        held_until: null,
      })
      recount(db, row.event_id)
      rsvp(db, row.event_id, row.user_id, "cancelled")
      return { data: { ok: true, changed: true, event_id: row.event_id, user_id: row.user_id, payment_intent_id: row.payment_intent_id, amount_cents: row.amount_cents, next_waiting: null }, error: null }
    },
    community_event_release_holds(_a: Row, db: MemDb) {
      let n = 0
      for (const t of tickets(db)) {
        if (t.status === "held" && t.held_until && Date.parse(t.held_until) <= clock.now) {
          Object.assign(t, { status: "cancelled", cancelled_at: iso(clock.now), held_until: null })
          n += 1
        }
      }
      return { data: n, error: null }
    },
  }
}

function worldWith(events: Row[], extra: Record<string, Row[]> = {}, clock = { now: NOW }): MemDb {
  resetTicketsReady()
  const fns = part105(clock)
  return memDb(
    {
      communities: [{ id: CID, slug: "makers", name: "Makers", refund_policy: "The community gives money back up to a day before." }],
      creators: [{ id: CREATOR, stripe_account_id: "acct_live123" }],
      community_events: events,
      community_event_tickets: [],
      community_event_rsvps: [],
      community_refunds: [],
      community_audit_log: [],
      profiles: [
        { id: BUYER, display_name: "Mara Pop", username: "mara", avatar_url: null, email: "mara@example.com" },
        { id: SECOND, display_name: "Ion Radu", username: "ion", avatar_url: null, email: "ion@example.com" },
        { id: THIRD, display_name: "Ana Dinu", username: "ana", avatar_url: null, email: "ana@example.com" },
        { id: OWNER, display_name: "The Owner", username: "owner", avatar_url: null, email: "owner@example.com" },
      ],
      ...extra,
    },
    {
      unique: { community_event_tickets: [["event_id", "user_id"], ["checkout_session_id"]], community_refunds: [["stripe_refund_id"]] },
      rpc: fns as never,
    },
  ) as MemDb
}

interface SessionMade {
  params: Record<string, any>
}

function stripeStub(made: SessionMade[], over: { fail?: boolean; noSecret?: boolean } = {}) {
  let n = 0
  return {
    checkout: {
      sessions: {
        async create(params: Record<string, any>) {
          if (over.fail) throw new Error("stripe is down")
          made.push({ params })
          n += 1
          return { id: `cs_test_ticket${n}00000000`, client_secret: over.noSecret ? null : `cs_secret_${n}` }
        },
        async retrieve(id: string) {
          return { id } as never
        },
      },
    },
  }
}

function depsWith(stripe: ReturnType<typeof stripeStub>, over: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    stripe: stripe as never,
    ready: async () => true,
    fee: async (cents) => ({ platformFeeCents: Math.round(cents * 0.05) + 30, feePercent: 5, feeFixedCents: 30, planId: "free", pricingTier: "standard", feeRuleVersion: "v1" }),
    chargeCurrency: "usd",
    ...over,
  }
}

const paidSession = (over: Record<string, any> = {}) => ({
  id: "cs_test_ticket100000000",
  payment_status: "paid",
  amount_total: 2500,
  currency: "usd",
  payment_intent: "pi_ticket_1",
  metadata: { kind: "community_event", community_event_id: EID, community_id: CID, community_slug: "makers", buyer_id: BUYER, creator_id: CREATOR, price_cents: "2500", platform_fee_cents: "155" },
  ...over,
})

function refundStub(log: Row[], over: { fail?: boolean; failFor?: string } = {}): TicketRefundDeps {
  let n = 0
  return {
    async createRefund(params, key) {
      if (over.fail || (over.failFor && params.payment_intent === over.failFor)) throw new Error("stripe refused")
      n += 1
      log.push({ ...params, key })
      return { id: `re_${n}`, status: "succeeded", currency: "usd" }
    },
    async afterRefund() {},
  }
}

async function main() {
  /* ── The rules ───────────────────────────────────────────────────────── */
  console.log("\nWhat an event costs")
  check("no price is free, as every event was", eventPriceMode({ priceCents: null }) === "free" && eventPriceMode({ priceCents: 0 }) === "free")
  check("a price makes it paid", eventPriceMode({ priceCents: 2500 }) === "paid")
  check("the smallest price is the one the database allows", MIN_EVENT_PRICE_CENTS === 50)
  check("a round price has no cents", eventPriceLabel(2500, "usd") === "$25")
  check("an uneven one has two", eventPriceLabel(2550, "usd") === "$25.50")
  check("another currency reads as itself", /120/.test(eventPriceLabel(12000, "ron")) && /RON|lei/i.test(eventPriceLabel(12000, "ron")))

  console.log("\nWhen tickets are sold")
  const base = { ...pricing(), startsAt: iso(NOW + 7 * DAY), cancelled: false }
  check("open before the start", salesOpen(base, NOW))
  check("closed after the start", !salesOpen({ ...base, startsAt: iso(NOW - HOUR) }, NOW))
  check("closed at the event's own closing time", !salesOpen({ ...base, salesCloseAt: iso(NOW - HOUR) }, NOW) && salesOpen({ ...base, salesCloseAt: iso(NOW + HOUR) }, NOW))
  check("a cancelled event sells nothing", !salesOpen({ ...base, cancelled: true }, NOW))
  check("a free event sells nothing", !salesOpen({ ...base, priceCents: null }, NOW))

  console.log("\nWhen the holder may still get their money back")
  const paid: TicketView = { id: "t", status: "paid", source: "purchase", amountCents: 2500, currency: "usd", paidAt: iso(NOW - DAY), refundedAt: null, attendedAt: null }
  check("inside the window, yes", refundWindowOpen({ refundWindowHours: 24, startsAt: iso(NOW + 7 * DAY) }, paid, NOW))
  check("past the window, no", !refundWindowOpen({ refundWindowHours: 24, startsAt: iso(NOW + 2 * HOUR) }, paid, NOW))
  check("no window set means no button at all", !refundWindowOpen({ refundWindowHours: null, startsAt: iso(NOW + 7 * DAY) }, paid, NOW))
  check("a window of zero hours runs to the start", refundWindowOpen({ refundWindowHours: 0, startsAt: iso(NOW + HOUR) }, paid, NOW) && !refundWindowOpen({ refundWindowHours: 0, startsAt: iso(NOW - HOUR) }, paid, NOW))
  check("a refunded ticket has no button", !refundWindowOpen({ refundWindowHours: 24, startsAt: iso(NOW + 7 * DAY) }, { ...paid, status: "refunded" }, NOW))
  check("a free seat has no money to come back", !refundWindowOpen({ refundWindowHours: 24, startsAt: iso(NOW + 7 * DAY) }, { ...paid, amountCents: 0 }, NOW))

  console.log("\nWhether the details open")
  const gateFor = (over: Record<string, unknown>, v: { active: boolean; staff: boolean; ticket: TicketView | null }) =>
    ticketGate({ ...pricing(), startsAt: iso(NOW + 7 * DAY), cancelled: false, capacity: null, ticketsSold: 0, ...over }, v, NOW)
  check("a free event opens to every member, exactly as today", gateFor({ priceCents: null }, { active: true, staff: false, ticket: null }).open)
  check("staff see everything, priced or not", gateFor({}, { active: false, staff: true, ticket: null }).open)
  check("somebody who is not a member sees nothing private", (gateFor({}, { active: false, staff: false, ticket: null }) as { reason: string }).reason === "not_member")
  const payGate = gateFor({}, { active: true, staff: false, ticket: null }) as { open: boolean; reason?: string; priceCents?: number; currency?: string | null }
  check("a paid event asks for the price, and names it", !payGate.open && payGate.reason === "pay" && payGate.priceCents === 2500 && payGate.currency === "usd")
  check("a ticket opens it", gateFor({}, { active: true, staff: false, ticket: paid }).open && (gateFor({}, { active: true, staff: false, ticket: paid }) as { via: string }).via === "ticket")
  check("a held ticket does not open it: nothing is paid yet", !gateFor({}, { active: true, staff: false, ticket: { ...paid, status: "held" } }).open)
  check("a refunded ticket says so, it does not ask again", (gateFor({}, { active: true, staff: false, ticket: { ...paid, status: "refunded" } }) as { reason: string }).reason === "refunded")
  check("sold out reads as sold out, not as a price", (gateFor({ capacity: 2, ticketsSold: 2 }, { active: true, staff: false, ticket: null }) as { reason: string }).reason === "sold_out")
  check("closed sales read as closed", (gateFor({ startsAt: iso(NOW - HOUR) }, { active: true, staff: false, ticket: null }) as { reason: string }).reason === "sales_closed")

  console.log("\nSeats left")
  check("no capacity says nothing", seatsLeftLabel(null, 4) === null)
  check("one seat is singular", seatsLeftLabel(5, 4) === "1 seat left")
  check("more than one is plural", seatsLeftLabel(10, 4) === "6 seats left")
  check("none left is Sold out", seatsLeftLabel(4, 4) === "Sold out" && seatsLeftLabel(4, 9) === "Sold out")

  /* ── What Stripe is asked for ────────────────────────────────────────── */
  console.log("\nWhat Stripe is asked for")
  const params = eventCheckoutParams({
    event: eventRow() as never,
    community,
    buyer: { userId: BUYER, email: "mara@example.com" },
    creatorId: CREATOR,
    destination: "acct_live123",
    currency: "usd",
    fee: { platformFeeCents: 155, feePercent: 5, feeFixedCents: 30, planId: "free", pricingTier: "standard", feeRuleVersion: "v1" },
  })
  check("embedded, and it never redirects", params.ui_mode === "embedded" && params.redirect_on_completion === "never" && params.mode === "payment")
  const line = (params.line_items as any[])[0]
  check("one ticket, at the event's own price", line.quantity === 1 && line.price_data.unit_amount === 2500 && line.price_data.currency === "usd")
  check("the creator's account is the destination, and the platform's fee is kept back", (params.payment_intent_data as any).transfer_data.destination === "acct_live123" && (params.payment_intent_data as any).application_fee_amount === 155)
  check("the metadata names the event, the community and the buyer", params.metadata?.kind === "community_event" && params.metadata?.community_event_id === EID && params.metadata?.community_id === CID && params.metadata?.buyer_id === BUYER)
  /* lib/checkout/fulfil-payment builds a real Stripe client when imported, so its rule is read from the source. */
  const fulfil = code("lib/checkout/fulfil-payment.ts")
  check("a product sale is the one with product_id, creator_id and receipt_token", /m\.product_id && m\.creator_id && m\.receipt_token/.test(fulfil))
  const sentMeta = { ...(params.metadata as Record<string, string>), ...((params.payment_intent_data as any).metadata as Record<string, string>) }
  check("nothing in the metadata looks like a product sale, so fulfilment never takes it for one", !sentMeta.product_id && !sentMeta.receipt_token)
  check("the buyer's own address is used, and their id is the reference", params.customer_email === "mara@example.com" && params.client_reference_id === BUYER)
  check("only an https cover reaches Stripe", Array.isArray(line.price_data.product_data.images) && line.price_data.product_data.images[0] === "https://cdn.storelib.com/cover.jpg")

  /* ── Starting a checkout ─────────────────────────────────────────────── */
  console.log("\nStarting a ticket checkout")
  {
    const db = worldWith([eventRow()])
    const made: SessionMade[] = []
    const started = await startEventCheckout(db, depsWith(stripeStub(made)), { community, viewer: viewerOf(BUYER), eventId: EID, email: "mara@example.com" })
    check("a member gets a form, the price and the session", started.ok === true && started.clientSecret === "cs_secret_1" && started.amountCents === 2500 && started.currency === "usd")
    const held = (db.tables.community_event_tickets as Row[])[0]
    check("the seat was held before Stripe was asked", Boolean(held) && held.status === "held" && Boolean(held.held_until))
    check("and the hold now carries the real Stripe session", held.checkout_session_id === "cs_test_ticket100000000")
    check("the price Stripe was asked for is the event's row, not the page's", (made[0].params.line_items as any[])[0].price_data.unit_amount === 2500)
  }
  {
    const db = worldWith([eventRow()])
    const started = await startEventCheckout(db, depsWith(stripeStub([], { fail: true })), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("Stripe failing refuses with nothing charged", started.ok === false && started.code === "stripe")
    check("and the seat goes straight back", (db.tables.community_event_tickets as Row[])[0]?.status === "cancelled")
  }
  {
    const db = worldWith([eventRow()])
    const started = await startEventCheckout(db, depsWith(stripeStub([], { noSecret: true })), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("no payment form means no held seat either", started.ok === false && started.code === "stripe" && (db.tables.community_event_tickets as Row[])[0]?.status === "cancelled")
  }
  {
    const db = worldWith([eventRow({ price_cents: null, currency: null })])
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("a free event has nothing to sell", started.ok === false && started.code === "free" && (db.tables.community_event_tickets as Row[]).length === 0)
  }
  {
    const db = worldWith([eventRow({ status: "cancelled" })])
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("a cancelled event sells nothing, and says so calmly", started.ok === false && started.code === "cancelled" && started.error === "This event was cancelled.")
  }
  {
    const db = worldWith([eventRow({ starts_at: iso(NOW - HOUR) })])
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("sales that have closed refuse", started.ok === false && started.code === "sales_closed")
  }
  {
    const db = worldWith([eventRow()])
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(null), eventId: EID, email: null })
    check("a visitor is asked to join first", started.ok === false && started.code === "not_member" && started.status === 403)
  }
  {
    const db = worldWith([eventRow()])
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community: { ...community, events_enabled: false }, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("with the calendar switched off there is no such event", started.ok === false && started.code === "not_found" && started.status === 404)
  }
  {
    const db = worldWith([eventRow()])
    const started = await startEventCheckout(db, depsWith(stripeStub([]), { ready: async () => false }), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("a creator who cannot take payments refuses before anything is held", started.ok === false && started.code === "seller_unavailable" && (db.tables.community_event_tickets as Row[]).length === 0)
  }
  {
    const db = worldWith([eventRow({ currency: "ron" })])
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("a price in another currency than Storelib charges in refuses", started.ok === false && started.code === "price_changed")
  }
  {
    const db = worldWith([eventRow()])
    const other = "11111111-1111-4111-8111-111111111111"
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community: { ...community, id: other }, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("an event of another community is not found through this one", started.ok === false && started.code === "not_found")
  }

  /* ── A seat is never sold twice ──────────────────────────────────────── */
  console.log("\nTwo seats, three buyers")
  {
    const db = worldWith([eventRow({ capacity: 2 })])
    const made: SessionMade[] = []
    const deps = depsWith(stripeStub(made))
    const one = await startEventCheckout(db, deps, { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    const two = await startEventCheckout(db, deps, { community, viewer: viewerOf(SECOND), eventId: EID, email: null })
    const three = await startEventCheckout(db, deps, { community, viewer: viewerOf(THIRD), eventId: EID, email: null })
    check("the first two hold a seat each", one.ok === true && two.ok === true)
    check("the third is refused as sold out, and Stripe was never asked", three.ok === false && three.code === "full" && made.length === 2)
    check("only two tickets exist", (db.tables.community_event_tickets as Row[]).length === 2)
  }
  {
    const clock = { now: NOW }
    const db = worldWith([eventRow({ capacity: 1 })], {}, clock)
    const deps = depsWith(stripeStub([]))
    await startEventCheckout(db, deps, { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    const blocked = await startEventCheckout(db, deps, { community, viewer: viewerOf(SECOND), eventId: EID, email: null })
    check("a held seat blocks the next buyer while the hold lasts", blocked.ok === false && blocked.code === "full")
    clock.now = NOW + (EVENT_HOLD_MINUTES + 1) * 60_000
    check("the sweep tidies the hold nobody paid", (await releaseDeadHolds(db)) === 1)
    const after = await startEventCheckout(db, deps, { community, viewer: viewerOf(SECOND), eventId: EID, email: null })
    check("and then the seat is somebody else's to buy", after.ok === true)
    check("the sweep again finds nothing to do", (await releaseDeadHolds(db)) === 0)
  }

  /* ── One payment is exactly one ticket ───────────────────────────────── */
  console.log("\nOne payment, one ticket")
  {
    const db = worldWith([eventRow()])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    const first = await grantFromSession(db, paidSession() as never)
    const second = await grantFromSession(db, paidSession() as never, { userId: BUYER })
    check("the first call grants the ticket", first.ok === true && first.created === true && first.eventId === EID)
    check("the second (the sheet after the webhook, or the other way round) grants nothing new", second.ok === true && second.created === false && second.ticketId === (first as { ticketId: string }).ticketId)
    const rows = (db.tables.community_event_tickets as Row[]).filter((t) => t.event_id === EID)
    check("there is exactly one ticket, paid, on one payment", rows.length === 1 && rows[0].status === "paid" && rows[0].payment_intent_id === "pi_ticket_1" && rows[0].amount_cents === 2500)
    check("the platform's fee from the session is kept on the ticket", rows[0].platform_fee_cents === 155)
    check("the event counts one ticket sold", (db.tables.community_events as Row[])[0].tickets_sold === 1)
    check("and their going answer is written, so the reminders and the attendee list need no change", (db.tables.community_event_rsvps as Row[]).some((r) => r.user_id === BUYER && r.status === "going"))
    const mine = await ticketOf(db, EID, BUYER)
    check("the viewer reads their own ticket", mine?.status === "paid" && mine.amountCents === 2500 && mine.source === "purchase")
    const many = await ticketsOf(db, BUYER, [EID])
    check("a page of events reads the viewer's tickets in one go", many.size === 1 && many.get(EID)?.status === "paid")
  }
  {
    const db = worldWith([eventRow()])
    const notPaid = await grantFromSession(db, paidSession({ payment_status: "unpaid" }) as never)
    check("an unpaid session grants nothing", notPaid.ok === false && notPaid.error === "not_paid")
    const other = await grantFromSession(db, paidSession() as never, { userId: SECOND })
    check("the sheet cannot claim somebody else's session", other.ok === false && other.error === "forbidden" && other.status === 403)
    check("a session that is not ours is refused", (await grantFromSession(db, { id: "cs_x", payment_status: "paid", metadata: { kind: "cart" } } as never)).ok === false)
    check("isEventSession only says yes to our own", isEventSession(paidSession() as never) && !isEventSession({ metadata: { kind: "community_program", community_program_id: "x", buyer_id: BUYER } } as never))
    check("a session for an event that is gone grants nothing", (await grantFromSession(db, paidSession({ metadata: { ...paidSession().metadata, community_event_id: UID(99) } }) as never)).ok === false)
  }

  /* ── Free tickets ────────────────────────────────────────────────────── */
  console.log("\nA free ticket")
  {
    const db = worldWith([eventRow({ capacity: 3 })])
    const first = await grantTicket(db, { eventId: EID, userId: SECOND, communityId: CID, source: "invite", by: OWNER })
    const again = await grantTicket(db, { eventId: EID, userId: SECOND, communityId: CID, source: "invite", by: OWNER })
    check("an invite gives a paid ticket at no cost", first.ok === true && first.created === true)
    check("inviting twice is one ticket", again.ok === true && again.created === false && (db.tables.community_event_tickets as Row[]).length === 1)
    const row = (db.tables.community_event_tickets as Row[])[0]
    check("it says who invited them and that nothing was paid", row.invited_by === OWNER && row.amount_cents === 0 && row.source === "invite")
    const wrongCommunity = await grantTicket(db, { eventId: EID, userId: THIRD, communityId: "11111111-1111-4111-8111-111111111111" })
    check("a ticket is never granted for another community's event", wrongCommunity.ok === false && wrongCommunity.status === 404)
    check("marking them attended works", await markAttended(db, { ticketId: row.id, at: iso(NOW) }))
    check("and it is on the row", (db.tables.community_event_tickets as Row[])[0].attended_at === iso(NOW))
  }
  {
    const db = worldWith([eventRow({ capacity: 1 })])
    await grantTicket(db, { eventId: EID, userId: SECOND, communityId: CID })
    const full = await grantTicket(db, { eventId: EID, userId: THIRD, communityId: CID })
    check("an invite respects the capacity", full.ok === false && full.error === "full")
    const forced = await grantTicket(db, { eventId: EID, userId: THIRD, communityId: CID, force: true })
    check("unless staff mean it, and then it says so plainly", forced.ok === true && forced.created === true)
  }

  /* ── The creator's panel ─────────────────────────────────────────────── */
  console.log("\nWhat the creator sees")
  {
    const db = worldWith([eventRow({ capacity: 10 })])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    await grantFromSession(db, paidSession() as never)
    await grantTicket(db, { eventId: EID, userId: SECOND, communityId: CID, source: "invite", by: OWNER })
    const money = await eventTicketMoney(db, EID)
    check("sold, invited and gross are the real rows", money.sold === 1 && money.invited === 1 && money.grossCents === 2500 && money.refundedCents === 0 && money.currency === "usd")
    const page = await eventTickets(db, EID, { limit: 10 })
    check("the holders come back with their names", page.rows.length === 2 && page.rows.some((r) => r.name === "Mara Pop") && page.rows.some((r) => r.name === "Ion Radu"))
    check("staff see the address, and how each got in", page.rows.every((r) => Boolean(r.email)) && page.rows.some((r) => r.source === "invite" && r.invitedByName === "The Owner"))
    check("a short list has no next page", page.nextCursor === null)
    const first = await eventTickets(db, EID, { limit: 1 })
    check("a longer one pages by a cursor, never an offset", first.rows.length === 1 && typeof first.nextCursor === "string")
    const next = await eventTickets(db, EID, { limit: 1, cursor: first.nextCursor })
    check("and the next page is the other row", next.rows.length === 1 && next.rows[0].ticketId !== first.rows[0].ticketId)
  }

  /* ── Refunds ─────────────────────────────────────────────────────────── */
  console.log("\nGiving the money back")
  {
    const db = worldWith([eventRow({ capacity: 1 })])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    await grantFromSession(db, paidSession() as never)
    const log: Row[] = []
    const done = await refundTicket(db, { community, ticketId: (db.tables.community_event_tickets as Row[])[0].id, actorId: OWNER, reason: "they asked" }, refundStub(log))
    check("staff refund the ticket's own amount", done.ok === true && done.amountCents === 2500 && done.userId === BUYER)
    check("the money comes back from the creator's balance, not Storelib's", log[0].reverse_transfer === true && log[0].payment_intent === "pi_ticket_1" && log[0].amount === 2500)
    check("under a key that makes a second press the same refund", /^storelib-event-ticket-refund:/.test(String(log[0].key)))
    check("the ticket reads refunded", (db.tables.community_event_tickets as Row[])[0].status === "refunded")
    check("the event counts none sold", (db.tables.community_events as Row[])[0].tickets_sold === 0)
    check("their going answer is taken back", (db.tables.community_event_rsvps as Row[]).find((r) => r.user_id === BUYER)?.status === "cancelled")
    check("a row is written so they are emailed once per refund", (db.tables.community_refunds as Row[]).length === 1 && (db.tables.community_refunds as Row[])[0].amount_cents === 2500)
    check("it is in the audit log", (db.tables.community_audit_log as Row[]).some((r) => r.action === "event.ticket_refunded"))
    const again = await refundTicket(db, { community, ticketId: (db.tables.community_event_tickets as Row[])[0].id, actorId: OWNER }, refundStub(log))
    check("refunding again changes nothing and asks Stripe nothing", again.ok === false && again.error === "already_refunded" && log.length === 1)
    const second = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(SECOND), eventId: EID, email: null })
    check("the freed seat is the next person's to buy", second.ok === true)
  }
  {
    const db = worldWith([eventRow()])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    await grantFromSession(db, paidSession() as never)
    const ticketId = (db.tables.community_event_tickets as Row[])[0].id
    const log: Row[] = []
    const mine = await refundTicket(db, { community, ticketId, actorId: BUYER, byHolder: true }, refundStub(log))
    check("the holder gives up their own seat inside the window", mine.ok === true && mine.amountCents === 2500)
  }
  {
    const db = worldWith([eventRow({ starts_at: iso(NOW + 2 * HOUR) })])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    await grantFromSession(db, paidSession() as never)
    const ticketId = (db.tables.community_event_tickets as Row[])[0].id
    const log: Row[] = []
    const late = await refundTicket(db, { community, ticketId, actorId: BUYER, byHolder: true }, refundStub(log))
    check("outside the window the holder is refused, and nothing is asked of Stripe", late.ok === false && late.error === "refund_closed" && log.length === 0)
    check("the ticket is untouched", (db.tables.community_event_tickets as Row[])[0].status === "paid")
    const staffCan = await refundTicket(db, { community, ticketId, actorId: OWNER }, refundStub(log))
    check("but staff may still refund it", staffCan.ok === true && log.length === 1)
  }
  {
    const db = worldWith([eventRow()])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    await grantFromSession(db, paidSession() as never)
    const ticketId = (db.tables.community_event_tickets as Row[])[0].id
    const notTheirs = await refundTicket(db, { community, ticketId, actorId: SECOND, byHolder: true }, refundStub([]))
    check("nobody gives up somebody else's seat", notTheirs.ok === false && notTheirs.status === 403)
    const broken = await refundTicket(db, { community, ticketId, actorId: OWNER }, refundStub([], { fail: true }))
    check("a refund Stripe refuses leaves the ticket exactly as it was", broken.ok === false && broken.error === "stripe" && (db.tables.community_event_tickets as Row[])[0].status === "paid")
  }
  {
    const db = worldWith([eventRow()])
    await grantTicket(db, { eventId: EID, userId: SECOND, communityId: CID, source: "invite", by: OWNER })
    const log: Row[] = []
    const free = await refundTicket(db, { community, ticketId: (db.tables.community_event_tickets as Row[])[0].id, actorId: OWNER }, refundStub(log))
    check("an invited seat needs no Stripe at all", free.ok === true && free.amountCents === 0 && log.length === 0)
    check("and the seat still goes back", (db.tables.community_event_tickets as Row[])[0].status === "refunded")
  }

  console.log("\nA cancelled event gives everybody their money back")
  {
    const db = worldWith([eventRow({ capacity: 10 })])
    const buyers = [BUYER, SECOND, THIRD]
    for (let i = 0; i < buyers.length; i += 1) {
      await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(buyers[i]), eventId: EID, email: null })
      await grantFromSession(db, paidSession({ id: `cs_test_ticket${i + 1}00000000`, payment_intent: `pi_ticket_${i + 1}`, metadata: { ...paidSession().metadata, buyer_id: buyers[i] } }) as never)
    }
    check("three tickets are live", (db.tables.community_events as Row[])[0].tickets_sold === 3)
    const log: Row[] = []
    const all = await refundEveryTicket(db, { community, eventId: EID, actorId: OWNER, reason: "the event was cancelled" }, refundStub(log))
    check("every ticket comes back, and the total is real", all.refunded === 3 && all.failed === 0 && all.totalCents === 7500)
    check("each one through its own payment", log.length === 3 && new Set(log.map((r) => r.payment_intent)).size === 3)
    check("nobody is left holding a seat", (db.tables.community_event_tickets as Row[]).every((t) => t.status === "refunded") && (db.tables.community_events as Row[])[0].tickets_sold === 0)
    const nothingLeft = await refundEveryTicket(db, { community, eventId: EID, actorId: OWNER }, refundStub(log))
    check("asking again does nothing", nothingLeft.refunded === 0 && log.length === 3)
  }
  {
    const db = worldWith([eventRow({ capacity: 10 })])
    const buyers = [BUYER, SECOND, THIRD]
    for (let i = 0; i < buyers.length; i += 1) {
      await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(buyers[i]), eventId: EID, email: null })
      await grantFromSession(db, paidSession({ id: `cs_test_ticket${i + 1}00000000`, payment_intent: `pi_ticket_${i + 1}`, metadata: { ...paidSession().metadata, buyer_id: buyers[i] } }) as never)
    }
    const log: Row[] = []
    const some = await refundEveryTicket(db, { community, eventId: EID, actorId: OWNER }, refundStub(log, { failFor: "pi_ticket_2" }))
    check("one payment Stripe refuses does not stop the others", some.refunded === 2 && some.failed === 1 && some.totalCents === 5000)
    check("and the one that failed is still paid, so it can be tried again", (db.tables.community_event_tickets as Row[]).filter((t) => t.status === "paid").length === 1)
  }
  {
    const db = worldWith([eventRow()])
    await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    await grantFromSession(db, paidSession() as never)
    check("a refund made anywhere else takes the seat back too (charge.refunded)", (await revokeRefundedTicket(db, "pi_ticket_1")) === 1)
    check("the ticket reads refunded", (db.tables.community_event_tickets as Row[])[0].status === "refunded")
    check("a payment with no ticket on it does nothing", (await revokeRefundedTicket(db, "pi_nothing")) === 0 && (await revokeRefundedTicket(db, null)) === 0)
  }

  /* ── The refund policy words ─────────────────────────────────────────── */
  console.log("\nThe words an event refunds by")
  {
    const db = worldWith([eventRow({ refund_policy: "Up to two days before, in full." })])
    check("the event's own words win", (await refundPolicyFor(db, CID, { refund_policy: "Up to two days before, in full." })) === "Up to two days before, in full.")
    check("with none of its own it falls back to the community's", (await refundPolicyFor(db, CID, { refund_policy: null })) === "The community gives money back up to a day before.")
    const bare = worldWith([eventRow()], { communities: [{ id: CID, slug: "makers", name: "Makers", refund_policy: null }] })
    check("and with neither it says nothing", (await refundPolicyFor(bare, CID, { refund_policy: null })) === null)
  }

  /* ── Who may price and refund ────────────────────────────────────────── */
  console.log("\nWho may price an event and refund a ticket")
  {
    const group = PERMISSION_GROUPS.find((g) => g.key === "tickets")
    check("there is a tickets group, with both actions in it", Boolean(group) && (group!.actions as readonly string[]).slice().sort().join() === ["price_events", "refund_tickets"].join())
    check("the owner always may", can("owner", "price_events") && can("owner", "refund_tickets"))
    check("an admin may by default", can("admin", "price_events") && can("admin", "refund_tickets"))
    check("a moderator may by default too, as the owner asked", can("moderator", "price_events") && can("moderator", "refund_tickets"))
    check("a member never may", !can("member", "price_events") && !can("member", "refund_tickets"))
    check("nor does somebody who is not a member", !can(null, "price_events") && !can(undefined, "refund_tickets"))
    const off = parseRolePermissions({ moderator: { tickets: false }, admin: { tickets: false } })
    check("the owner can take it away from both staff roles", !can("moderator", "price_events", off) && !can("admin", "refund_tickets", off))
    check("and the owner keeps it whatever is stored", can("owner", "price_events", off) && can("owner", "refund_tickets", off))
    check("neither action is owner only", !OWNER_ONLY_ACTIONS.includes("price_events") && !OWNER_ONLY_ACTIONS.includes("refund_tickets"))
    check("the defaults have tickets on for both staff roles", DEFAULT_ROLE_PERMISSIONS.admin.tickets === true && DEFAULT_ROLE_PERMISSIONS.moderator.tickets === true)
  }

  /* ── Before run-now part 105 ─────────────────────────────────────────── */
  console.log("\nBefore part 105 has run")
  {
    resetTicketsReady()
    const gone = { code: "42P01", message: 'relation "community_event_tickets" does not exist' }
    const db = memDb(
      {
        communities: [{ id: CID, slug: "makers", name: "Makers" }],
        creators: [{ id: CREATOR, stripe_account_id: "acct_live123" }],
        community_events: [
          {
            id: EID, community_id: CID, title: "Workshop", description: null, cover_url: null, kind: "online", starts_at: iso(NOW + 7 * DAY), ends_at: null, timezone: "UTC", location: null,
            meeting_url: null, livestream_url: null, capacity: null, going_count: 0, access: {}, host_id: OWNER, replay_video_id: null, status: "scheduled", reminder_24h_at: null,
            reminder_1h_at: null, created_by: OWNER, created_at: iso(NOW), updated_at: iso(NOW),
          },
        ],
        profiles: [],
      },
      { failWith: { community_event_tickets: gone } },
    ) as MemDb
    check("the part has not run", (await ticketsReady(db)) === false)
    check("nobody has a ticket", (await ticketOf(db, EID, BUYER)) === null && (await ticketsOf(db, BUYER, [EID])).size === 0)
    check("there are no holders to show", (await eventTickets(db, EID)).rows.length === 0)
    const money = await eventTicketMoney(db, EID)
    check("and no money to report", money.sold === 0 && money.grossCents === 0)
    const granted = await grantTicket(db, { eventId: EID, userId: BUYER, communityId: CID })
    check("a free ticket says the part is needed rather than throwing", granted.ok === false && granted.error === "not_set_up")
    check("the sweep does nothing", (await releaseDeadHolds(db)) === 0)
    check("nothing can be marked attended", (await markAttended(db, { ticketId: "20000000-0000-4000-8000-000000000001" })) === false)
    const started = await startEventCheckout(db, depsWith(stripeStub([])), { community, viewer: viewerOf(BUYER), eventId: EID, email: null })
    check("the event is free, so there is nothing to buy", started.ok === false && started.code === "free")
    check("a refund of a ticket that cannot exist refuses quietly", (await refundTicket(db, { community, ticketId: "20000000-0000-4000-8000-000000000001", actorId: OWNER }, refundStub([]))).ok === false)
    const all = await refundEveryTicket(db, { community, eventId: EID, actorId: OWNER }, refundStub([]))
    check("and a whole event refunds nothing", all.refunded === 0 && all.failed === 0 && all.totalCents === 0)
    check("charge.refunded does nothing", (await revokeRefundedTicket(db, "pi_x")) === 0)
    const plain = await readPricedEvent(db, CID, EID)
    check("the event still reads, with its plain columns, and it is free", Boolean(plain) && eventPriceMode({ priceCents: plain?.price_cents ?? null }) === "free")
    resetTicketsReady()
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */
  console.log("\nHow it is wired in")
  {
    const webhook = code("app/api/stripe/webhook/route.ts")
    check("the webhook answers a ticket session before anything else reads it", /kind === "community_event"/.test(webhook) && /isEventSession\(session\)/.test(webhook) && /grantFromSession\(supabaseAdmin, session\)/.test(webhook))
    check("both the completed and the late payment events are answered", /checkout\.session\.completed" \|\| event\.type === "checkout\.session\.async_payment_succeeded"[\s\S]{0,400}community_event"/.test(webhook))
    check("an unpaid session grants nothing there either", /payment_status !== "paid"[\s\S]{0,80}Ticket not paid yet/.test(webhook))
    check("a server failure answers 500 so Stripe retries", /Ticket not granted yet"[\s\S]{0,40}status: 500/.test(webhook))
    check("charge.refunded frees the seat", /revokeRefundedTicket/.test(webhook))
    const cron = code("app/api/cron/community/route.ts")
    check("the holds sweep runs in the job cron that already runs every five minutes", /releaseDeadHolds\(db\)/.test(cron) && /seatsFreed/.test(cron))
    check("and never while communities are switched off", /on \? await releaseDeadHolds\(db\)/.test(cron))
    const routes = [
      "app/api/community/[communityId]/events/[eventId]/checkout/route.ts",
      "app/api/community/[communityId]/events/[eventId]/checkout/confirm/route.ts",
      "app/api/community/[communityId]/events/[eventId]/ticket/route.ts",
    ]
    for (const r of routes) {
      const src = code(r)
      check(`${r.split("/events/")[1]} answers the switch first`, /requireCommunitiesOn\(\)/.test(src) && src.indexOf("requireCommunitiesOn") < src.indexOf("requireMember"))
      check(`${r.split("/events/")[1]} checks the member`, /requireMember\(/.test(src))
      check(`${r.split("/events/")[1]} limits the write`, /rateLimit\(/.test(src))
      check(`${r.split("/events/")[1]} never trusts an id from the body`, !/body\.(eventId|ticketId|amount|priceCents)/.test(src))
    }
    check("the checkout route reads the price nowhere but the server", /startEventCheckout\(/.test(code(routes[0])) && !/body/.test(code(routes[0])))
    check("the confirm route answers whether the ticket was new", /created: done\.created/.test(code(routes[1])))
    check("giving up a seat answers what came back, or the policy words", /refundedCents: done\.amountCents/.test(code(routes[2])) && /refund_closed/.test(code(routes[2])))
    const pure = read("lib/communities/event-tickets.ts")
    check("the rules module is browser safe: no server import at all", !/server-only|next\/headers|\/server\//.test(pure))
    check("it reads nothing: it is given the numbers", !/\bdb\b|supabase|from\(/.test(pure))
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nThe copy")
  {
    const mine = [
      "lib/communities/event-tickets.ts",
      "lib/communities/server/event-tickets.ts",
      "lib/communities/server/event-checkout.ts",
      "lib/communities/server/event-refunds.ts",
      "app/api/community/[communityId]/events/[eventId]/checkout/route.ts",
      "app/api/community/[communityId]/events/[eventId]/checkout/confirm/route.ts",
      "app/api/community/[communityId]/events/[eventId]/ticket/route.ts",
      "tests/communities-paid-events.test.ts",
    ].filter((f) => existsSync(f))
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
    /* This suite names the words to look for them, so its own line that does is not an offence. */
    const offenders = mine.filter((f) => banned.test(read(f).split("\n").filter((l) => !/const banned = /.test(l)).join("\n")))
    check("no em dash and none of the banned words", offenders.length === 0, offenders)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  FAIL  ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
