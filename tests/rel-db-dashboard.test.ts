/**
 * DATABASE AND CREATOR DASHBOARD RELIABILITY (round rel-db, fix phase)
 *
 * 1. NO RAW CLIENT. Every server module under app/ and lib/ that talks to
 *    Supabase goes through the shared factories (lib/supabase/*), whose fetch
 *    gives every request a deadline (lib/net/deadline.ts). A client built from
 *    @supabase/supabase-js by hand waits up to undici's 300s instead. The few
 *    files owned by other areas (payments, Mailgun, crons, auth) are listed
 *    by name and reported, not changed here.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { inStoreCurrency } from "../lib/money/report-currency-server"
import { latestCreatorOrders, readCreatorOrders } from "../lib/analytics/creator-orders"
import { taxYearsInUsd } from "../lib/money/payout-figures"
import { AnalyticsUnavailable, countVisits, isAnalyticsUnavailable, readAll, readAudience, readNavClicks, type Admin, type CountQuestion } from "../lib/analytics/report-read"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })

/* Raw clients in files another area owns: reported for that area, not changed in this round. */
const OWNED_ELSEWHERE = new Set([
  "app/api/stripe/webhook/route.ts",
  "app/api/stripe/webhook/connect/route.ts",
  "lib/stripe/connect-webhook.ts",
  "app/api/webhooks/mailgun/route.ts",
  "app/api/cron/process-scheduled-emails/route.ts",
  "app/api/auth/unconfirmed-account/route.ts",
])

