/**
 * ===========================================================================
 *  THE ENGINE'S READS AND WRITES, AGAINST A STAND-IN FOR POSTGREST
 * ===========================================================================
 * lib/notifications/snapshot.ts reads a batch of creators with a few queries
 * per kind of data; lib/notifications/supabase-store.ts writes rows once per
 * dedupe key. This file runs both against a small in-memory PostgREST (the
 * filters, orders, ranges, head counts, embedded !inner joins and upserts
 * they use, and nothing kinder), with fixture rows for three creators, and
 * checks what each rule would be handed, then runs the whole engine on it.
 *
 *   - every part of a snapshot comes out as the rows say
 *   - a table that is not there leaves its part unknown, not empty
 *   - a creator whose milestones are all recorded is not read for sales
 *   - the engine against it: rows once, a second run writes nothing
 *   - before the SQL (no claim function): nothing is read or written
 *   - what getting paid is decided from: onboarding, the plan's payment,
 *     each product's price, the website in the builder; and a database
 *     without one of those columns still gives every other rule its creator
 */
import { ALL_PARTS, runNotificationEngine } from "@/lib/notifications/engine"
import { supabaseSnapshots } from "@/lib/notifications/snapshot"
import { supabaseNotificationStore } from "@/lib/notifications/supabase-store"
import { domainHttps } from "@/lib/notifications/rules/domains"
import { payoutsNotConnected, proPaymentFailed } from "@/lib/notifications/rules/payments"
import { websiteNotPublished } from "@/lib/notifications/rules/setup"
import type { ExistingRow } from "@/lib/notifications/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

/* ─── A small PostgREST ─────────────────────────────────────────────── */

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Filter = (r: Row) => boolean

const get = (r: Row, path: string) => path.split(".").reduce((v: any, k) => (v == null ? v : v[k]), r) // eslint-disable-line @typescript-eslint/no-explicit-any
const cmp = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : String(a) < String(b) ? -1 : 1)

function orFilter(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".")
    const val = rest.join(".").replace(/^"(.*)"$/, "$1")
    return (r: Row) => {
      const v = r[col]
      if (op === "is") return val === "null" ? v === null || v === undefined : String(v) === val
      if (op === "eq") return String(v) === val
      if (op === "gte") return v != null && String(v) >= val
      return false
    }
  })
  return (r) => parts.some((f) => f(r))
}

