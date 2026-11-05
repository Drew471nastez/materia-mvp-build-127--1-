import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S TICKETS, PROGRAMS AND MODULES, AS ANALYTICS' ORDERS (r52)
 * ===========================================================================
 * An event ticket, a program and a single module are paid through their own
 * checkouts (lib/communities/server/event-checkout, learn-checkout,
 * module-sales) and kept on their own rows, never in `orders`. Community
 * Analytics counted them (lib/communities/server/analytics-report moneyOf);
 * /app/analytics and Home's chart, which count `orders`, did not, so the
 * three screens gave three revenues for one store.
 *
 * READ WHERE THEY ARE, NOT COPIED INTO `orders`. Writing them as orders as
 * well would put them on the Orders page, its export, receipts, customers
 * and the refund buttons of an order (a second way to refund one payment),
 * would need every old sale backfilled, and every checkout to write twice
 * and stay in step forever, refunds included. Here they are read, by the
 * rule Community Analytics uses, and handed to the reports as order rows:
 *
 *   ticket    community_event_tickets, bought (source purchase) and paid
 *             (paid_at); refunded_at is its refund, in full
 *   program   community_program_access and community_module_access, bought
 *             (source purchase); revoked_at is the full refund that took it
 *             back
 *
 * Each becomes one payment of its own (no stripe session, so never grouped
 * with an order), dated by its sale, its refund dated by the refund
 * (lib/analytics/refund-dates), in its own currency, converted with the
 * orders (report-read readOrders). Ids and product keys start with
 * "community-", which no order or product id does (they are uuids), so
 * nothing is counted twice and the Downloads read leaves them out.
 *
 * Only the creator's own communities, found by the creator, never the
 * request. A database without a table reads as no sales of that kind.
 */
import type { createAdminClient } from "@/lib/supabase/admin"
import type { OrderRow } from "@/lib/orders/order-view"

type Admin = ReturnType<typeof createAdminClient>
type Span = { start: number; end: number }

const PAGE = 1000
const MAX_PAGES = 50
const DAY = 86_400_000

/** Every key this file makes begins so: an order's and a product's are uuids. */
export const COMMUNITY_SALE_PREFIX = "community-"
export const isCommunitySale = (id: string | null | undefined) => typeof id === "string" && id.startsWith(COMMUNITY_SALE_PREFIX)

export interface CommunitySales {
  rows: OrderRow[]
  /** What each sold thing is called, for Top products: the event's or program's title. */
  titles: Record<string, string>
  /** Its kind, for By kind: a program is a course, a ticket another kind. */
  types: Record<string, string | null>
}

const NONE: CommunitySales = { rows: [], titles: {}, types: {} }

const iso = (t: number) => new Date(t).toISOString()
const upper = (c: string | null | undefined) => (typeof c === "string" && /^[a-z]{3}$/i.test(c.trim()) ? c.trim().toUpperCase() : null)