async function run() {
  console.log("\n1. Every server Supabase client has a deadline")
  const raw: string[] = []
  for (const file of [...walk("app"), ...walk("lib")]) {
    if (file.startsWith("lib/supabase/")) continue
    const src = readCode(file)
    if (/^\s*["']use client["']/m.test(src)) continue
    /* createClient imported from supabase-js itself, under any local name */
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@supabase\/supabase-js["']/)
    if (!m) continue
    const local = m[1].split(",").map((s) => s.trim()).find((s) => /^createClient(\s+as\s+\w+)?$/.test(s))
    if (!local) continue
    const name = local.includes(" as ") ? local.split(/\s+as\s+/)[1] : "createClient"
    const calls = [...src.matchAll(new RegExp(`\\b${name}\\(([\\s\\S]*?)\\n\\s*\\}?\\)`, "g"))]
    /* A call that passes the shared fetch is bounded; anything else waits on bare fetch. */
    const bounded = calls.length > 0 && calls.every((c) => /global:\s*\{\s*fetch:\s*(mediaFetch|deadlineFetch)/.test(c[1]))
    if (!bounded) raw.push(file)
  }
  const mine = raw.filter((f) => !OWNED_ELSEWHERE.has(f))
  check("no raw @supabase/supabase-js createClient outside lib/supabase (except files owned elsewhere)", mine.length === 0, mine)
  for (const f of [
    "app/api/domains/cleanup/route.ts",
    "app/api/wishlist/route.ts",
    "app/api/wishlist/check/route.ts",
    "app/api/wishlist/merge/route.ts",
    "app/api/security/confirm-device/route.ts",
    "app/api/security/verify-email/route.ts",
  ]) {
    check(`  ${f} uses createAdminClient from @/lib/supabase/admin`, /import \{ createAdminClient \} from "@\/lib\/supabase\/admin"/.test(readCode(f)) && !/@supabase\/supabase-js/.test(readCode(f)))
  }
  check("  business login's anon client passes the shared fetch", /global: \{ fetch: mediaFetch \}/.test(readCode("lib/businesses/server.ts")))
  const wish = readCode("app/api/wishlist/route.ts")
  check("  the wishlist still answers empty (not a 500) when the service key is missing", /if \(!url \|\| !key\) \{[\s\S]*?return null[\s\S]*?\}\s*return createAdminClient\(\)/.test(wish))
  if (raw.some((f) => OWNED_ELSEWHERE.has(f))) console.log(`  note  still raw, owned by another area: ${raw.filter((f) => OWNED_ELSEWHERE.has(f)).join(", ")}`)

  await analytics()
  await homeTotals()
  await pastAThousand()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

/** An admin client that answers every rpc with `rpcAnswer` and every table read with no rows, recording what was asked. */
function fakeAdmin(rpcAnswer: { data: unknown; error: { code?: string; message: string } | null }) {
  const tables: string[] = []
  const rpcs: string[] = []
  const builder = (): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, bad)
          return () => builder()
        },
      },
    )
  const admin = {
    from(table: string) {
      tables.push(table)
      return builder()
    },
    rpc(fn: string) {
      rpcs.push(fn)
      const p = Promise.resolve(rpcAnswer)
      return Object.assign(p, { abortSignal: () => p })
    },
  }
  return { admin: admin as unknown as Admin, tables, rpcs }
}

async function analytics() {
  console.log("\n2. Analytics: raw events only when the function is missing")
  const now = Date.UTC(2026, 9, 30, 12)
  const q: CountQuestion = {
    creatorId: "00000000-0000-4000-8000-000000000001",
    selector: { type: "all" } as CountQuestion["selector"],
    properties: { onePageId: null, websites: [], defaultWebsite: null },
    product: null,
    window: { start: now - 7 * 86_400_000, end: now },
    previous: { start: now - 14 * 86_400_000, end: now - 7 * 86_400_000 },
    timeZone: "UTC",
    mainDomain: "storelib.com",
    part: "all",
    now,
  }

  /* Before the PGRST202 case: that one remembers "missing" for five minutes. */
  for (const [label, error] of [
    ["a statement timeout (57014)", { code: "57014", message: "canceling statement due to statement timeout" }],
    ["a 5xx from PostgREST", { code: "", message: "upstream connect error" }],
  ] as const) {
    const t0 = Date.now()
    const { admin, tables } = fakeAdmin({ data: null, error })
    let thrown: unknown = null
    try {
      await countVisits(admin, q)
    } catch (e) {
      thrown = e
    }
    check(`${label}: the report is "unavailable", not counted from raw rows`, isAnalyticsUnavailable(thrown) && thrown instanceof AnalyticsUnavailable, String(thrown))
    check(`  and analytics_events is never read`, !tables.includes("analytics_events"), tables)
    check(`  and it answers at once (${Date.now() - t0}ms)`, Date.now() - t0 < 1_000)
  }
  {
    const { admin, tables } = fakeAdmin({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })
    const a = await readAudience(admin, q, q.window)
    check("systems and carts: a failed function leaves the cards empty, no raw read", a.audience === null && !tables.includes("analytics_events"), tables)
    const n = await readNavClicks(admin, q)
    check("clicks between pages: a failed function leaves the card empty, no raw read", n === null && !tables.includes("analytics_events"), tables)
  }
  {
    const { admin, tables } = fakeAdmin({ data: null, error: { code: "PGRST202", message: "Could not find the function public.analytics_report" } })
    const counted = await countVisits(admin, q)
    check("the function missing (PGRST202): counted from the raw rows, as before", counted.counted === "rows" && tables.includes("analytics_events"), { counted: counted.counted, tables })
  }
  {
    let pages = 0
    const page = () => {
      pages++
      const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `${pages}-${i}`, created_at: new Date(now + pages * 1000 + i).toISOString() }))
      return Promise.resolve({ data: rows, error: null })
    }
    const read = await readAll(page, { until: Date.now() - 1 })
    check("a raw read past its wall clock stops after the page in hand and says truncated", read.truncated === true && pages === 1, { pages, truncated: read.truncated })
    pages = 0
    let n = 0
    const short = await readAll(() => {
      n++
      return Promise.resolve({ data: n === 1 ? Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, created_at: new Date(now + i).toISOString() })) : [{ id: "z", created_at: new Date(now + 5000).toISOString() }], error: null })
    })
    check("  without a wall clock every page is read (1,001 rows)", short.rows.length === 1001 && !short.truncated)
  }
  const route = readCode("app/api/analytics/reports/route.ts")
  check("the reports route has maxDuration = 60", /export const maxDuration = 60\b/.test(route))
  check("  and says unavailable (503, stream line) when the function failed", /isAnalyticsUnavailable\(error\)/.test(route) && /status: 503/.test(route))
  check("  Home's all time line drops out on a failed function instead of failing the report", /allTimeOf\(admin, q\.creatorId\)\.catch\(\(e\) => \{ if \(isAnalyticsUnavailable\(e\)\) return null/.test(readCode("lib/analytics/report-answer.ts")))
}

async function homeTotals() {
  console.log("\n3. Home renders without the all time sales")
  const realFetch = globalThis.fetch
  const asked: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input))
    return new Promise<Response>(() => {})
  }) as typeof fetch
  try {
    const t0 = Date.now()
    const out = await Promise.race([
      inStoreCurrency({}, "c1", [{ created_at: "2019-03-01T10:00:00Z", currency: "eur", amount_cents: 1000 }], "USD", { rates: async () => [], noFetch: true }),
      new Promise<null>((r) => setTimeout(() => r(null), 2_000)),
    ])
    check("a page render's conversion never downloads the ECB history (noFetch)", !!out && asked.length === 0, { asked, out: !!out })
    check("  the sale with no kept rate is left unconverted and counted, not guessed", !!out && out.unconverted === 1, out ? { unconverted: out.unconverted } : null)
    check("  and it answers at once", Date.now() - t0 < 1_000)
  } finally {
    globalThis.fetch = realFetch
  }
  const home = readCode("app/app/page.tsx")
  check("Home's all time totals have a ceiling", /within<[^>]*>\(creatorSalesTotals\(adminSupabase, creator\.id, \{ noFetch: true \}\), HOME_TOTALS_MS, null\)/.test(home))
  check("  HOME_TOTALS_MS is a few seconds", /const HOME_TOTALS_MS = 3_000/.test(home))
  check("  the banner's rows never download the ECB history either", /creatorSalesRows\(adminSupabase, creator\.id, now, \{ noFetch: true \}\)/.test(home))
  check("  past the ceiling a first sale still counts", /salesTotals \?\? \{ sales: Math\.max\(bannerSales\.count, bannerSales\.first \? 1 : 0\)/.test(home))
  check("  and no milestone is counted from 30 days of rows", /salesTotals \? counted : \{ \.\.\.counted, milestone: null \}/.test(home))
  check("creatorSalesTotals passes noFetch through", /inStoreCurrency\(admin, creatorId, rows, storeCurrency, \{ noFetch: opts\.noFetch \}\)/.test(readCode("lib/analytics/creator-orders.ts")))
}