class Query {
  filters: Filter[] = []
  orders: Array<{ col: string; asc: boolean }> = []
  from = 0
  to = Number.POSITIVE_INFINITY
  mode: "select" | "update" | "upsert" | "insert" = "select"
  head = false
  counted = false
  patch: Row | null = null
  payload: Row[] = []
  conflict: string[] = []
  ignoreDup = false
  returning = false
  embed: { table: string; fk: string; inner: boolean; cols: string[] } | null = null
  cols: string[] = []
  constructor(public db: FakeDb, public table: string) {}
  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "select") this.returning = true
    this.head = !!opts?.head
    this.counted = !!opts?.count
    this.cols = cols.replace(/\w+!inner\([^)]*\)/g, "").split(",").map((c) => c.trim()).filter(Boolean)
    const m = /(\w+)!inner\(([^)]*)\)/.exec(cols)
    if (m) this.embed = { table: m[1], fk: "product_id", inner: true, cols: m[2].split(",").map((c) => c.trim()) }
    return this
  }
  eq(c: string, v: unknown) { this.filters.push((r) => get(r, c) === v); return this }
  neq(c: string, v: unknown) { this.filters.push((r) => get(r, c) !== v); return this }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(get(r, c))); return this }
  gte(c: string, v: string) { this.filters.push((r) => get(r, c) != null && String(get(r, c)) >= v); return this }
  gt(c: string, v: string) { this.filters.push((r) => get(r, c) != null && String(get(r, c)) > v); return this }
  lt(c: string, v: string) { this.filters.push((r) => get(r, c) != null && String(get(r, c)) < v); return this }
  lte(c: string, v: string) { this.filters.push((r) => get(r, c) != null && String(get(r, c)) <= v); return this }
  is(c: string, v: null | boolean) { this.filters.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)); return this }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (v === null ? get(r, c) != null : get(r, c) !== v))
    else if (op === "in") { const list = String(v).replace(/[()]/g, "").split(","); this.filters.push((r) => !list.includes(String(get(r, c)))) }
    return this
  }
  or(expr: string) { this.filters.push(orFilter(expr)); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push({ col: c, asc: o?.ascending !== false }); return this }
  range(a: number, b: number) { this.from = a; this.to = b; return this }
  limit(n: number) { this.to = this.from + n - 1; return this }
  update(p: Row) { this.mode = "update"; this.patch = p; return this }
  upsert(p: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.mode = "upsert"; this.payload = Array.isArray(p) ? p : [p]; this.conflict = (o?.onConflict ?? "id").split(","); this.ignoreDup = !!o?.ignoreDuplicates; return this }
  insert(p: Row | Row[]) { this.mode = "insert"; this.payload = Array.isArray(p) ? p : [p]; return this }
  run(): { data: unknown; error: { code: string } | null; count?: number } {
    const rows = this.db.tables[this.table]
    if (!rows) return { data: null, error: { code: "42P01" } }
    /* A column this database does not have, asked for by name: Postgres's "undefined column". */
    if (this.mode === "select" && (this.db.missing[this.table] ?? []).some((c) => this.cols.includes(c))) return { data: null, error: { code: "42703" } }
    if (this.mode === "upsert" || this.mode === "insert") {
      const out: Row[] = []
      for (const p of this.payload) {
        for (const col of Object.keys(p)) if (this.db.columns[this.table] && !this.db.columns[this.table].includes(col)) return { data: null, error: { code: "PGRST204" } }
        const clash = this.conflict.length && rows.find((r) => this.conflict.every((c) => r[c] != null && r[c] === p[c]))
        if (clash) {
          if (this.mode === "insert") return { data: null, error: { code: "23505" } }
          if (!this.ignoreDup) Object.assign(clash, p)
          continue
        }
        const row = { id: `${this.table}-${++this.db.seq}`, ...p }
        rows.push(row)
        out.push(row)
      }
      return { data: this.returning ? out : null, error: null }
    }
    let hit = rows.map((r) => (this.embed ? { ...r, [this.embed.table]: this.db.tables[this.embed.table].find((x) => x.id === r[this.embed!.fk]) ?? null } : r))
    if (this.embed?.inner) hit = hit.filter((r) => r[this.embed!.table])
    hit = hit.filter((r) => this.filters.every((f) => f(r)))
    if (this.mode === "update") {
      for (const col of Object.keys(this.patch!)) if (this.db.columns[this.table] && !this.db.columns[this.table].includes(col)) return { data: null, error: { code: "PGRST204" } }
      const ids = new Set(hit.map((r) => r.id ?? r.creator_id))
      const changed = rows.filter((r) => ids.has(r.id ?? r.creator_id))
      for (const r of changed) Object.assign(r, this.patch)
      return { data: this.returning ? changed.map((r) => ({ ...r })) : null, error: null }
    }
    for (const o of [...this.orders].reverse()) hit.sort((a, b) => (o.asc ? 1 : -1) * cmp(get(a, o.col), get(b, o.col)))
    const count = hit.length
    const page = hit.slice(this.from, Number.isFinite(this.to) ? this.to + 1 : undefined)
    this.db.reads.push(this.table)
    return { data: this.head ? null : page.map((r) => ({ ...r })), error: null, count: this.counted ? count : undefined }
  }
  then<T>(resolve: (v: ReturnType<Query["run"]>) => T, reject?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject)
  }
}

