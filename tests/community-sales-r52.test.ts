/**
 * ===========================================================================
 *  ROUND 52: A COMMUNITY'S TICKETS AND PROGRAMS ARE REVENUE ON /app TOO
 * ===========================================================================
 * Event tickets, programs and single modules are paid through their own
 * checkouts and kept on their own rows, never in `orders`. Community
 * Analytics counted them; /app/analytics, Home's chart and the sales
 * breakdown, which read `orders`, did not. One store, one dataset, every
 * screen by its real code:
 *
 *   /app/analytics   lib/analytics/report-answer countReportAnswer (Revenue, its chart)
 *   Home's chart     lib/analytics/home-figures homeFromReports of that answer
 *   Sales breakdown  lib/analytics/commerce-server countCommerce (Total sales)
 *   All time         lib/analytics/report-answer allTimeOf
 *   Community        lib/communities/server/analytics-report loadCommunityReport,
 *                    and /app/analytics' Communities card (report-total combineReports)
 *
 *   npx tsx --conditions=react-server tests/community-sales-r52.test.ts
 */
import { FakeSupabase, type Row } from "./fake-supabase"
import { fakeDb } from "./_fake-db"
import { readFileSync } from "node:fs"
import type { Reports } from "../lib/analytics/reports"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder"
globalThis.fetch = (async () => {
  throw new Error("offline")
}) as typeof fetch

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}

