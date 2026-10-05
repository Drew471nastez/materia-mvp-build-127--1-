/**
 * ===========================================================================
 *  TICKETS: THE RECEIPT, THE REMINDERS AND THE FREE INVITE (round 14, 19 to 24)
 * ===========================================================================
 * Held from their inputs, against a small PostgREST stand in:
 *
 *   ONE MESSAGE, NOT TWO   a ticket writes one bell row and raises exactly
 *                          one email (the receipt, with the event as a
 *                          calendar file). Called again for the same ticket
 *                          it adds nothing: no second row, no second email.
 *                          A free ticket says what a seat costs, never a
 *                          price paid.
 *   HOLDERS ONLY           a paid event's reminder goes to the people whose
 *                          ticket is live. A refunded ticket, a cancelled
 *                          one and somebody with no ticket hear nothing; a
 *                          free event reminds everyone going, as today.
 *   NEVER TWICE            inviting the same person twice, a list with the
 *                          same address twice, and an invite link used
 *                          twice each grant one ticket and send one email.
 *                          The event on a link is signed, so it cannot be
 *                          moved onto somebody else's invite.
 *   MONEY BACK             a refund says what came back; an event called
 *                          off says it is off AND that the money is coming,
 *                          in one message, never a refund email beside it.
 *   SALES, GROUPED         whoever runs the community gets one row per
 *                          window, "4 tickets for Darkroom night", never
 *                          one per sale, and never about their own ticket.
 *   WITHOUT PART 105       no tickets anywhere: the reminder reminds
 *                          everyone going and the invite route says the
 *                          update is needed, rather than pretending.
 *
 * Run with:  pnpm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import { setPushBridgeDeps, pushPriority, summaryLine, IMMEDIATE_KINDS, ADDRESSED_KINDS } from "@/lib/notifications/push-bridge"
import { CAP_EXEMPT_KINDS } from "@/lib/notifications/push-budget"
import { notifyTicketSale, ticketSalesKey, ticketSalesTitle, SALES_WINDOW_MS } from "@/lib/communities/server/notify"
import { cancelledHolderNotice, eventIsPaid, liveTicketHolders, ticketNoticeContext, ticketPaidNotice, ticketRefundedNotice } from "@/lib/communities/server/jobs/event_ticket_notify"
import { cleanInviteInput, eventInviteQuery, eventInviteTag, grantTicketOnJoin, inviteToEvent, verifyEventInviteTag } from "@/lib/communities/server/jobs/event_ticket_invite"
import { eventReminder } from "@/lib/communities/server/jobs/event_reminder"
import { resetTicketsReady } from "@/lib/communities/server/event-tickets"
import { renderEmail } from "@/lib/notify/templates"
import { REGISTRY } from "@/lib/notify/registry"
import { emailAllowed, emailClass } from "@/lib/notify/email-budget"
import { communities as communitiesWorkflow } from "@/lib/notify/workflows/communities"
import type { CommunityRow, JobRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => stripComments(read(f))

/* ── A small PostgREST stand in ─────────────────────────────────────────── */

type Row = Record<string, any>
const DEFAULTS: Record<string, Row> = { community_jobs: { state: "pending", attempts: 0 } }

interface Fake {
  from: (table: string) => any
  tables: Record<string, Row[]>
  auth: any
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  calls: { name: string; args: Record<string, unknown> }[]
}