/** Every row of one read, a page at a time by `key`, in order. Null when the table cannot be read. */
async function every<T extends Record<string, unknown>>(read: (from: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | null> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await read(page * PAGE)
    if (error) return page === 0 ? null : out
    const rows = ((data as T[] | null) ?? [])
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** Sold, or given back, inside [from, to): each kind's sale date and refund date, read as two reads and joined once. */
async function soldOrBack<T extends Record<string, unknown>>(
  read: (dateColumn: string, from: string, to: string, offset: number) => PromiseLike<{ data: unknown; error: unknown }>,
  saleColumn: string,
  backColumn: string,
  from: string,
  to: string,
  keyOf: (r: T) => string,
): Promise<T[] | null> {
  const [sold, back] = await Promise.all([every<T>((o) => read(saleColumn, from, to, o)), every<T>((o) => read(backColumn, from, to, o))])
  if (sold === null && back === null) return null
  const seen = new Map<string, T>()
  for (const r of [...(sold ?? []), ...(back ?? [])]) seen.set(keyOf(r), r)
  return [...seen.values()]
}

type TicketRow = { id: string; event_id: string; community_id: string; amount_cents: number | null; currency: string | null; paid_at: string | null; refunded_at: string | null }
type AccessRow = { program_id: string | null; module_id?: string | null; user_id: string; community_id: string; amount_cents: number | null; currency: string | null; created_at: string; revoked_at: string | null }

/**
 * The creator's community sales made or refunded inside `spans` (a day
 * either side, as orders are read: report-read orderSpans), as order rows.
 * `spans` absent is all time.
 */
export async function readCommunitySales(admin: Admin, creatorId: string, spans?: Span[]): Promise<CommunitySales> {
  try {
    const { data: communities, error } = await admin.from("communities").select("id, name").eq("creator_id", creatorId).limit(500)
    if (error || !communities?.length) return NONE
    const ids = (communities as { id: string }[]).map((c) => String(c.id))
    const from = spans?.length ? iso(Math.min(...spans.map((s) => s.start)) - DAY) : "1970-01-01T00:00:00.000Z"
    const to = spans?.length ? iso(Math.max(...spans.map((s) => s.end)) + DAY) : iso(Date.now() + DAY)

    const [tickets, programs, modules] = await Promise.all([
      soldOrBack<TicketRow>(
        (column, a, b, offset) =>
          admin.from("community_event_tickets").select("id, event_id, community_id, amount_cents, currency, paid_at, refunded_at").in("community_id", ids).eq("source", "purchase").gte(column, a).lt(column, b).order("id", { ascending: true }).range(offset, offset + PAGE - 1),
        "paid_at",
        "refunded_at",
        from,
        to,
        (r) => r.id,
      ),
      soldOrBack<AccessRow>(
        (column, a, b, offset) =>
          admin.from("community_program_access").select("program_id, user_id, community_id, amount_cents, currency, created_at, revoked_at").in("community_id", ids).eq("source", "purchase").gte(column, a).lt(column, b).order("created_at", { ascending: true }).range(offset, offset + PAGE - 1),
        "created_at",
        "revoked_at",
        from,
        to,
        (r) => `${r.program_id}:${r.user_id}`,
      ),
      soldOrBack<AccessRow>(
        (column, a, b, offset) =>
          admin.from("community_module_access").select("module_id, program_id, user_id, community_id, amount_cents, currency, created_at, revoked_at").in("community_id", ids).eq("source", "purchase").gte(column, a).lt(column, b).order("created_at", { ascending: true }).range(offset, offset + PAGE - 1),
        "created_at",
        "revoked_at",
        from,
        to,
        (r) => `${r.module_id}:${r.user_id}`,
      ),
    ])

    const rows: OrderRow[] = []
    const row = (id: string, product: string, cents: number | null, currency: string | null, at: string, back: string | null): OrderRow => {
      const amount = Math.max(0, Number(cents) || 0)
      return {
        id,
        product_id: product,
        amount_cents: amount,
        status: back ? "refunded" : "completed",
        refund_amount_cents: back ? amount : null,
        refunded_at: back,
        created_at: at,
        currency: upper(currency),
        quantity: 1,
        source: "community",
      } as OrderRow
    }
    for (const t of tickets ?? []) {
      /* A seat held and never paid is no sale; one given away is free (source invite or grant, not read). */
      if (!t.paid_at) continue
      rows.push(row(`${COMMUNITY_SALE_PREFIX}ticket:${t.id}`, `${COMMUNITY_SALE_PREFIX}event:${t.event_id}`, t.amount_cents, t.currency, t.paid_at, t.refunded_at))
    }
    for (const p of programs ?? []) {
      if (!p.program_id) continue
      rows.push(row(`${COMMUNITY_SALE_PREFIX}program:${p.program_id}:${p.user_id}`, `${COMMUNITY_SALE_PREFIX}program:${p.program_id}`, p.amount_cents, p.currency, p.created_at, p.revoked_at))
    }
    for (const m of modules ?? []) {
      if (!m.module_id) continue
      rows.push(row(`${COMMUNITY_SALE_PREFIX}module:${m.module_id}:${m.user_id}`, `${COMMUNITY_SALE_PREFIX}module:${m.module_id}`, m.amount_cents, m.currency, m.created_at, m.revoked_at))
    }
    /* Nothing paid: no titles to read. */
    const sold = rows.filter((r) => r.amount_cents > 0)
    if (!sold.length) return NONE
    return { rows: sold, ...(await namesOf(admin, sold)) }
  } catch (error) {
    console.warn("[analytics] community sales not read:", (error as Error).message)
    return NONE
  }
}

/** The titles the sold things go by: the event's, the program's, the module's. A title not found reads by its kind. */
async function namesOf(admin: Admin, rows: OrderRow[]): Promise<{ titles: Record<string, string>; types: Record<string, string | null> }> {
  const keys = [...new Set(rows.map((r) => r.product_id))]
  const idsOf = (kind: string) => keys.filter((k) => k.startsWith(`${COMMUNITY_SALE_PREFIX}${kind}:`)).map((k) => k.slice(`${COMMUNITY_SALE_PREFIX}${kind}:`.length))
  const titled = async (table: string, ids: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await admin.from(table).select("id, title").in("id", ids.slice(i, i + 200))
      if (error) break
      for (const r of (data as { id: string; title: string | null }[] | null) ?? []) if (r.title?.trim()) out.set(String(r.id), r.title.trim())
    }
    return out
  }
  const [events, programs, modules] = await Promise.all([titled("community_events", idsOf("event")), titled("community_courses", idsOf("program")), titled("course_modules", idsOf("module"))])
  const titles: Record<string, string> = {}
  const types: Record<string, string | null> = {}
  for (const id of idsOf("event")) {
    titles[`${COMMUNITY_SALE_PREFIX}event:${id}`] = events.get(id) ?? "Event ticket"
    types[`${COMMUNITY_SALE_PREFIX}event:${id}`] = "event"
  }
  for (const id of idsOf("program")) {
    titles[`${COMMUNITY_SALE_PREFIX}program:${id}`] = programs.get(id) ?? "Program"
    types[`${COMMUNITY_SALE_PREFIX}program:${id}`] = "course"
  }
  for (const id of idsOf("module")) {
    titles[`${COMMUNITY_SALE_PREFIX}module:${id}`] = modules.get(id) ?? "Module"
    types[`${COMMUNITY_SALE_PREFIX}module:${id}`] = "course"
  }
  return { titles, types }
}