const STORE = "52000000-0000-4000-8000-000000000001"
const USER = "52000000-0000-4000-8000-0000000000aa"
const CID = "52000000-0000-4000-8000-0000000000c1"
const PLAN = "52000000-0000-4000-8000-0000000000a1"
const EBOOK = "52000000-0000-4000-8000-0000000000e1"
const EVENT = "52000000-0000-4000-8000-0000000000e2"
const COURSE = "52000000-0000-4000-8000-0000000000d1"
const MODULE = "52000000-0000-4000-8000-0000000000d2"
const TZ = "Europe/Bucharest"
/* 1 November 00:00 in Bucharest (UTC+2) to Thursday 5 November, noon UTC. */
const START = Date.parse("2026-10-31T22:00:00Z")
const NOW = Date.parse("2026-11-05T12:00:00Z")
/* 1 € = 1.25 $. */
const FX = Array.from({ length: 20 }, (_, i) => ({ as_of: new Date(Date.parse("2026-10-20T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), rates: { USD: 1.25 }, base: "EUR" }))

const ticket = (id: string, extra: Row): Row => ({ id, event_id: EVENT, community_id: CID, user_id: `u-${id}`, status: "paid", source: "purchase", currency: "eur", refunded_at: null, created_at: extra.paid_at ?? "2026-11-02T08:00:00Z", ...extra })

function world(opts: { ebook?: boolean } = {}): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = NOW
  const products = [{ id: PLAN, creator_id: STORE, title: "Monthly", type: "membership", community_id: CID }, ...(opts.ebook ? [{ id: EBOOK, creator_id: STORE, title: "Ebook", type: "digital" }] : [])]
  db.table("products", {}, products)
  db.table("creators", { embeds: { products: (r, d) => d.rows("products").filter((p) => p.creator_id === r.id).map((p) => ({ id: p.id, title: p.title, type: p.type })) } }, [{ id: STORE, user_id: USER, slug: "ana", display_name: "Ana" }])
  for (const t of ["store_theme_installs", "onepages", "onepage_views", "onepage_clicks", "custom_domains", "download_events", "fulfillments", "subscribers", "commerce_checkouts", "analytics_events", "ledger_events"]) db.table(t, {}, [])
  for (const t of ["community_members", "community_activity", "community_daily_stats", "community_daily_traffic", "community_view_days", "community_feed_posts", "memberships", "membership_invoices", "profiles", "community_cancellations"]) db.table(t, {}, [])
  db.table("store_settings", {}, [{ creator_id: STORE, currency: "EUR" }])
  db.table("fx_rates", {}, FX as unknown as Row[])
  db.table("communities", {}, [{ id: CID, name: "Ana's circle", slug: "circle", status: "published", creator_id: STORE, owner_user_id: USER, created_at: "2026-06-01T00:00:00Z", deleted_at: null }])
  db.table("community_tiers", {}, [{ community_id: CID, product_id: PLAN, billing: "recurring", kind: "paid", name: "Monthly" }])
  db.table("community_events", {}, [{ id: EVENT, community_id: CID, title: "Live workshop", status: "scheduled", starts_at: "2026-11-20T18:00:00Z" }])
  db.table("community_courses", {}, [{ id: COURSE, community_id: CID, title: "Watercolour basics" }])
  db.table("course_modules", {}, [{ id: MODULE, title: "Skies" }])
  db.table("orders", {}, [
    /* A month of the community's plan: an order, as every membership payment is. */
    { id: "52000000-0000-4000-8000-00000000f001", creator_id: STORE, product_id: PLAN, amount_cents: 3000, status: "completed", currency: "eur", created_at: "2026-11-02T10:00:00Z", property_type: "creator_page", buyer_email: "m@example.com" },
    ...(opts.ebook ? [{ id: "52000000-0000-4000-8000-00000000f002", creator_id: STORE, product_id: EBOOK, amount_cents: 900, status: "completed", currency: "eur", created_at: "2026-11-03T10:00:00Z", property_type: "creator_page", buyer_email: "e@example.com" }] : []),
  ])
  db.table("community_event_tickets", {}, [
    /* 00:30 on 1 November in Bucharest, still 31 October in UTC: inside the period, in its first day. */
    ticket("t1", { amount_cents: 2000, paid_at: "2026-10-31T22:30:00Z" }),
    /* $12.50 = 10.00 €. */
    ticket("t2", { amount_cents: 1250, currency: "usd", paid_at: "2026-11-03T09:00:00Z" }),
    /* Refunded in full, inside the period. */
    ticket("t3", { amount_cents: 1500, paid_at: "2026-11-02T09:00:00Z", status: "refunded", refunded_at: "2026-11-04T09:00:00Z" }),
    /* A seat held and never paid, and a free invite: no money. */
    ticket("t4", { amount_cents: 1500, status: "held", paid_at: null }),
    ticket("t5", { amount_cents: 0, source: "invite", paid_at: "2026-11-02T09:00:00Z" }),
  ])
  db.table("community_program_access", {}, [
    { program_id: COURSE, user_id: "u-p1", community_id: CID, source: "purchase", amount_cents: 5000, currency: "eur", created_at: "2026-11-03T12:00:00Z", revoked_at: null },
    /* Taken back by a full refund. */
    { program_id: COURSE, user_id: "u-p2", community_id: CID, source: "purchase", amount_cents: 5000, currency: "eur", created_at: "2026-11-03T13:00:00Z", revoked_at: "2026-11-04T13:00:00Z" },
    /* Given, not sold. */
    { program_id: COURSE, user_id: "u-p3", community_id: CID, source: "grant", amount_cents: null, currency: null, created_at: "2026-11-03T13:00:00Z", revoked_at: null },
  ])
  db.table("community_module_access", {}, [{ module_id: MODULE, program_id: COURSE, user_id: "u-m1", community_id: CID, source: "purchase", amount_cents: 1000, currency: "eur", created_at: "2026-11-04T08:00:00Z", revoked_at: null }])
  return db
}

/* By hand: 30 (plan) + 20 + 10 (the dollar ticket) + 50 (a program) + 10 (a module); the refunded ticket and program bring nothing. */
const WANT = 3000 + 2000 + 1000 + 5000 + 1000

async function screens(db: FakeSupabase) {
  const { countReportAnswer, reportQuestion, allTimeOf } = await import("../lib/analytics/report-answer")
  const { countCommerce } = await import("../lib/analytics/commerce-server")
  const { homeFromReports } = await import("../lib/analytics/home-figures")
  const { loadCommunityReport } = await import("../lib/communities/server/analytics-report")
  const { combineReports } = await import("../lib/communities/report-total")
  const url = new URL("https://storelib.com/api/analytics/reports")
  url.searchParams.set("start", new Date(START).toISOString())
  url.searchParams.set("end", new Date(NOW).toISOString())
  url.searchParams.set("tz", TZ)
  const q = await reportQuestion(db as never, USER, url, "storelib.com")
  if ("error" in q) throw new Error(String((q as { error: string }).error))
  const answer = await countReportAnswer(db as never, q.q, q.productTitles, q.productTypes, USER)
  const r = answer.reports as Reports
  const home = homeFromReports(r, "EUR")
  const commerce = await countCommerce(db as never, { creatorId: STORE, properties: q.q.properties, selector: q.q.selector, productId: null, productTypes: q.productTypes, span: { start: START, end: NOW }, previous: null, timeZone: TZ, mode: "all" })
  const allTime = await allTimeOf(db as never, STORE)
  /* The community's screens on the same rows, through the fake their own suites use (it models their reads). */
  const tables = Object.fromEntries(Object.keys((db as unknown as { tables: Record<string, Row[]> }).tables).map((t) => [t, db.rows(t)]))
  const base = fakeDb(tables)
  const cdb = { from: base.from, rpc: async () => ({ data: null, error: null }) }
  const community = await loadCommunityReport(cdb as never, { id: CID, owner_user_id: USER, creator_id: STORE, created_at: "2026-06-01T00:00:00Z" } as never, { start: START, end: NOW, compare: null, timeZone: TZ }, NOW)
  const card = combineReports([{ id: CID, name: "Ana's circle", report: community }])
  return { r, home, commerce, allTime, community, card, conversion: answer.conversion as { currency: string } }
}

async function main() {
  console.log("\nOne community: a plan, tickets in two currencies, a program, a module, refunds, a held seat, an invite")
  const db = world()
  const s = await screens(db)
  const homeTotal = Math.round(s.home.series.revenue.reduce((t, p) => t + p.value, 0) * 100)
  const line = s.community.money?.lines.revenue.current ?? []
  const got = {
    app: s.r.sales.value,
    appChart: s.r.sales.series.current.reduce((a, b) => a + b, 0),
    home: s.home.periodRevenue,
    homeChart: homeTotal,
    breakdown: s.commerce.breakdown.total,
    community: s.community.money?.figures.revenue.value,
    communityChart: line.reduce((a: number, b) => a + (b ?? 0), 0),
    communityCard: s.card?.money?.revenue.value,
    currency: [s.conversion.currency, s.commerce.currency, s.community.money?.currency],
  }
  console.log("   ", JSON.stringify(got))
  check(`/app/analytics Revenue is ${WANT / 100} €`, got.app === WANT, got)
  check("  and its chart adds up to it", got.appChart === WANT, got)
  check("Home's figure and Home's chart say the same", got.home === WANT && got.homeChart === WANT, got)
  check("the sales breakdown's Total sales is Revenue, to the cent", got.breakdown === WANT, got)
  check("Community Analytics' revenue and its chart say the same", got.community === WANT && got.communityChart === WANT, got)
  check("/app/analytics' Communities card says the same", got.communityCard === WANT, got)
  check("every screen in euros, the store's currency", got.currency.every((c) => (c ?? "").toLowerCase() === "eur"), got.currency)
  check(`All time is ${WANT / 100} € too (nothing else was ever sold)`, s.allTime.salesCents === WANT, s.allTime)

  console.log("\nNothing counted twice, nothing left out")
  check("orders: the plan, three tickets, two programs, a module: 7 (the held seat, the invite and the given program are none)", s.r.orders.value === 7, s.r.orders.value)
  check("the plan's order once: Top products has Monthly at 30 €", s.r.topProducts.find((p) => p.label === "Monthly")?.salesCents === 3000, s.r.topProducts)
  check("the event under its own title, the refunded ticket off it: 30 €", s.r.topProducts.find((p) => p.label === "Live workshop")?.salesCents === 3000, s.r.topProducts)
  check("the program and its module under their titles", s.r.topProducts.find((p) => p.label === "Watercolour basics")?.salesCents === 5000 && s.r.topProducts.find((p) => p.label === "Skies")?.salesCents === 1000, s.r.topProducts)
  check("no 'Removed product' row", !s.r.topProducts.some((p) => p.key === "__removed__" || /Removed/.test(p.label)), s.r.topProducts.map((p) => p.label))
  check("Top products adds up to Revenue", s.r.topProducts.reduce((t, p) => t + p.salesCents, 0) === WANT)
  check("two refunds on /app (the ticket, the program), as the community's own refunds line", s.r.refunds.value === 2 && s.community.money?.refunds.count === 2, [s.r.refunds.value, s.community.money?.refunds])
  check("the community splits it: memberships 30, programs 60, tickets 30", JSON.stringify(s.community.money?.bySource) === JSON.stringify([{ key: "memberships", cents: 3000 }, { key: "programs", cents: 6000 }, { key: "tickets", cents: 3000 }]), s.community.money?.bySource)
  const asked: unknown[] = []
  const spy = { from: (t: string) => ({ select: () => ({ in: (_c: string, ids: unknown[]) => (asked.push(...ids), { limit: async () => ({ data: [], error: null }) }) }) }) }
  const { readDownloads } = await import("../lib/analytics/report-read")
  await readDownloads(spy as never, ["52000000-0000-4000-8000-00000000f001", "community-ticket:t1"])
  check("the Downloads read never asks for a ticket's id (no uuid: the read would fail)", asked.length === 1 && asked[0] === "52000000-0000-4000-8000-00000000f001", asked)

  console.log("\nIn the viewer's time zone")
  const first = s.r.sales.series.current[0]
  check("the 00:30 ticket in Bucharest is 1 November's: the first day has its 20 €", first === 2000 && line[0] === 2000, [first, line[0]])

  console.log("\nA product of the store beside the community adds only itself")
  const two = await screens(world({ ebook: true }))
  check("/app Revenue 129 € = the community's 120 + the ebook's 9; the community still 120", two.r.sales.value === WANT + 900 && two.community.money?.figures.revenue.value === WANT && two.commerce.breakdown.total === WANT + 900, [two.r.sales.value, two.community.money?.figures.revenue.value, two.commerce.breakdown.total])

  console.log("\nBefore: what /app counted from `orders` alone")
  const ordersOnly = (await import("../lib/analytics/reports")).buildReports({ orders: (db.rows("orders") as never[]).map((o: Row) => ({ ...o, currency: "EUR" })) as never, window: { start: START, end: NOW }, previous: null, timeZone: TZ, mainDomain: "storelib.com", productTitles: { [PLAN]: "Monthly" }, views: [], steps: [] } as never)
  console.log(`    orders alone: ${ordersOnly.sales.value / 100} € on /app against ${WANT / 100} € in Community Analytics`)
  check("before, /app said 30 € and Community Analytics 120 €", ordersOnly.sales.value === 3000)

  console.log("\nOnly every place: a website or a product chosen is not the community's")
  const { readOrders } = await import("../lib/analytics/report-read")
  const plain = await readOrders(world() as never, [{ start: START, end: NOW }], STORE, null, { start: START, end: NOW })
  const chosen = await readOrders(world() as never, [{ start: START, end: NOW }], STORE, PLAN, { start: START, end: NOW }, { community: true })
  check("without the option, and with a product chosen, no community rows are read", !plain.rows.some((r) => r.id.startsWith("community-")) && !chosen.rows.some((r) => r.id.startsWith("community-")))
  const answer = readFileSync("lib/analytics/report-answer.ts", "utf8")
  check("the reports ask for them only for every place", /readOrders\(admin, spans, q\.creatorId, q\.product, q\.window, \{ community: q\.selector\.type === "all" \}\)/.test(answer))

  console.log("\nA database without the tables")
  const empty = new FakeSupabase()
  empty.clock = NOW
  const { readCommunitySales } = await import("../lib/analytics/community-sales")
  const none = await readCommunitySales(empty as never, STORE, [{ start: START, end: NOW }])
  check("no communities table: no community sales, no error", none.rows.length === 0)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
