/**
 * ===========================================================================
 *  EVERY ROW COUNTED, AND A DELETED PRODUCT'S SALES KEPT
 * ===========================================================================
 * Two accuracy faults left from the analytics audit:
 *
 *   Home read its orders (app/app/page.tsx) and the period's views and link
 *   taps (components/app/dashboard-client.tsx) in single reads, and a read
 *   stops at 1,000 rows. A busy store's figures stopped counting without a
 *   word. Home now draws the Analytics answer (app/api/analytics/reports),
 *   counted on the server from every row, link clicks included.
 *
 *   Analytics read orders with `.in("product_id", <current products>)`, so a
 *   product the creator deleted took its sales with it, and a big catalog
 *   made a URL too long to send. Worse, the database deleted a product's
 *   orders with it (ON DELETE CASCADE). Orders now carry their creator and
 *   outlive their product (supabase/sql/run-now part 32), are read by the
 *   creator (lib/analytics/creator-orders), and a deleted product's sales
 *   are one "Removed product" row.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { KEYSET_PAGE, keysetFrom, readByKeyset } from "../lib/analytics/keyset"
import { homeAllTime, homeFigures, homeFromReports, homeQuestion, homeSpans } from "../lib/analytics/home-figures"
import { buildReports, REMOVED_PRODUCT, type StepRow, type ViewRow } from "../lib/analytics/reports"
import { reportKey } from "../lib/analytics/report-cache"
import { byCreator, creatorSalesTotals, ownRows, scopedOrders } from "../lib/analytics/creator-orders"
import { factsFromRows } from "../lib/home/progress"
import { boundsOf, compareBounds, resolveValue, todayIn } from "../lib/date-range/range"
import type { OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const TZ = "America/New_York"
const NOW = Date.parse("2026-09-25T14:00:00Z")
const HOUR = 3_600_000

async function main() {
  console.log("\nA page at a time, every row once")
  {
    /* 2,345 rows, many sharing a millisecond, so a page edge falls inside a tie. */
    const rows = Array.from({ length: 2345 }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}`, created_at: new Date(NOW - 10 * HOUR + Math.floor(i / 7)).toISOString() }))
    let pages = 0
    const page = (after: { t: string; id: string } | null) => {
      pages++
      const from = after ? rows.filter((r) => r.created_at > after.t || (r.created_at === after.t && r.id > after.id)) : rows
      return Promise.resolve({ data: from.slice(0, KEYSET_PAGE), error: null })
    }
    const { rows: got, truncated } = await readByKeyset(page)
    check("every row is read, past the 1,000 a single read stops at", got.length === 2345 && !truncated, got.length)
    check("  none twice, though pages end inside rows of the same millisecond", new Set(got.map((r) => r.id)).size === 2345)
    check("  in three pages", pages === 3, pages)
    const capped = await readByKeyset(page, 1500)
    check("a ceiling says it was reached", capped.truncated && capped.rows.length === 2000)
    const q: string[] = []
    const fake = { gte: (c: string, v: string) => (q.push(`gte ${c} ${v}`), fake), or: (f: string) => (q.push(`or ${f}`), fake) }
    keysetFrom(fake, "S", { t: "T", id: "I" })
    check("the next page starts at the last row's time, past its id", q.join("|") === 'gte created_at T|or created_at.gt."T",id.gt.I')
  }

  console.log("\nHome asks Analytics' own question and draws its answer")
  {
    const period = resolveValue({ preset: "last_7_days" }, todayIn(TZ, NOW))
    const { window, previous, key } = homeQuestion(period, TZ, NOW)
    const span = boundsOf(period, TZ, NOW)
    const warmKey = reportKey({
      start: span.start,
      end: Math.max(span.end, span.start + 1),
      compare: compareBounds(period, { mode: "previous_period" }, TZ, NOW),
      product: "all",
      property: "all",
      timeZone: TZ,
    })
    check("the same key the Analytics page's prefetch asks with, so one answer serves both", key === warmKey, { key, warmKey })
    check("  for the period Home names", JSON.stringify({ window, previous }) === JSON.stringify(homeSpans(period, TZ, NOW)))
    const allTime = homeQuestion(resolveValue({ preset: "all_time" }, todayIn(TZ, NOW)), TZ, NOW)
    check("All time is asked with no comparison", /compare=none/.test(allTime.key))

    const views: ViewRow[] = Array.from({ length: 1500 }, (_, i) => ({ id: `v${i}`, session_id: `s${i % 600}`, created_at: new Date(window.start + (i % 144) * HOUR).toISOString() }))
    const orders: OrderRow[] = Array.from({ length: 1200 }, (_, i) => ({ id: `o${i}`, product_id: "p1", amount_cents: 1000, status: "completed", created_at: new Date(window.start + (i % 140) * HOUR + 1).toISOString() }))
    const clicks: StepRow[] = [window.start + 5, window.start + 2 * 24 * HOUR, previous!.start + 1].map((t, i) => ({ id: `c${i}`, event_type: "link_click", session_id: `s${i}`, link_id: "b1", created_at: new Date(t).toISOString() }))
    const r = buildReports({ views, steps: clicks, orders, window, previous, timeZone: TZ, mainDomain: "", productTitles: {} })
    const fromAnswer = homeFromReports(r)
    const fromRows = homeFigures({ orders, views, steps: clicks, window, previous, timeZone: TZ })
    check("the answer and the rows give Home the very same figures and series", JSON.stringify(fromAnswer) === JSON.stringify(fromRows))
    check("  and past a thousand of each: 1,500 page views, 1,200 orders", fromAnswer.periodPageViews === 1500 && fromAnswer.periodOrders === 1200, { v: fromAnswer.periodPageViews, o: fromAnswer.periodOrders })
    check("  visitors are people, not page views: 600 visits with no visitor id are 600 visitors", fromAnswer.periodVisitors === 600, fromAnswer.periodVisitors)
    check("  the link clicks in the period only, in the chart's buckets", fromAnswer.series.views.reduce((n, p) => n + (p.secondaryValue ?? 0), 0) === 2)
    check("all time under each figure is the route's line", JSON.stringify(homeAllTime({ orders: 3, salesCents: 4500 })) === JSON.stringify({ totalOrders: 3, totalRevenue: 4500 }) && homeAllTime(null).totalOrders === 0)
  }

  console.log("\nA deleted product's sales are kept, as Removed product")
  {
    const window = { start: NOW - 48 * HOUR, end: NOW }
    const at = new Date(NOW - 5 * HOUR).toISOString()
    const orders = [
      { id: "a", product_id: "p1", amount_cents: 1000, status: "completed", created_at: at },
      /* after part 32: the product is gone and the order has none */
      { id: "b", product_id: null, amount_cents: 2000, status: "completed", created_at: at },
      /* before part 32, or an old orphan: an id no current product has */
      { id: "c", product_id: "gone", amount_cents: 500, status: "completed", created_at: at },
    ] as unknown as OrderRow[]
    const r = buildReports({ views: [], steps: [], orders, window, previous: null, timeZone: "UTC", mainDomain: "", productTitles: { p1: "Presets" } })
    const removed = r.topProducts.filter((row) => row.label === "Removed product")
    check("their sales stay in Revenue and Orders", r.sales.value === 3500 && r.orders.value === 3, { sales: r.sales.value, orders: r.orders.value })
    check("  as one Removed product row with all of their money", removed.length === 1 && removed[0].key === REMOVED_PRODUCT && removed[0].salesCents === 2500 && removed[0].orders === 2, removed)
    check("  and Top products adds up to Revenue", r.topProducts.reduce((n, row) => n + row.salesCents, 0) === r.sales.value)
  }

  console.log("\nOrders read by their creator, never by a list of product ids")
  {
    const calls: string[] = []
    const q = { eq: (c: string, v: string) => (calls.push(`eq ${c}=${v}`), q) }
    const admin = { from: (t: string) => ({ select: (s: string) => (calls.push(`from ${t} select ${s}`), q) }) }
    scopedOrders(admin as never, "id", "creator", "c1", null)
    check("by the order's own creator once the column is there", calls.join("|") === "from orders select id|eq creator_id=c1", calls)
    calls.length = 0
    scopedOrders(admin as never, "id", "product", "c1", "p9")
    check("  else through the product, and a product filter on top", calls.join("|") === "from orders select id, products!inner(creator_id)|eq products.creator_id=c1|eq product_id=p9", calls)
    const scopes: string[] = []
    const answer = await byCreator(async (scope) => {
      scopes.push(scope)
      if (scope === "creator") throw new Error("column orders.creator_id does not exist")
      return "through the product"
    })
    check("a database without the column falls back to the product, and remembers", answer === "through the product" && scopes.join() === "creator,product")
    const next: string[] = []
    await byCreator(async (scope) => (next.push(scope), 1))
    check("  so the next read does not ask for the column again for a while", next.join() === "product")
    check("the embedded product is taken off the rows", JSON.stringify(ownRows([{ id: "o", products: { creator_id: "c" } }, { id: "p" }])) === JSON.stringify([{ id: "o" }, { id: "p" }]))

    /* Changed on purpose: the route's counting is lib/analytics/report-answer.ts (tests/analytics-e2e.test.ts drives it against a fake database). */
    const route = code("app/api/analytics/reports/route.ts") + code("lib/analytics/report-answer.ts")
    const reads = code("lib/analytics/report-read.ts")
    check("the reports route lists no product ids for orders", !/\.in\("product_id"/.test(route + reads) && !/productIds/.test(route + reads))
    check("  and reads the period's orders and the all time orders through byCreator",
      /return byCreator\(\(scope\) =>\s*withColumns\(ORDER_COLUMNS/.test(reads) && /* Changed on purpose (currency round AM): read, then converted to the store's currency (lib/money/report-currency). */ /const read = await byCreator\(/.test(route) && /* Changed on purpose (round ana-1028): the day rates through the same client, as the period's figures. */ /inStoreCurrency\(admin, creatorId, read, storeCurrency, \{ rates: ratesFrom\(admin\) \}\)/.test(route) && /* Changed on purpose (r52): every place also reads the community's tickets and programs (lib/analytics/community-sales). */ /readOrders\(admin, spans, q\.creatorId, q\.product, q\.window, \{ community: q\.selector\.type === "all" \}\)/.test(route) && /allTimeOf\(admin, q\.creatorId\)/.test(route))
  }

  console.log("\nHome's sales count and revenue: every order, not the first 1,000 rows")
  {
    const viaDb = await creatorSalesTotals({ rpc: async () => ({ data: { views: 1, orders: 1234, sales_cents: 567800 }, error: null }), from: () => { throw new Error("no rows needed") } } as never, "c1")
    check("counted by the database when it can (analytics_all_time)", viaDb.sales === 1234 && viaDb.revenueCents === 567800, viaDb)

    /* The function missing: every order, a page at a time, a basket one sale, a dispute none. */
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: `o${String(i).padStart(5, "0")}`, product_id: "p1", amount_cents: 1000, status: "completed", created_at: new Date(NOW - i * 60_000).toISOString(), stripe_session_id: i < 3 ? "cs_basket" : null, refund_amount_cents: null }))
    all[10].status = "disputed"
    const sorted = [...all].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const builder = () => {
      let after: { t: string; id: string } | null = null
      let limit = Infinity
      const q = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        or: (f: string) => { const m = /created_at\.gt\."([^"]+)",id\.gt\.(.+)$/.exec(f); if (m) after = { t: m[1], id: m[2] }; return q },
        order: () => q,
        limit: (n: number) => { limit = n; return q },
        then: (res: (v: unknown) => unknown) => {
          const from = after ? sorted.filter((r) => r.created_at > after!.t || (r.created_at === after!.t && r.id > after!.id)) : sorted
          return Promise.resolve(res({ data: from.slice(0, limit), error: null }))
        },
      }
      return q
    }
    const viaRows = await creatorSalesTotals({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }), from: builder } as never, "c1")
    check("  else from every order read a page at a time: 2,500 rows, a basket of 3 is one sale, a dispute none", viaRows.sales === 2500 - 2 - 1 && viaRows.revenueCents === (2500 - 1) * 1000, viaRows)
    const facts = factsFromRows({ creator: null, products: [], domains: [], websiteLive: false, sales: { sales: 1234, revenueCents: 567800 } })
    check("Getting started and the challenges read that count, not the rows", facts.sales === 1234 && facts.revenueCents === 567800)
    check("the progress route counts it the same way", /creatorSalesTotals\(db as Parameters<typeof creatorSalesTotals>\[0\], creator\.id\)/.test(read("lib/home/progress-server.ts")) && !/\.from\("orders"\)/.test(code("lib/home/progress-server.ts")))
  }

  console.log("\nThe database keeps the sales (run-now part 32)")
  {
    const part = "supabase/sql/run-now/32_orders_keep_sales.sql"
    const sql = read(part)
    const lines = sql.trim().split("\n").slice(1)
    check("the part exists, and every line of it is one whole statement", lines.length > 5 && lines.every((l) => /;\s*$/.test(l)))
    check("  listed in the README and read by the after check", /32_orders_keep_sales\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p32_orders_keep_sales\b/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("  and carried into the four files", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 32_orders_keep_sales.sql"))
    check("orders carry their creator, filled for the orders already there and by a trigger from then on",
      /ADD COLUMN IF NOT EXISTS creator_id uuid;/.test(sql) && /UPDATE public\.orders o SET creator_id = p\.creator_id FROM public\.products p WHERE p\.id = o\.product_id/.test(sql)
        && /CREATE TRIGGER orders_fill_creator BEFORE INSERT OR UPDATE OF product_id, creator_id ON public\.orders/.test(sql) && /\(creator_id, created_at, id\)/.test(sql))
    check("deleting a product leaves its orders, with no product, instead of deleting them",
      /ALTER COLUMN product_id DROP NOT NULL;/.test(sql) && /FOREIGN KEY \(product_id\) REFERENCES public\.products\(id\) ON DELETE SET NULL NOT VALID/.test(sql) && /confdeltype <> 'n'/.test(sql))
    check("deleting the whole account still takes its orders", /FOREIGN KEY \(creator_id\) REFERENCES public\.creators\(id\) ON DELETE CASCADE/.test(sql))
    check("the status check lets a dispute be written, keeping every value it allowed", /\|\| ARRAY\['disputed'\]/.test(sql) && /regexp_matches\(c\.def/.test(sql))
    const allTime = lines.find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.analytics_all_time")) ?? ""
    check("the all time line counts by the order's creator, not its current products",
      /WHERE o\.creator_id = p_creator_id AND \(p_product_id IS NULL OR o\.product_id = p_product_id\)/.test(allTime) && !/SELECT p\.id FROM public\.products p/.test(allTime))
    check("  and stays the server's alone", /REVOKE ALL ON FUNCTION public\.analytics_all_time\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.analytics_all_time\(uuid, uuid\) TO service_role;/.test(sql))
    check("the readable source says what was wrong and what is right", /ON DELETE CASCADE/.test(read("supabase/migrations/20261004_orders_keep_creator.sql")) && /"Removed product"/.test(read("supabase/migrations/20261004_orders_keep_creator.sql")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