class FakeDb {
  seq = 0
  reads: string[] = []
  claimable = true
  columns: Record<string, string[]> = {}
  /* Columns a select may not name here, as on an older database. */
  missing: Record<string, string[]> = {}
  constructor(public tables: Record<string, Row[]>) {}
  from(t: string) { return new Query(this, t) }
  async rpc(fn: string, args: { p_limit: number }) {
    if (fn !== "notification_claim_creators" || !this.claimable) return { data: null, error: { code: "PGRST202" } }
    const state = this.tables.notification_creator_state
    for (const c of this.tables.creators) if (!state.some((s) => s.creator_id === c.id)) state.push({ creator_id: c.id, lease_until: null, evaluated_at: null })
    const free = state.filter((s) => !s.lease_until && !s.evaluated_at).slice(0, args.p_limit)
    for (const s of free) s.lease_until = "leased"
    return { data: free.map((s) => s.creator_id), error: null }
  }
}

/* ─── Fixture rows ─────────────────────────────────────────────────── */

const DAY = 86_400_000
const NOW = Date.parse("2026-09-25T12:00:00Z")
const ago = (d: number) => new Date(NOW - d * DAY).toISOString()
const day = (d: number) => ago(d).slice(0, 10)

function fixture(): Record<string, Row[]> {
  return {
    creators: [
      { id: "c1", user_id: "u1", created_at: ago(200), stripe_account_id: "acct_1", charges_enabled: true, payouts_enabled: false, details_submitted: true, bio: "Photographer", avatar_url: null },
      { id: "c2", user_id: "u2", created_at: ago(3), stripe_account_id: null, charges_enabled: null, payouts_enabled: null, details_submitted: null, bio: null, avatar_url: null },
      { id: "c3", user_id: "u3", created_at: ago(90), stripe_account_id: "acct_3", charges_enabled: true, payouts_enabled: true, details_submitted: true, bio: "x", avatar_url: "a.png" },
    ],
    profiles: [
      { id: "u1", avatar_url: "me.png", timezone: "Europe/Bucharest" },
      { id: "u2", avatar_url: null, timezone: "Not/AZone" },
      { id: "u3", avatar_url: null },
    ],
    onepages: [{ owner_id: "u2", avatar_url: null, bio: "hi" }],
    products: [
      { id: "p1", creator_id: "c1", title: "Lightroom presets", status: "published", type: "digital", created_at: ago(100) },
      { id: "p2", creator_id: "c1", title: "Portrait course", status: "published", type: "digital", created_at: ago(60) },
      { id: "p3", creator_id: "c1", title: "Draft", status: "draft", type: "digital", created_at: ago(5) },
      { id: "p4", creator_id: "c3", title: "Coaching", status: "published", type: "course", created_at: ago(40) },
    ],
    digital_assets: [
      { id: "a1", product_id: "p1", file_path: "x/p1.zip", upload_status: "completed", scan_status: "clean" },
      { id: "a2", product_id: "p2", file_path: "x/p2.zip", upload_status: "completed", scan_status: "infected" },
    ],
    payouts: [
      { creator_id: "c1", stripe_payout_id: "po_old", status: "failed", amount_cents: 500, currency: "usd", created_at: ago(40), failure_code: "declined" },
      { creator_id: "c1", stripe_payout_id: "po_1", status: "failed", amount_cents: 18420, currency: "usd", created_at: ago(2), failure_code: "no_account" },
      { creator_id: "c3", stripe_payout_id: "po_3", status: "paid", amount_cents: 900, currency: "usd", created_at: ago(1), failure_code: null },
    ],
    ledger_events: [
      { id: "l1", creator_id: "c1", event_type: "dispute_created", stripe_dispute_id: "dp_1", amount_cents: 2400, currency: "usd", created_at: ago(3) },
      { id: "l2", creator_id: "c1", event_type: "dispute_created", stripe_dispute_id: "dp_2", amount_cents: 900, currency: "usd", created_at: ago(9) },
      { id: "l3", creator_id: "c1", event_type: "dispute_closed", stripe_dispute_id: "dp_2", amount_cents: 900, currency: "usd", created_at: ago(1) },
      { id: "l4", creator_id: "c1", event_type: "sale", stripe_dispute_id: null, amount_cents: 1, currency: "usd", created_at: ago(1) },
    ],
    custom_domains: [{ id: "d1", creator_id: "c3", domain: "shop.example.com", status: "ssl_provisioning", ssl_status: "provisioning", verified_at: ago(2), created_at: ago(3), updated_at: ago(2) }],
    email_campaigns: [
      { id: "e1", creator_id: "c1", subject: "Autumn sale", status: "failed", scheduled_at: ago(1), created_at: ago(2), sent_at: null },
      { id: "e2", creator_id: "c1", subject: "Hello", status: "sent", scheduled_at: null, created_at: ago(10), sent_at: ago(10) },
      { id: "e3", creator_id: "c3", subject: "Old", status: "sent", scheduled_at: null, created_at: ago(80), sent_at: ago(80) },
    ],
    campaign_recipients: [
      ...Array.from({ length: 120 }, (_, i) => ({ id: `cr${i}`, creator_id: "c1", status: i < 10 ? "bounced" : i < 11 ? "complained" : "delivered", created_at: ago(10) })),
      { id: "crx", creator_id: "c1", status: "failed", created_at: ago(10) },
    ],
    subscribers: [
      ...Array.from({ length: 52 }, (_, i) => ({ id: `s${i}`, creator_id: "c1", status: "subscribed", is_active: true, created_at: i < 45 ? ago(30) : ago(2) })),
      { id: "sx", creator_id: "c1", status: "unsubscribed", is_active: false, created_at: ago(1) },
      { id: "sy", creator_id: "c3", status: "subscribed", is_active: null, created_at: ago(10) },
    ],
    orders: [
      { id: "o1", product_id: "p1", amount_cents: 1200, status: "completed", created_at: ago(1), stripe_session_id: "cs_1", refund_amount_cents: 0, currency: "usd" },
      { id: "o2", product_id: "p2", amount_cents: 3000, status: "completed", created_at: ago(1), stripe_session_id: "cs_1", refund_amount_cents: 0, currency: "usd" },
      { id: "o3", product_id: "p1", amount_cents: 1200, status: "failed", created_at: ago(0.5), stripe_session_id: "cs_2", refund_amount_cents: 0, currency: "usd" },
      { id: "o4", product_id: "p4", amount_cents: 5000, status: "completed", created_at: ago(20), stripe_session_id: null, refund_amount_cents: 0, currency: "usd" },
      { id: "o5", product_id: "p4", amount_cents: 5000, status: "completed", created_at: ago(2), stripe_session_id: "cs_5", refund_amount_cents: 0, currency: "usd", buyer_email: "buyer@example.com", buyer_email_last_error: "550 mailbox unavailable", buyer_notified_at: null },
      { id: "o6", product_id: "p4", amount_cents: 900, status: "completed", created_at: ago(2), stripe_session_id: "cs_5", refund_amount_cents: 0, currency: "usd", buyer_email: "buyer@example.com", buyer_email_last_error: "550 mailbox unavailable", buyer_notified_at: null },
      { id: "o7", product_id: "p4", amount_cents: 900, status: "completed", created_at: ago(3), stripe_session_id: null, refund_amount_cents: 0, currency: "usd", buyer_email_last_error: "timeout", buyer_notified_at: ago(1) },
    ],
    analytics_daily_rollups: [
      ...Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, creator_id: "c1", product_id: "p2", total_views: 20, total_orders: 0, rollup_date: day(i + 1) })),
      { id: "rt", creator_id: "c1", product_id: "p2", total_views: 999, total_orders: 0, rollup_date: day(0) },
      { id: "rs", creator_id: "c1", product_id: null, total_views: 999, total_orders: 0, rollup_date: day(2) },
    ],
    checkout_starts: [
      ...["a", "b", "c", "c"].map((e, i) => ({ id: `cs${i}`, creator_id: "c3", email: `${e}@example.com`, created_at: new Date(NOW - (3 + i) * 3_600_000).toISOString(), outcome: null })),
      ...[1, 2, 3, 4].map((i) => ({ id: `ce${i}`, creator_id: "c1", email: `x${i}@example.com`, created_at: ago(i), outcome: "entered" })),
    ],
    email_flows: [{ id: "f1", creator_id: "c1", trigger_type: "abandoned_checkout", status: "paused" }],
    coupons: [
      { id: "k1", creator_id: "c1", code: "AUTUMN10", expires_at: new Date(NOW + 2 * DAY).toISOString(), usage_count: 14, usage_limit: null, is_active: true },
      { id: "k2", creator_id: "c1", code: "LATER", expires_at: new Date(NOW + 20 * DAY).toISOString(), usage_count: 3, usage_limit: null, is_active: true },
    ],
    reviews: [
      { id: "rv1", creator_id: "c3", product_id: "p4", rating: 5, created_at: ago(2) },
      { id: "rv2", creator_id: "c1", product_id: "p1", rating: 4, created_at: ago(2) },
      { id: "rv3", creator_id: "c1", product_id: "p1", rating: 5, created_at: ago(300) },
    ],
    seller_notifications: [],
    notification_creator_state: [],
  }
}