function pg(
  tables: Record<string, Row[]>,
  opts: { users?: Record<string, { email?: string; app_metadata?: Record<string, unknown> }>; gone?: string[]; rpc?: Record<string, (args: Record<string, unknown>) => unknown> } = {},
): Fake {
  const users = opts.users ?? {}
  const gone = new Set(opts.gone ?? [])
  const calls: { name: string; args: Record<string, unknown> }[] = []
  let serial = 0
  const id = () => `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`
  function from(table: string) {
    const st = { op: "select", preds: [] as ((r: Row) => boolean)[], order: [] as [string, boolean][], limit: null as number | null, head: false, count: false, payload: null as any, single: false, conflict: "", ignore: false, returning: false }
    const cmp = (a: unknown, b: unknown) => (String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0)
    const rows = () => (tables[table] ??= [])
    const run = () => {
      /* A table run-now has not made: exactly what PostgREST answers, so missing() sees it. */
      if (gone.has(table)) return { data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` }, count: null }
      const hit = rows().filter((r) => st.preds.every((p) => p(r)))
      if (st.op === "select") {
        let out = [...hit]
        if (st.order.length)
          out.sort((x, y) => {
            for (const [c, asc] of st.order) {
              const d = cmp(x[c], y[c])
              if (d) return asc ? d : -d
            }
            return 0
          })
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, error: null, count: hit.length }
        if (st.single) return { data: out[0] ? { ...out[0] } : null, error: null }
        return { data: out.map((r) => ({ ...r })), error: null, count: st.count ? hit.length : null }
      }
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.payload)
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null }
      }
      const list = Array.isArray(st.payload) ? st.payload : [st.payload]
      const made: Row[] = []
      for (const p of list) {
        const keys = st.conflict ? st.conflict.split(",") : []
        const had = keys.length ? rows().find((r) => keys.every((k) => r[k] === p[k])) : undefined
        if (had) {
          if (!st.ignore) Object.assign(had, p)
          continue
        }
        const row = { id: id(), created_at: new Date().toISOString(), read_at: null, ...(DEFAULTS[table] ?? {}), ...p }
        rows().push(row)
        made.push(row)
      }
      if (st.single) return { data: made[0] ? { ...made[0] } : null, error: null }
      return { data: st.returning ? made.map((r) => ({ ...r })) : null, error: null }
    }
    const q: any = {
      select(_c?: string, o?: { count?: string; head?: boolean }) {
        if (st.op === "select") {
          st.head = !!o?.head
          st.count = !!o?.count
        } else st.returning = true
        return q
      },
      eq(c: string, v: unknown) {
        st.preds.push((r) => r[c] === v)
        return q
      },
      neq(c: string, v: unknown) {
        st.preds.push((r) => r[c] !== v)
        return q
      },
      in(c: string, v: unknown[]) {
        st.preds.push((r) => v.includes(r[c]))
        return q
      },
      is(c: string, v: unknown) {
        st.preds.push((r) => (v === null ? r[c] == null : r[c] === v))
        return q
      },
      gt(c: string, v: unknown) {
        st.preds.push((r) => cmp(r[c], v) > 0)
        return q
      },
      gte(c: string, v: unknown) {
        st.preds.push((r) => cmp(r[c], v) >= 0)
        return q
      },
      lt(c: string, v: unknown) {
        st.preds.push((r) => cmp(r[c], v) < 0)
        return q
      },
      lte(c: string, v: unknown) {
        st.preds.push((r) => cmp(r[c], v) <= 0)
        return q
      },
      order(c: string, o?: { ascending?: boolean }) {
        st.order.push([c, o?.ascending !== false])
        return q
      },
      limit(n: number) {
        st.limit = n
        return q
      },
      maybeSingle() {
        st.single = true
        return q
      },
      single() {
        st.single = true
        return q
      },
      update(p: Row) {
        st.op = "update"
        st.payload = p
        return q
      },
      insert(p: Row | Row[]) {
        st.op = "insert"
        st.payload = p
        return q
      },
      upsert(p: Row | Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) {
        st.op = "upsert"
        st.payload = p
        st.conflict = o.onConflict
        st.ignore = !!o.ignoreDuplicates
        return q
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          resolve(run())
        } catch (e) {
          reject(e)
        }
      },
    }
    return q
  }
  const auth = {
    admin: {
      async getUserById(uid: string) {
        const u = users[uid]
        return { data: { user: u ? { id: uid, email: u.email ?? null, app_metadata: u.app_metadata ?? {} } : null }, error: null }
      },
      async updateUserById() {
        return { error: null }
      },
    },
  }
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args })
    const fn = opts.rpc?.[name]
    return { data: fn ? fn(args) : null, error: fn ? null : { code: "PGRST202", message: "function does not exist" } }
  }
  return { from, tables, auth, rpc, calls }
}

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const C1 = "00000000-0000-4000-b000-000000000001"
const E_PAID = "00000000-0000-4000-e000-000000000001"
const E_FREE = "00000000-0000-4000-e000-000000000002"
const OWNER = U(1)
const MARA = U(2)
const BEN = U(3)
const IOANA = U(4)
const DAN = U(5)
const STAFF = U(6)

const STARTS = "2026-11-20T18:00:00.000Z"

function world(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    communities: [{ id: C1, name: "Film Loft", slug: "film-loft", status: "published", deleted_at: null, suspended_at: null, owner_user_id: OWNER, creator_id: "cr1", refund_policy: "Refunds up to 24 hours before.", events_enabled: true, archived_at: null }],
    creators: [{ id: "cr1", user_id: OWNER, display_name: "Owen" }],
    community_members: [
      { community_id: C1, user_id: OWNER, status: "active", role: "owner", notify_level: "important", email_events: true },
      { community_id: C1, user_id: MARA, status: "active", role: "member", notify_level: "all", email_events: true },
      { community_id: C1, user_id: BEN, status: "active", role: "member", notify_level: "all", email_events: true },
      { community_id: C1, user_id: IOANA, status: "active", role: "member", notify_level: "all", email_events: true },
      { community_id: C1, user_id: DAN, status: "active", role: "member", notify_level: "all", email_events: true },
      { community_id: C1, user_id: STAFF, status: "active", role: "moderator", notify_level: "all", email_events: true },
    ],
    community_events: [
      {
        id: E_PAID,
        community_id: C1,
        title: "Darkroom night",
        description: "Two hours in the darkroom.",
        status: "scheduled",
        starts_at: STARTS,
        ends_at: null,
        timezone: "Europe/Bucharest",
        location: null,
        meeting_url: "https://meet.example.com/x",
        livestream_url: null,
        capacity: 10,
        price_cents: 2500,
        currency: "usd",
        sales_close_at: null,
        refund_window_hours: 24,
        refund_policy: null,
        tickets_sold: 1,
        created_by: OWNER,
        created_at: STARTS,
        updated_at: STARTS,
        reminder_24h_at: null,
        reminder_1h_at: null,
        access: {},
      },
      { id: E_FREE, community_id: C1, title: "Open studio", description: "Come by.", status: "scheduled", starts_at: STARTS, ends_at: null, timezone: "Europe/Bucharest", location: "Str. Lipscani 4", meeting_url: null, livestream_url: null, capacity: null, price_cents: null, currency: null, sales_close_at: null, refund_window_hours: null, refund_policy: null, tickets_sold: 0, created_by: OWNER, created_at: STARTS, updated_at: STARTS, reminder_24h_at: null, reminder_1h_at: null, access: {} },
    ],
    community_event_tickets: [],
    community_event_rsvps: [],
    community_notifications: [],
    community_jobs: [],
    community_invites: [],
    community_audit_log: [],
    notification_events: [],
    notification_preferences: [],
    rate_limit_hits: [],
    push_tokens: [OWNER, MARA, BEN, IOANA, DAN, STAFF].map((u, i) => ({ id: `tok${i}`, user_id: u, token: `t-${i}`, platform: "ios" })),
    business_links: [],
    profiles: [
      { id: OWNER, display_name: "Owen Marin", username: "owen", email: "owen@example.com" },
      { id: MARA, display_name: "Mara Pop", username: "mara", email: "mara@example.com" },
      { id: BEN, display_name: "Ben Ionescu", username: "ben", email: "ben@example.com" },
      { id: IOANA, display_name: "Ioana Radu", username: "ioana", email: "ioana@example.com" },
      { id: DAN, display_name: "Dan Toma", username: "dan", email: "dan@example.com" },
      { id: STAFF, display_name: "Sam Petre", username: "sam", email: "sam@example.com" },
    ],
    ...extra,
  }
}

const users = () => ({
  [OWNER]: { email: "owen@example.com", app_metadata: {} },
  [MARA]: { email: "mara@example.com", app_metadata: {} },
  [BEN]: { email: "ben@example.com", app_metadata: {} },
  [IOANA]: { email: "ioana@example.com", app_metadata: {} },
  [DAN]: { email: "dan@example.com", app_metadata: {} },
  [STAFF]: { email: "sam@example.com", app_metadata: {} },
})

interface Sent {
  userId: string
  title: string
  body: string
  kind: string
}
function deps(sent: Sent[]) {
  return {
    sender: async (userId: string, p: { title: string; body: string; data?: Record<string, string> }) => {
      sent.push({ userId, title: p.title, body: p.body, kind: p.data?.kind ?? "" })
    },
    communitiesOn: async () => true,
    defer: (task: () => Promise<void>) => task(),
  }
}

const community = (): CommunityRow => ({ id: C1, slug: "film-loft", name: "Film Loft", status: "published", events_enabled: true } as unknown as CommunityRow)

const emailsOf = (db: Fake) => (db.tables.notification_events ?? []).map((e) => ({ name: e.name, key: e.event_key, to: e.payload?.recipientEmail, payload: e.payload }))
const rowsOf = (db: Fake) => db.tables.community_notifications ?? []

function grantRpc(state: { tickets: Map<string, string> }) {
  return (args: Record<string, unknown>) => {
    const key = `${String(args.p_event)}:${String(args.p_user)}`
    const had = state.tickets.get(key)
    if (had) return { ok: true, created: false, ticket_id: had, source: "invite" }
    const ticketId = `00000000-0000-4000-f000-${String(state.tickets.size + 1).padStart(12, "0")}`
    state.tickets.set(key, ticketId)
    return { ok: true, created: true, ticket_id: ticketId, source: "invite" }
  }
}

function job(payload: Record<string, unknown>, kind = "event_reminder"): JobRow {
  return { id: 1, kind, payload, state: "running", attempts: 1, run_at: new Date().toISOString(), lease_until: null, last_error: null, idempotency_key: "k", created_at: new Date().toISOString(), finished_at: null } as unknown as JobRow
}
const ctx = () => ({ deadline: Date.now() + 60_000, now: Date.parse(STARTS) - 24 * 3600_000 + 60_000 })

const TICKET = "00000000-0000-4000-f000-0000000000aa"

async function main() {
  /* The signature over an invite link is made with the server key, so the test gives it one. */
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role-key-for-the-test"

  /* ── The receipt, and never a second message ──────────────────────────── */
  console.log("\nOne ticket, one message")
  {
    resetTicketsReady()
    const sent: Sent[] = []
    setPushBridgeDeps(deps(sent))
    const db = pg(world(), { users: users() })
    const first = await ticketPaidNotice(db as never, { communityId: C1, eventId: E_PAID, ticketId: TICKET, userId: MARA, amountCents: 2500, currency: "usd", source: "purchase", enabled: true })
    const again = await ticketPaidNotice(db as never, { communityId: C1, eventId: E_PAID, ticketId: TICKET, userId: MARA, amountCents: 2500, currency: "usd", source: "purchase", enabled: true })
    const rows = rowsOf(db).filter((r) => r.user_id === MARA)
    const mail = emailsOf(db).filter((e) => e.to === "mara@example.com")
    check("the ticket is told once, and telling it again changes nothing", first === "sent" && again === "sent" && rows.length === 1 && mail.length === 1, { first, again, rows: rows.length, mail: mail.length })
    check("the bell row says they are going, and opens the event", rows[0]?.title === "You are going to Darkroom night" && rows[0]?.url === `/community/film-loft/events/${E_PAID}`, rows[0])
    check("the one email is the receipt, keyed by the ticket", mail[0]?.name === "community.event_ticket" && String(mail[0]?.key).includes(`ticket:${TICKET}`), mail[0]?.key)
    check("there is no second email saying they are going", mail.filter((m) => m.name === "community.event_ticket_invite").length === 0)
    check("the receipt carries what they paid and this community's refund words", mail[0]?.payload?.amountCents === 2500 && String(mail[0]?.payload?.refundPolicy).startsWith("Refunds up to"), mail[0]?.payload?.refundPolicy)
    const push = sent.filter((p) => p.userId === MARA)
    check("their phone hears it once, as a ticket", push.length === 1 && push[0].kind === "ticket", push)
  }

  /* ── A free seat staff gave them ──────────────────────────────────────── */
  {
    resetTicketsReady()
    const sent: Sent[] = []
    setPushBridgeDeps(deps(sent))
    const db = pg(world(), { users: users() })
    await ticketPaidNotice(db as never, { communityId: C1, eventId: E_PAID, ticketId: TICKET, userId: BEN, amountCents: 0, source: "invite", invitedByName: "Sam Petre", message: "Come along.", enabled: true })
    const mail = emailsOf(db).filter((e) => e.to === "ben@example.com")
    check("a free ticket is its own email, which says who gave it and what a seat costs", mail.length === 1 && mail[0].name === "community.event_ticket_invite" && mail[0].payload?.inviterName === "Sam Petre" && mail[0].payload?.priceCents === 2500, mail[0]?.payload)
    check("a free ticket never says a price was paid", mail[0]?.payload?.amountCents === undefined)
    check("and nothing about a sale reaches the owner for a ticket that cost nothing", rowsOf(db).filter((r) => r.user_id === OWNER).length === 0)
  }

  /* ── Sales, grouped for whoever runs it ───────────────────────────────── */
  console.log("\nTickets sold, grouped")
  {
    const now = Date.parse("2026-10-05T10:00:00.000Z")
    check("one row per event and window", ticketSalesKey(OWNER, E_PAID, now) === ticketSalesKey(OWNER, E_PAID, now + 60_000) && ticketSalesKey(OWNER, E_PAID, now) !== ticketSalesKey(OWNER, E_PAID, now + SALES_WINDOW_MS))
    check("it reads as a count", ticketSalesTitle(1, "Darkroom night") === "1 ticket for Darkroom night" && ticketSalesTitle(4, "Darkroom night") === "4 tickets for Darkroom night")
    resetTicketsReady()
    const sent: Sent[] = []
    setPushBridgeDeps(deps(sent))
    const paidAt = new Date(now).toISOString()
    const db = pg(
      world({
        community_event_tickets: [
          { id: "t1", event_id: E_PAID, community_id: C1, user_id: MARA, status: "paid", source: "purchase", amount_cents: 2500, currency: "usd", paid_at: paidAt },
          { id: "t2", event_id: E_PAID, community_id: C1, user_id: BEN, status: "paid", source: "purchase", amount_cents: 2500, currency: "usd", paid_at: paidAt },
          { id: "t3", event_id: E_PAID, community_id: C1, user_id: IOANA, status: "paid", source: "purchase", amount_cents: 2500, currency: "usd", paid_at: paidAt },
          { id: "t4", event_id: E_PAID, community_id: C1, user_id: DAN, status: "refunded", source: "purchase", amount_cents: 2500, currency: "usd", paid_at: paidAt },
        ],
      }),
      { users: users() },
    )
    await notifyTicketSale(db as never, { communityId: C1, userId: OWNER, eventId: E_PAID, eventTitle: "Darkroom night", buyerId: MARA, currency: "usd", now })
    await notifyTicketSale(db as never, { communityId: C1, userId: OWNER, eventId: E_PAID, eventTitle: "Darkroom night", buyerId: BEN, currency: "usd", now: now + 1000 })
    const rows = rowsOf(db).filter((r) => r.user_id === OWNER)
    check("three sales in one window are one row, with the count and the money", rows.length === 1 && rows[0].title === "3 tickets for Darkroom night" && rows[0].body === "$75", rows[0])
    check("a refunded ticket is not counted as a sale", rows[0]?.title !== "4 tickets for Darkroom night")
    check("the row opens the community's events in /app", rows[0]?.url === `/app/community/${C1}/events`, rows[0]?.url)
    const own = await notifyTicketSale(db as never, { communityId: C1, userId: OWNER, eventId: E_PAID, eventTitle: "Darkroom night", buyerId: OWNER, now })
    check("nobody hears about their own ticket", own === "skipped")
    check("a sale is coalesced on the phone, and a ticket of their own is not", pushPriority("ticket_sale") === "coalesce" && pushPriority("ticket") === "now")
    check("the summary counts tickets by name", summaryLine(["ticket", "ticket"]) === "2 tickets" && summaryLine(["ticket_sale", "ticket_sale", "ticket_sale"]) === "3 tickets sold")
  }

  /* ── Reminders: holders only ──────────────────────────────────────────── */
  console.log("\nA paid event reminds its ticket holders")
  {
    resetTicketsReady()
    const sent: Sent[] = []
    setPushBridgeDeps(deps(sent))
    const db = pg(
      world({
        community_event_rsvps: [
          { event_id: E_PAID, user_id: MARA, status: "going" },
          { event_id: E_PAID, user_id: BEN, status: "going" },
          { event_id: E_PAID, user_id: IOANA, status: "going" },
          { event_id: E_PAID, user_id: DAN, status: "going" },
        ],
        community_event_tickets: [
          { id: "t1", event_id: E_PAID, community_id: C1, user_id: MARA, status: "paid", source: "purchase", amount_cents: 2500, currency: "usd", paid_at: STARTS },
          { id: "t2", event_id: E_PAID, community_id: C1, user_id: BEN, status: "refunded", source: "purchase", amount_cents: 2500, currency: "usd", paid_at: STARTS },
          { id: "t3", event_id: E_PAID, community_id: C1, user_id: IOANA, status: "cancelled", source: "purchase", amount_cents: null, currency: "usd", paid_at: null },
        ],
      }),
      { users: users() },
    )
    await eventReminder(db as never, job({ eventId: E_PAID, window: "24h", startsAt: new Date(Date.parse(STARTS)).toISOString() }), ctx())
    const told = rowsOf(db).map((r) => r.user_id)
    check("only the live ticket holder is reminded", told.length === 1 && told[0] === MARA, told)
    check("a refunded ticket, a cancelled one and no ticket at all are reminded of nothing", !told.includes(BEN) && !told.includes(IOANA) && !told.includes(DAN))
    check("their phone hears the reminder", sent.some((p) => p.userId === MARA && p.kind === "event_reminder"), sent)
  }
  {
    /* A FREE EVENT, unchanged: everyone who said they are going. */
    resetTicketsReady()
    setPushBridgeDeps(deps([]))
    const db = pg(
      world({
        community_event_rsvps: [
          { event_id: E_FREE, user_id: MARA, status: "going" },
          { event_id: E_FREE, user_id: BEN, status: "going" },
          { event_id: E_FREE, user_id: IOANA, status: "not_going" },
        ],
      }),
      { users: users() },
    )
    await eventReminder(db as never, job({ eventId: E_FREE, window: "24h", startsAt: new Date(Date.parse(STARTS)).toISOString() }), ctx())
    const told = rowsOf(db).map((r) => r.user_id).sort()
    check("a free event reminds everyone going, exactly as today", told.length === 2 && told.includes(MARA) && told.includes(BEN), told)
  }

  /* ── Without run-now part 105 ─────────────────────────────────────────── */
  console.log("\nBefore the paid events update has run")
  {
    resetTicketsReady()
    setPushBridgeDeps(deps([]))
    const db = pg(
      world({
        community_event_rsvps: [
          { event_id: E_PAID, user_id: MARA, status: "going" },
          { event_id: E_PAID, user_id: BEN, status: "going" },
        ],
      }),
      { users: users(), gone: ["community_event_tickets"] },
    )
    check("no tickets table: the event is not sold, and nobody is asked about tickets", (await eventIsPaid(db as never, E_PAID)) === false)
    check("and who holds a ticket cannot be answered, rather than answered wrongly", (await liveTicketHolders(db as never, E_PAID, [MARA])) === null)
    await eventReminder(db as never, job({ eventId: E_PAID, window: "24h", startsAt: new Date(Date.parse(STARTS)).toISOString() }), ctx())
    const told = rowsOf(db).map((r) => r.user_id).sort()
    check("the reminder reaches everyone going, exactly as today", told.length === 2 && told.includes(MARA) && told.includes(BEN), told)
    resetTicketsReady()
    const invite = await inviteToEvent(db as never, { community: community(), eventId: E_PAID, actorId: STAFF, input: { userIds: [MARA] }, enabled: true })
    check("and the invite says the update is needed instead of pretending", invite.ok === false && invite.error === "not_set_up", invite)
    check("nothing was granted", (db.calls ?? []).filter((c) => c.name === "community_event_ticket_grant").length === 0)
  }

  /* ── The free invite: never twice ─────────────────────────────────────── */
  console.log("\nA free seat, given once")
  {
    check("the same person and the same address are asked for once", JSON.stringify(cleanInviteInput({ userIds: [MARA, MARA], emails: ["A@example.com", "a@example.com", "nope"] })) === JSON.stringify({ userIds: [MARA], emails: ["a@example.com"], message: null }))
    resetTicketsReady()
    const sent: Sent[] = []
    setPushBridgeDeps(deps(sent))
    const state = { tickets: new Map<string, string>() }
    const db = pg(world(), { users: users(), rpc: { community_event_ticket_grant: grantRpc(state) } })
    const first = await inviteToEvent(db as never, { community: community(), eventId: E_PAID, actorId: STAFF, input: { userIds: [MARA, MARA], message: "Come along." }, enabled: true })
    const again = await inviteToEvent(db as never, { community: community(), eventId: E_PAID, actorId: STAFF, input: { userIds: [MARA] }, enabled: true })
    const grants = db.calls.filter((c) => c.name === "community_event_ticket_grant")
    const mail = emailsOf(db).filter((e) => e.to === "mara@example.com")
    check("the same person twice in one list is one grant", first.ok === true && first.answer.invited === 1 && grants.length === 2, { first, grants: grants.length })
    check("inviting them again grants nothing new and sends no second email", again.ok === true && again.answer.invited === 1 && state.tickets.size === 1 && mail.length === 1, { mail: mail.length, tickets: state.tickets.size })
    check("the grant names the event, the community and who gave it", grants[0]?.args.p_event === E_PAID && grants[0]?.args.p_by === STAFF && grants[0]?.args.p_source === "invite", grants[0]?.args)
    check("one bell row, and one push, for the seat", rowsOf(db).filter((r) => r.user_id === MARA).length === 1 && sent.filter((p) => p.userId === MARA).length === 1)
  }
  {
    /* AN ADDRESS THAT IS NOBODY YET: the community's own invite link, carrying the event. */
    resetTicketsReady()
    setPushBridgeDeps(deps([]))
    const state = { tickets: new Map<string, string>() }
    const db = pg(world(), { users: users(), rpc: { community_event_ticket_grant: grantRpc(state) } })
    const answer = await inviteToEvent(db as never, { community: community(), eventId: E_PAID, actorId: STAFF, input: { emails: ["new@example.com", "ben@example.com"] }, enabled: true })
    const invites = db.tables.community_invites ?? []
    const mail = emailsOf(db)
    const link = mail.find((m) => m.name === "community.invite")
    check("a member's address is given the ticket, a stranger's is sent a link", answer.ok === true && answer.answer.invited === 1 && answer.answer.notMembers.join() === "new@example.com", answer)
    check("one invite row for the address, keyed to this community", invites.length === 1 && invites[0].email === "new@example.com" && invites[0].community_id === C1, invites[0])
    check("the invite email carries the event and its signature", Boolean(link) && link?.payload?.eventId === E_PAID && /^[0-9a-f]{32}$/.test(String(link?.payload?.eventTag)), link?.payload)
    check("a free event has no seat to give, and says so", (await inviteToEvent(db as never, { community: community(), eventId: E_FREE, actorId: STAFF, input: { userIds: [MARA] }, enabled: true })).ok === false)
  }

  /* ── The signed event on an invite link ───────────────────────────────── */
  console.log("\nThe event on an invite link is signed")
  {
    const env = { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-the-test" }
    const token = "abcdefghijklmnopqrstuvwxyz012345"
    const tag = eventInviteTag(token, E_PAID, env)
    check("a tag is made for one token and one event", /^[0-9a-f]{32}$/.test(String(tag)) && verifyEventInviteTag(token, E_PAID, tag, env))
    check("it does not hold for another event", !verifyEventInviteTag(token, E_FREE, tag, env))
    check("it does not hold for another invite", !verifyEventInviteTag("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", E_PAID, tag, env))
    check("a made up tag is refused", !verifyEventInviteTag(token, E_PAID, "f".repeat(32), env) && !verifyEventInviteTag(token, E_PAID, "nope", env))
    check("the link carries both", eventInviteQuery(token, E_PAID, env) === `&event=${E_PAID}&et=${tag}`)
    check("no key, no event on the link", eventInviteQuery(token, E_PAID, { SUPABASE_SERVICE_ROLE_KEY: "" }) === "")
  }
  {
    /* THE LINK USED TWICE: one ticket, one email, and the event page either way. */
    resetTicketsReady()
    setPushBridgeDeps(deps([]))
    const token = "abcdefghijklmnopqrstuvwxyz012345"
    const tag = eventInviteTag(token, E_PAID)
    const state = { tickets: new Map<string, string>() }
    const db = pg(world(), { users: users(), rpc: { community_event_ticket_grant: grantRpc(state) } })
    const once = await grantTicketOnJoin(db as never, { community: community(), userId: DAN, token, eventId: E_PAID, tag, enabled: true })
    const twice = await grantTicketOnJoin(db as never, { community: community(), userId: DAN, token, eventId: E_PAID, tag, enabled: true })
    const mail = emailsOf(db).filter((e) => e.to === "dan@example.com")
    check("joining through the link grants the seat and lands on the event", once?.url === `/community/film-loft/events/${E_PAID}`, once)
    check("the same link again grants nothing new and sends nothing", twice?.url === once?.url && state.tickets.size === 1 && mail.length === 1, { tickets: state.tickets.size, mail: mail.length })
    const forged = await grantTicketOnJoin(db as never, { community: community(), userId: IOANA, token, eventId: E_FREE, tag, enabled: true })
    check("an event moved onto the link is refused", forged === null && state.tickets.size === 1)
  }

  /* ── Money back ───────────────────────────────────────────────────────── */
  console.log("\nMoney back, said once")
  {
    resetTicketsReady()
    setPushBridgeDeps(deps([]))
    const db = pg(world(), { users: users() })
    await ticketRefundedNotice(db as never, { communityId: C1, eventId: E_PAID, ticketId: TICKET, userId: MARA, amountCents: 2500, currency: "usd", byHolder: true, enabled: true })
    const mail = emailsOf(db).filter((e) => e.to === "mara@example.com")
    check("a refund is one email about what came back", mail.length === 1 && mail[0].name === "community.event_refund" && mail[0].payload?.amountCents === 2500, mail[0]?.payload)
    check("and one row that says it", rowsOf(db).filter((r) => r.user_id === MARA && String(r.title).includes("refunded")).length === 1, rowsOf(db)[0])
  }
  {
    resetTicketsReady()
    setPushBridgeDeps(deps([]))
    const db = pg(world(), { users: users() })
    await ticketRefundedNotice(db as never, { communityId: C1, eventId: E_PAID, ticketId: TICKET, userId: MARA, amountCents: 2500, currency: "usd", because: "event_cancelled", enabled: true })
    const mail = emailsOf(db).filter((e) => e.to === "mara@example.com")
    check("an event called off is one message, cancelled and refunded together", mail.length === 1 && mail[0].name === "community.event_cancelled" && mail[0].payload?.amountCents === 2500, mail.map((m) => m.name))
    check("never a refund email beside it", !mail.some((m) => m.name === "community.event_refund"))
    const notice = await ticketNoticeContext(db as never, C1, E_PAID)
    check("the same message from the fan out keeps the same keys, so it goes once", notice !== null && (await cancelledHolderNotice(db as never, notice!, { userId: MARA, amountCents: 2500, currency: "usd", enabled: true })) === "sent" && emailsOf(db).filter((e) => e.to === "mara@example.com").length === 1)
    check("and one row about it", rowsOf(db).filter((r) => r.user_id === MARA).length === 1, rowsOf(db).length)
  }

  /* ── The emails themselves ────────────────────────────────────────────── */
  console.log("\nWhat the four emails say")
  {
    const types = ["COMMUNITY_EVENT_TICKET", "COMMUNITY_EVENT_TICKET_INVITE", "COMMUNITY_EVENT_REFUND", "COMMUNITY_EVENT_CANCELLED"] as const
    for (const t of types) {
      check(`${t} is money: always an email, no unsubscribe, to the person who paid`, emailClass(t) === "essential" && emailAllowed(t) && REGISTRY[t].requirement === "required_service" && REGISTRY[t].recipient === "customer")
    }
    const events = ["community.event_ticket", "community.event_ticket_invite", "community.event_refund", "community.event_cancelled"]
    for (const name of events) {
      const plan = communitiesWorkflow(
        { name, key: `k:${name}`, userId: MARA, entityType: "community", entityId: C1, payload: { recipientEmail: "mara@example.com", communityId: C1 }, occurredAt: new Date().toISOString(), correlationId: null } as never,
        { now: Date.now() } as never,
      )
      check(`${name} plans its email`, Boolean(plan && plan.jobs.length === 1), plan)
    }
    const ctxEmail = { baseUrl: "https://storelib.com", recipientName: "Mara Pop", unsubscribeUrl: null, preferencesUrl: null, when: null }
    const data = {
      communityId: C1,
      communityName: "Film Loft",
      communitySlug: "film-loft",
      creatorName: "Owen Marin",
      eventId: E_PAID,
      eventTitle: "Darkroom night",
      startsAt: STARTS,
      endsAt: "",
      timezone: "Europe/Bucharest",
      location: "",
      online: true,
      amountCents: 2500,
      currency: "usd",
      eventUpdatedAt: STARTS,
      eventDescription: "Two hours in the darkroom.",
      refundPolicy: "Refunds up to 24 hours before.",
      ticketSource: "purchase",
    }
    const receipt = renderEmail("COMMUNITY_EVENT_TICKET", data, ctxEmail as never)
    check("the receipt names the event, the money and the page", /Darkroom night/.test(receipt.html) && /\$25/.test(receipt.html) && receipt.html.includes(`https://storelib.com/community/film-loft/events/${E_PAID}`))
    check("its subject is about their ticket", receipt.subject === "Your ticket for Darkroom night", receipt.subject)
    check("the refund words are in it", /Refunds up to 24 hours before\./.test(receipt.text))
    const file = receipt.attachments?.[0]
    const ics = file ? Buffer.from(file.content).toString("utf8") : ""
    /* A long line is folded at 75 bytes, the way the format asks, so it is joined up again to be read. */
    const flat = ics.replace(/\r\n /g, "")
    check("and the event is attached as a calendar file", Boolean(file) && file!.filename === "Darkroom-night.ics" && file!.contentType.startsWith("text/calendar") && ics.startsWith("BEGIN:VCALENDAR"), file?.filename)
    check("the calendar file holds the event page and never the meeting link", flat.includes(`URL:https://storelib.com/community/film-loft/events/${E_PAID}`) && !flat.includes("meet.example.com"), flat.split("\r\n").find((l) => l.startsWith("URL")))
    check("it says when, in one line per field", /DTSTART:20261120T180000Z/.test(ics) && /SUMMARY:Darkroom night/.test(ics), ics.split("\r\n").find((l) => l.startsWith("DTSTART")))
    const invited = renderEmail("COMMUNITY_EVENT_TICKET_INVITE", { ...data, amountCents: undefined, priceCents: 2500, inviterName: "Sam Petre" }, ctxEmail as never)
    check("an invited seat names who gave it and what a ticket costs", /Sam Petre/.test(invited.html) && /\$25/.test(invited.html) && Boolean(invited.attachments?.length))
    check("and never says they paid", !/You paid/.test(invited.html + invited.text))
    const refund = renderEmail("COMMUNITY_EVENT_REFUND", { ...data, byHolder: true }, ctxEmail as never)
    check("a refund says what came back and how long a card takes", /\$25/.test(refund.html) && /five to ten days/.test(refund.text) && !refund.attachments?.length)
    const off = renderEmail("COMMUNITY_EVENT_CANCELLED", data, ctxEmail as never)
    check("a cancelled event says both things in one email", /cancelled/i.test(off.subject) && /\$25/.test(off.html) && /goes back to the card/.test(off.text))
    const invite = renderEmail("COMMUNITY_INVITE", { communityName: "Film Loft", communitySlug: "film-loft", inviteCode: "tok123456789012345678", eventId: E_PAID, eventTag: "a".repeat(32), eventTitle: "Darkroom night" }, ctxEmail as never)
    check("a community invite made for an event carries it in the link", invite.html.replace(/&amp;/g, "&").includes(`/community/film-loft/join?invite=tok123456789012345678&event=${E_PAID}&et=${"a".repeat(32)}`) && /free ticket/i.test(invite.html))
    for (const m of [receipt, invited, refund, off]) {
      check("the email is plain, with a text part and no script", m.text.trim().length > 80 && !/<script|onclick=/i.test(m.html))
    }
  }

  /* ── How a ticket reaches a phone ─────────────────────────────────────── */
  console.log("\nA ticket on a phone")
  {
    check("a ticket pushes at once", (IMMEDIATE_KINDS as readonly string[]).includes("ticket") && pushPriority("ticket") === "now")
    check("it counts as addressed to them, so Only mentions still hears it", (ADDRESSED_KINDS as readonly string[]).includes("ticket"))
    check("and the daily cap never holds it", CAP_EXEMPT_KINDS.includes("ticket"))
    check("a sale is not cap exempt, because it is grouped", !CAP_EXEMPT_KINDS.includes("ticket_sale"))
  }

  /* ── The route and the copy ───────────────────────────────────────────── */
  console.log("\nThe invite route")
  {
    const route = code("app/api/community/[communityId]/events/[eventId]/invite/route.ts")
    check("it answers { invited, failed, notMembers }", /NextResponse\.json\(result\.answer/.test(route) && /inviteToEvent\(db, \{ community: gate\.community/.test(route))
    check("only staff who may price events may give seats", /requireMember\(db, communityId, userId, "price_events"\)/.test(route))
    check("and it is rate limited before anything is granted", route.indexOf("rateLimit(") < route.indexOf("inviteToEvent(") && /rateBucket\("invite"\)/.test(route))
    check("the switch is the first thing it asks", route.indexOf("requireCommunitiesOn()") < route.indexOf("requireMember("))
    const redeem = code("app/api/community/[communityId]/invite/redeem/route.ts")
    check("the redeem route checks the signature before granting a seat", /grantTicketOnJoin\(admin\(\), \{ community, userId: user\.id, token: body\.token, eventId: body\.event, tag: body\.et, enabled: true \}\)/.test(redeem))
    const landing = code("components/community/member/invite-landing.tsx")
    check("the landing sends the event on and follows the answer's page", /body: eventId && eventTag \? \{ token, event: eventId, et: eventTag \} : \{ token \}/.test(landing) && /r\.data\.url/.test(landing))
    for (const f of [
      "lib/communities/server/jobs/event_ticket_notify.ts",
      "lib/communities/server/jobs/event_ticket_invite.ts",
      "lib/communities/server/jobs/event_reminder.ts",
      "lib/communities/server/jobs/fanout_event.ts",
      "lib/communities/server/notify.ts",
      "lib/notifications/push-bridge.ts",
      "app/api/community/[communityId]/events/[eventId]/invite/route.ts",
    ]) {
      const t = read(f)
      check(`${f}: no em dashes, none of the banned words`, !/[—–]/.test(t) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(t))
    }
  }

  setPushBridgeDeps(null)
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