/** A database that answers each read of a table with the next page from `pages`, recording every call. */
function pagedAdmin(pages: Record<string, unknown[][]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const served: Record<string, number> = {}
  const query = (table: string): unknown => {
    const q: Record<string, unknown> = {}
    return new Proxy(q, {
      get(_t, prop) {
        if (prop === "then")
          return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
            const i = served[table] ?? 0
            served[table] = i + 1
            const list = pages[table] ?? []
            return Promise.resolve({ data: list[i] ?? [], error: null }).then(ok, bad)
          }
        return (...args: unknown[]) => {
          calls.push({ table, method: String(prop), args })
          return query(table)
        }
      },
    })
  }
  return { admin: { from: (t: string) => query(t) } as unknown as Admin, calls, served }
}

async function pastAThousand() {
  console.log("\n4. Customers, Payouts and the tax year past 1,000 rows")
  const year = 2026
  const row = (i: number) => ({ id: `o${String(i).padStart(5, "0")}`, created_at: new Date(Date.UTC(year, 0, 1) + i * 60_000).toISOString(), amount_cents: 100, status: "completed", currency: "usd" })
  const first = Array.from({ length: 1000 }, (_, i) => row(i))
  const second = Array.from({ length: 500 }, (_, i) => row(1000 + i))
  {
    const { admin, calls, served } = pagedAdmin({ orders: [first, second] })
    const read = await readCreatorOrders<ReturnType<typeof row>>(admin, "c1", "id, amount_cents, created_at, status, currency", { statuses: ["completed", "refunded", "disputed"], since: `${year - 1}-01-01T00:00:00Z` })
    check("1,500 orders are read in two pages, all of them", read.rows.length === 1500 && served.orders === 2 && !read.truncated, { rows: read.rows.length, pages: served.orders })
    check("  by the order's own creator, never a product id list", calls.some((c) => c.method === "eq" && c.args[0] === "creator_id" && c.args[1] === "c1") && !calls.some((c) => c.method === "in" && c.args[0] === "product_id"), calls.filter((c) => c.method === "in" || c.method === "eq"))
    check("  the second page starts past the first page's last row (keyset)", calls.some((c) => c.method === "or" && String(c.args[0]).includes(first[999].id)))
    const tax = await taxYearsInUsd(admin, "c1", read.rows, year)
    check("the 1099-K year adds every one of them (1,500 sales, $1,500.00)", tax.currentYear.transactionCount === 1500 && tax.currentYear.grossCents === 150_000, tax.currentYear)
  }
  {
    const { admin, calls } = pagedAdmin({ orders: [first.slice(0, 3)] })
    const latest = await latestCreatorOrders(admin, "c1", "*", { statuses: ["completed"], limit: 1000 })
    check("the Payouts list is the latest orders by creator, newest first, with an explicit limit", latest.length === 3 && calls.some((c) => c.method === "order" && c.args[0] === "created_at" && (c.args[1] as { ascending: boolean }).ascending === false) && calls.some((c) => c.method === "limit" && c.args[0] === 1000) && !calls.some((c) => c.method === "in" && c.args[0] === "product_id"))
  }
  const customers = readCode("app/app/customers/page.tsx")
  check("Customers reads its orders by creator, a page at a time", /readCreatorOrders<CustomerOrder>\(admin, creator\.id, CUSTOMER_ORDER_COLUMNS\)/.test(customers) && !/\.in\("product_id"/.test(customers))
  check("  and every customer, a page at a time", /readByKeyset<CustomerRow>\(/.test(customers) && /\.from\("customers"\)/.test(customers) && /\.limit\(KEYSET_PAGE\)/.test(customers))
  check("  newest first, as the list showed them", (customers.match(/r\.rows\.reverse\(\)/g) ?? []).length === 2)
  check("  each customer's orders from one pass, not a filter per customer", /ordersByEmail\.get\(emailKey\(email\)\)/.test(customers) && !/allOrders\?\.filter/.test(customers))
  check("  never an ECB download from the render", /storeCurrency, \{ noFetch: true \}\)/.test(customers))
  const payouts = readCode("app/app/payouts/page.tsx")
  check("Payouts: no product id list, no unpaged tax or dispute read", !/\.in\("product_id"/.test(payouts) && /readCreatorOrders<[^>]+>\(adminSupabase, creator\.id, "id, amount_cents, created_at, status, currency"/.test(payouts) && /statuses: \["disputed"\]/.test(payouts))
  check("  the products by a Map, with only the columns the list draws", /productById\.get\(order\.product_id\)/.test(payouts) && !/products\.find\(/.test(payouts) && /\.from\("products"\)\.select\("id, title, thumbnail_url, type"\)/.test(payouts))
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