/* No network in a test: a domain that is asked never answers, unless a case says it does. */
const asked: string[] = []
const offline = async (host: string) => {
  asked.push(host)
  return false
}

async function main() {
  console.log("\nA batch read into snapshots")
  const db = new FakeDb(fixture())
  const snaps = await supabaseSnapshots(db, { probeHttps: offline }).load(["c1", "c2", "c3"], ALL_PARTS, new Map(), NOW)
  const c1 = snaps.get("c1")!
  const c2 = snaps.get("c2")!
  const c3 = snaps.get("c3")!
  check("the creator: Stripe as stored, the photo from the profile, the zone checked", c1.creator?.payoutsEnabled === false && c1.creator.hasAvatar && c1.creator.hasBio && c1.creator.timeZone === "Europe/Bucharest" && c2.creator?.timeZone === null && c2.creator.hasBio === true)
  check("products per creator, every status", c1.products?.map((p) => p.id).join() === "p1,p2,p3" && c2.products?.length === 0 && c3.products?.length === 1)
  check("a file flagged by the scan is not deliverable", c1.deliverable?.join() === "p1", c1.deliverable)
  check("payouts of the last 30 days", c1.payouts?.map((p) => p.id).join() === "po_1" && c1.payouts[0].failureCode === "no_account")
  check("disputes: one open, one closed", JSON.stringify(c1.disputes?.map((d) => [d.id, d.closed]).sort()) === JSON.stringify([["dp_1", false], ["dp_2", true]]), c1.disputes)
  check("domains as the verify route left them", c3.domains?.[0]?.status === "ssl_provisioning" && c1.domains?.length === 0)
  check("a domain whose row says it is stuck is asked over HTTPS itself, once", asked.join() === "shop.example.com" && c3.domains?.[0]?.httpsOk === false, { asked, httpsOk: c3.domains?.[0]?.httpsOk })
  {
    const answering = await supabaseSnapshots(new FakeDb(fixture()), { probeHttps: async () => true }).load(["c3"], new Set(["creator", "domains"]), new Map(), NOW)
    const d = answering.get("c3")!
    check("and when it answers, the row was only behind: no notification", d.domains?.[0]?.httpsOk === true && (domainHttps.evaluate(d) ?? []).length === 0)
  }
  check("a scheduled campaign that failed", c1.failedCampaigns?.map((c) => c.id).join() === "e1")
  check("the last send per creator, and never for one who has not", c1.lastCampaignSentAt === ago(10) && c3.lastCampaignSentAt === ago(80) && c2.lastCampaignSentAt === null)
  check("bounces counted for a creator who sent this month: 121 went out, 10 bounced, 1 complained", JSON.stringify(c1.emailHealth) === JSON.stringify({ wentOut: 120, bounced: 10, complained: 1 }), c1.emailHealth)
  check("and nothing counted for one who did not", c3.emailHealth?.wentOut === 0)
  check("subscribers: 52 now, 45 a week ago; the unsubscribed one is not counted", c1.subscribers?.count === 52 && c1.subscribers.countWeekAgo === 45, c1.subscribers)
  check("a subscriber with is_active unset counts", c3.subscribers?.count === 1)
  check("sales: a basket is one sale, a failed payment is none", c1.sales?.times.length === 1 && c1.sales.first?.amountCents === 4200 && c1.sales.truncated === false, c1.sales)
  check("the first sale's product", c1.sales?.first?.productTitle === "Lightroom presets")
  check("traffic: 14 whole days of rollups, today and the store line left out", c1.traffic?.views14.p2 === 280 && !("p1" in (c1.traffic?.views14 ?? {})), c1.traffic)
  check("a product sold yesterday is known, for the rollups that lag a day", c1.traffic?.soldRecently.join() === "p2", c1.traffic?.soldRecently)
  check("checkouts: 4 reached Pay from 3 people, and no order since", c3.checkout?.starts === 4 && c3.checkout.buyers === 3 && c3.checkout.orders === 0 && c3.checkout.soldBefore === true, c3.checkout)
  check("the checkout reminder: 4 people it could write to, the flow paused", c1.recovery?.recoverable === 4 && c1.recovery.reminderOn === false && c1.recovery.flowId === "f1", c1.recovery)
  check("coupons ending in the next three days only", c1.coupons?.map((c) => c.id).join() === "k1")
  check("a receipt that failed: one per basket, none once it has gone, and no address read", JSON.stringify(c3.undelivered?.map((o) => o.orderId)) === JSON.stringify(["o5"]) && c1.undelivered?.length === 0 && !JSON.stringify(c3).includes("buyer@"), c3.undelivered)
  check("the first review: new for c3, long ago for c1", c3.reviews?.firstRecent?.id === "rv1" && c3.reviews.olderExists === false && c3.reviews.firstRecent.productTitle === "Coaching" && c1.reviews?.olderExists === true, { c1: c1.reviews, c3: c3.reviews })

  console.log("\nWhat cannot be read stays unknown")
  {
    const t = fixture()
    delete (t as Record<string, unknown>).checkout_starts
    delete (t as Record<string, unknown>).email_flows
    delete (t as Record<string, unknown>).analytics_daily_rollups
    const s = await supabaseSnapshots(new FakeDb(t), { probeHttps: offline }).load(["c1"], ALL_PARTS, new Map(), NOW)
    const one = s.get("c1")!
    check("no started checkouts table: checkout and recovery unknown", one.checkout === undefined && one.recovery === undefined)
    check("no rollups: traffic unknown, not zero", one.traffic === undefined)
    check("the rest still read", one.payouts !== undefined && one.products !== undefined)
  }
  {
    /* A store with ten thousand products in the batch: the list hits its ceiling. */
    const t = fixture()
    t.products = [...t.products, ...Array.from({ length: 10_000 }, (_, i) => ({ id: `big${i}`, creator_id: "c3", title: `Pack ${i}`, status: "published", type: "digital", created_at: ago(30) }))]
    const s = await supabaseSnapshots(new FakeDb(t), { probeHttps: offline }).load(["c1", "c2", "c3"], new Set(["creator", "products", "files"]), new Map(), NOW)
    check("a batch whose product list hits its ceiling: the creator it could not finish is unknown, not empty", s.get("c3")?.products === undefined && s.get("c3")?.deliverable === undefined)
    check("and the creators before it are read whole, an empty one as empty", s.get("c1")?.products?.length === 3 && s.get("c2")?.products?.length === 0)
  }
  {
    const recorded: ExistingRow[] =["sales_1", "sales_10", "sales_100"].map((s, i) => ({ id: `x${i}`, creator_id: "c1", kind: "sales_milestone", category: "milestone", dedupe_key: `sales_milestone:${s}:`, subject_id: s, created_at: ago(100), read_at: null, dismissed_at: null, resolved_at: null, pushed_at: null, metadata: {} }))
    const d = new FakeDb(fixture())
    const s = await supabaseSnapshots(d, { probeHttps: offline }).load(["c1"], new Set(["creator", "sales"]), new Map([["c1", recorded]]), NOW)
    check("every sales milestone recorded: orders are not read at all", !d.reads.includes("orders") && s.get("c1")?.sales?.truncated === true, d.reads)
  }

  console.log("\nWhat getting paid is decided from")
  {
    const t = fixture()
    Object.assign(t.creators[0], { stripe_onboarding_status: "pending", subscription_plan_id: "growth", subscription_status: "past_due" })
    Object.assign(t.creators[1], { stripe_onboarding_status: "not_connected", subscription_plan_id: "free", subscription_status: "active" })
    Object.assign(t.creators[2], { stripe_onboarding_status: "connected", subscription_plan_id: null, subscription_status: null })
    Object.assign(t.products[0], { price_cents: 1200, pay_what_you_want: false })
    Object.assign(t.products[1], { price_cents: 0, pay_what_you_want: false })
    t.products.push({ id: "p5", creator_id: "c2", title: "Guide", status: "published", type: "digital", created_at: ago(2), price_cents: 900, pay_what_you_want: false })
    t.store_theme_installs = [
      { id: "i1", creator_id: "c1", status: "draft", created_at: ago(5) },
      { id: "i2", creator_id: "c1", status: "draft", created_at: ago(2) },
      { id: "i3", creator_id: "c3", status: "published", created_at: ago(40) },
      { id: "i4", creator_id: "c3", status: "draft", created_at: ago(9) },
      { id: "i5", creator_id: "c2", status: "unpublished", created_at: ago(1) },
    ]
    const s = await supabaseSnapshots(new FakeDb(t), { probeHttps: offline }).load(["c1", "c2", "c3"], ALL_PARTS, new Map(), NOW)
    const [a, b, c] = ["c1", "c2", "c3"].map((id) => s.get(id)!)
    check("onboarding and the plan's payment, as stored", a.creator?.onboardingStatus === "pending" && a.creator.subscriptionPlan === "growth" && a.creator.subscriptionStatus === "past_due" && c.creator?.onboardingStatus === "connected" && c.creator.subscriptionStatus === null, a.creator)
    check("each product's price, and a price not stored is unknown", a.products?.find((p) => p.id === "p1")?.priceCents === 1200 && a.products?.find((p) => p.id === "p2")?.priceCents === 0 && a.products?.find((p) => p.id === "p3")?.priceCents === null && a.products?.find((p) => p.id === "p1")?.payWhatYouWant === false)
    check("the website: the first draft's date, a live one, one taken down", a.website?.draftSince === ago(5) && !a.website.live && c.website?.live === true && b.website?.unpublished === true && b.website.draftSince === null, { a: a.website, b: b.website, c: c.website })
    check("so: c2 has a paid product live and no Stripe, c1 is behind on Pro, and only c1's website waits",
      (payoutsNotConnected.evaluate(b) ?? []).map((f) => f.subject).join() === "connect" && (proPaymentFailed.evaluate(a) ?? []).length === 1 && (proPaymentFailed.evaluate(c) ?? []).length === 0
        && (websiteNotPublished.evaluate(a) ?? []).length === 1 && (websiteNotPublished.evaluate(b) ?? []).length === 0 && (websiteNotPublished.evaluate(c) ?? []).length === 0)
  }
  {
    /* An older database: no onboarding or plan columns, no pay what you want. */
    const d = new FakeDb(fixture())
    d.missing = { creators: ["subscription_status"], products: ["pay_what_you_want"] }
    const s = await supabaseSnapshots(d, { probeHttps: offline }).load(["c1", "c2", "c3"], ALL_PARTS, new Map(), NOW)
    const a = s.get("c1")!
    check("a creators table without those columns: the creator is still read, those facts unknown", a.creator?.id === "c1" && a.creator.payoutsEnabled === false && a.creator.onboardingStatus === undefined && proPaymentFailed.evaluate(a) === undefined, a.creator)
    check("a products table without the price columns: products still read, every one counted as paid", a.products?.length === 3 && a.products.every((p) => p.priceCents == null && p.payWhatYouWant == null), a.products)
    check("no builder table: the website is unknown, and its step cannot tell", a.website === undefined && websiteNotPublished.evaluate(a) === undefined)
  }

  console.log("\nThe whole engine against it")
  {
    const d = new FakeDb(fixture())
    d.columns.seller_notifications = ["creator_id", "user_id", "type", "title", "message", "action_url", "product_id", "review_id", "metadata", "kind", "category", "priority", "dedupe_key", "subject_id", "rule_version", "created_at", "read_at", "dismissed_at", "resolved_at", "pushed_at"]
    const sent: string[] = []
    const pusher = { send: async (_u: string, p: { data: { kind: string } }) => void sent.push(p.data.kind) }
    const run = () => runNotificationEngine({ store: supabaseNotificationStore(d, () => undefined), source: supabaseSnapshots(d, { probeHttps: offline }), pusher, deadline: NOW + 250_000, clock: () => NOW })
    const s1 = await run()
    const rows = d.tables.seller_notifications
    const shown = rows.filter((r) => !r.dismissed_at).map((r) => `${r.creator_id}:${r.kind}`).sort()
    check("every creator evaluated in one batch", s1.available && s1.creators === 3 && s1.batches === 1, s1)
    check("c1: payouts paused, the failed payout, the dispute, the bounces (critical), and the file with nothing to deliver", ["c1:dispute_opened", "c1:email_bounce_rate", "c1:payout_failed", "c1:stripe_restricted", "c1:product_missing_file"].every((k) => shown.includes(k)), shown)
    const c1Calm = rows.filter((r) => r.creator_id === "c1" && !r.dismissed_at && r.category !== "critical")
    check("and no more than three of everything else in a day, problems first: the file, the failed email, the first sale; 50 subscribers and the opportunities wait", c1Calm.length === 3 && c1Calm.map((r) => r.kind).sort().join() === "campaign_failed,product_missing_file,sales_milestone", c1Calm.map((r) => r.kind))
    check("c3: the domain waiting for HTTPS a day is critical", shown.includes("c3:domain_https"), shown)
    check("c2, three days old with nothing: add your first product", shown.includes("c2:setup_next_step"), shown)
    check("every row is written with its key, category and type", rows.every((r) => r.dedupe_key && r.category && r.type === r.category && r.kind))
    check("pushed: the critical ones and the milestones written, each once", sent.slice().sort().join() === "dispute_opened,domain_https,email_bounce_rate,first_review,payout_failed,sales_milestone,stripe_restricted", sent)
    check("the batch is finished: every creator evaluated, no lease left", d.tables.notification_creator_state.every((s) => s.evaluated_at && s.lease_until === null))
    const before = rows.length
    for (const s of d.tables.notification_creator_state) s.evaluated_at = null
    const s2 = await run()
    check("a second run on the same data writes nothing and pushes nothing new", rows.length === before && s2.inserted === 0 && sent.length === new Set(sent).size, { before, after: rows.length, s2 })
    d.tables.creators[0].payouts_enabled = true
    for (const s of d.tables.notification_creator_state) s.evaluated_at = null
    await run()
    check("payouts back on: that row is resolved and drops off", !!rows.find((r) => r.kind === "stripe_restricted")?.resolved_at)
  }
  {
    const d = new FakeDb(fixture())
    d.claimable = false
    const s = await runNotificationEngine({ store: supabaseNotificationStore(d, () => undefined), source: supabaseSnapshots(d, { probeHttps: offline }), pusher: null, deadline: NOW + 250_000, clock: () => NOW })
    check("before the SQL: not available, nothing read, nothing written", !s.available && d.reads.length === 0 && d.tables.seller_notifications.length === 0)
  }
  {
    const d = new FakeDb(fixture())
    d.columns.seller_notifications = ["creator_id", "user_id", "type", "title", "message", "action_url", "product_id", "review_id", "metadata", "created_at", "read_at", "dismissed_at"]
    const s = await runNotificationEngine({ store: supabaseNotificationStore(d, () => undefined), source: supabaseSnapshots(d, { probeHttps: offline }), pusher: null, deadline: NOW + 250_000, clock: () => NOW })
    check("a database with the function but not the columns: nothing written, errors counted, no crash", d.tables.seller_notifications.length === 0 && s.errors > 0)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
main()
