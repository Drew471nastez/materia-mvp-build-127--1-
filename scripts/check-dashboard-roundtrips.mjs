/**
 * ===========================================================================
 *  THE DASHBOARD'S ROUND TRIPS, COUNTED PER NAVIGATION
 * ===========================================================================
 * A production build (`next start`) reading the Supabase stub
 * (scripts/supabase-stub-server.mjs), signed in as one creator, in a real
 * Chromium. It opens /app and then moves through the sidebar the way a
 * person does, a click on each link, and for every move it counts:
 *
 *   api        the browser's calls to Storelib's own /api routes
 *   rsc        the router's requests for the page's server render
 *   db.server  Supabase requests the server made for that move
 *   db.browser Supabase requests the browser made itself
 *   ms         from the click until the last request of the move ended
 *
 * plus every call made twice in one move (the same method and address),
 * which is always a fault. Then it walks the same loop five more times and
 * reads the JS heap after a forced collection, so a page that keeps
 * something after it is left shows as growth.
 *
 * Build pointed at the stub first:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
 *   SUPABASE_SERVICE_ROLE_KEY=placeholder STRIPE_SECRET_KEY=sk_test_placeholder
 *   RESEND_API_KEY=re_placeholder pnpm build
 *   node scripts/check-dashboard-roundtrips.mjs              print the table
 *   node scripts/check-dashboard-roundtrips.mjs --budget     also fail on a page over perf-budgets.json "dashboard"
 *   node scripts/check-dashboard-roundtrips.mjs --json F     write the figures to F
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE || "http://127.0.0.1:3981").replace(/\/$/, "")
const args = process.argv.slice(2)
const BUDGET = args.includes("--budget")
const jsonAt = args.indexOf("--json")
const JSON_OUT = jsonAt >= 0 ? args[jsonAt + 1] : null
const LOOPS = Number(process.env.LOOPS || 5)
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
if (!existsSync(".next/BUILD_ID")) { console.error("No production build. Build pointed at the stub first (see the top of this file)."); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The fixture: one creator with a few products and orders ───────────── */
const at = "2026-10-01T10:00:00.000Z"
const USER = "11111111-1111-4111-8111-111111111111"
const C = "22222222-2222-4222-8222-222222222222"
const HANDLE = "satori"
const person = { id: USER, aud: "authenticated", role: "authenticated", email: "hi@satori.studio", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: { full_name: "Satori Studio" }, created_at: at, updated_at: at }
const product = (n) => ({
  id: `33333333-3333-4333-8333-00000000000${n}`, creator_id: C, seller_id: C, title: `Loop Pack ${n}`, slug: `loop-pack-${n}`, description: "Loops.", price_cents: 2900, currency: "usd",
  status: "published", archived: false, type: "digital", product_type: "digital", thumbnail_url: null, gallery_urls: [], images: [], created_at: at, updated_at: at,
  product_categories: [], reviews_count: 0, reviews_average: 0, sales_count: 1, category: "music", pay_what_you_want: false, pwyw_min_price_cents: null, compare_at_cents: null,
})
const products = [1, 2, 3, 4].map(product)
const order = (n) => ({ id: `77777777-7777-4777-8777-00000000000${n}`, product_id: products[n % 4].id, creator_id: C, seller_id: C, buyer_email: `b${n}@example.com`, status: "completed", amount_cents: 2900, total_cents: 2900, currency: "usd", created_at: `2026-10-0${n}T10:00:00.000Z`, updated_at: at })
const tables = {
  profiles: [{ id: USER, username: HANDLE, display_name: "Satori Studio", avatar_url: null, email: person.email, email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
  creators: [{ id: C, user_id: USER, slug: HANDLE, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", currency: "usd", created_at: at }],
  products,
  orders: [1, 2, 3, 4, 5].map(order),
}

/* ── The stub, told apart: the browser sends an Origin, the server does not ── */
/* STUB_DELAY_MS: each database answer that late (a real database is 10 to 50 ms away), so serial trips show in the times. */
const stub = await serveSupabaseStub({ port: 54321, tables, users: [person], delayMs: Number(process.env.STUB_DELAY_MS || 0) })
const dbHits = []
stub.server.on("request", (req) => {
  if (req.method === "OPTIONS") return
  dbHits.push({ at: Date.now(), from: req.headers.origin ? "browser" : "server", what: `${req.method} ${req.url.split("?")[0]}` })
})

const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
}
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", new URL(BASE).port, "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] })
let serverOut = ""
next.stdout.on("data", (d) => { serverOut += d })
next.stderr.on("data", (d) => { serverOut += d })
let up = false
for (let i = 0; i < 150 && !up; i++) {
  try { up = (await fetch(`${BASE}/robots.txt`)).status < 500 } catch { await sleep(200) }
}
if (!up) { console.error(`next start did not come up\n${serverOut.slice(-2000)}`); process.exit(1) }
process.on("exit", () => { next.kill(); stub.server.close() })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const c = stub.sessionCookie()
await page.setCookie({ name: c.name, value: c.value, url: BASE })
const cdp = await page.createCDPSession()

/* Every request the page makes, with when it ended. */
const inflight = new Set()
let reqs = []
let lastEnd = 0
page.on("request", (r) => { const h = r.headers(); inflight.add(r); reqs.push({ r, url: r.url(), method: r.method(), rsc: !!h["rsc"], prefetch: !!h["next-router-prefetch"], t: Date.now(), end: 0 }) })
const done = (r) => { inflight.delete(r); lastEnd = Date.now(); const x = reqs.find((q) => q.r === r); if (x) x.end = lastEnd }
page.on("requestfinished", done)
page.on("requestfailed", done)

/* A request that never ends (an event stream, a long poll) is not waited for: only what started in the move and ended. */
const LONG_LIVED = /\/realtime\/|\/events?\b|stream/
async function settle(quietMs = 600, limitMs = 20000) {
  const start = Date.now()
  let quietSince = Date.now()
  while (Date.now() - start < limitMs) {
    await sleep(50)
    if ([...inflight].some((r) => !LONG_LIVED.test(r.url()))) quietSince = Date.now()
    else if (Date.now() - quietSince >= quietMs) return
  }
  if (process.env.VERBOSE) console.log(`  (still open after ${limitMs}ms: ${[...inflight].map((r) => r.url().replace(BASE, "")).join(", ")})`)
}

await page.goto(`${BASE}/app`, { waitUntil: "load", timeout: 60000 })
if (!page.url().startsWith(`${BASE}/app`)) { console.error(`Not signed in: landed on ${page.url()}`); process.exit(1) }
await settle(1000)

const STOPS = process.env.STOPS ? process.env.STOPS.split(",") : ["/app/products", "/app/orders", "/app/analytics", "/app/emails", "/app/customers", "/app/coupons", "/app/payouts", "/app/settings", "/app"]

/* FULL=1: every stop opened as a full page load (a deep link, a reload, the app's cold start) instead of a click. */
const FULL = process.env.FULL === "1"

async function move(href) {
  reqs = []
  /* One left open by the move before (a keepalive write) is not this move's. */
  inflight.clear()
  const dbFrom = dbHits.length
  const t0 = Date.now()
  lastEnd = t0
  const clicked = FULL ? (await page.goto(`${BASE}${href}`, { waitUntil: "load", timeout: 60000 }), true) : await page.evaluate((h) => {
    const a = [...document.querySelectorAll(`a[href="${h}"]`)].find((x) => x.getBoundingClientRect().width > 0)
    if (!a) return false
    a.click()
    return true
  }, href)
  if (!clicked) await page.evaluate((h) => { window.history.pushState(null, "", h); window.dispatchEvent(new PopStateEvent("popstate")) }, href)
  for (let i = 0; i < 200 && new URL(page.url()).pathname !== href; i++) await sleep(25)
  const urlAt = Date.now()
  await settle()
  /* The page's own server render, when the router had to ask for it (not a prefetch): the move is drawn once it has come. */
  const nav = reqs.find((x) => x.rsc && !x.prefetch && x.url.startsWith(BASE) && new URL(x.url).pathname === href)
  const mine = reqs.filter((x) => x.url.startsWith(BASE))
  const api = mine.filter((x) => new URL(x.url).pathname.startsWith("/api/"))
  const db = dbHits.slice(dbFrom)
  const keys = [...api, ...reqs.filter((x) => x.url.includes(":54321/"))].map((x) => `${x.method} ${x.url.replace(BASE, "")}`)
  const twice = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))]
  return {
    href, clicked,
    ms: Math.max(0, lastEnd - t0),
    navMs: Math.max(0, (nav?.end || urlAt) - t0),
    api: api.length, apiList: api.map((x) => `${x.method} ${new URL(x.url).pathname}${new URL(x.url).search}`),
    rsc: mine.filter((x) => x.rsc || new URL(x.url).searchParams.has("_rsc")).length,
    rscList: mine.filter((x) => x.rsc || new URL(x.url).searchParams.has("_rsc")).map((x) => new URL(x.url).pathname + new URL(x.url).search.replace(/_rsc=[^&]+&?/, "")),
    dbServer: db.filter((d) => d.from === "server").length,
    /* Supabase Auth itself (/auth/v1/: getUser, a refresh, the signing keys), server and browser together: the repeated verification this counts. */
    auth: db.filter((d) => d.what.includes("/auth/v1/")).length,
    dbBrowser: db.filter((d) => d.from === "browser").length,
    dbList: db.map((d) => `${d.from[0]} ${d.what}`),
    twice,
  }
}

const first = []
for (const href of STOPS) first.push(await move(href))

async function heapMb() {
  await cdp.send("HeapProfiler.collectGarbage")
  await sleep(200)
  await cdp.send("HeapProfiler.collectGarbage")
  const { usedSize } = await cdp.send("Runtime.getHeapUsage")
  return Math.round((usedSize / 1048576) * 10) / 10
}
const heap = [await heapMb()]
const domAfter = [(await cdp.send("Memory.getDOMCounters")).nodes]
for (let i = 0; i < LOOPS; i++) {
  for (const href of STOPS) await move(href)
  heap.push(await heapMb())
  domAfter.push((await cdp.send("Memory.getDOMCounters")).nodes)
}
const { nodes, jsEventListeners } = await cdp.send("Memory.getDOMCounters")
/* HEAP_SNAPSHOT=<file>: the heap after the loops, for a retainer hunt in DevTools. */
if (process.env.HEAP_SNAPSHOT) {
  const parts = []
  cdp.on("HeapProfiler.addHeapSnapshotChunk", (e) => parts.push(e.chunk))
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false })
  writeFileSync(process.env.HEAP_SNAPSHOT, parts.join(""))
}

console.log(`\n  ${FULL ? "full loads" : "clicks"}\n  page                nav   all   api  rsc  db.server  db.browser  auth  twice`)
for (const r of first) {
  console.log(`  ${r.href.padEnd(18)} ${String(r.navMs).padStart(5)} ${String(r.ms).padStart(5)} ${String(r.api).padStart(5)} ${String(r.rsc).padStart(4)} ${String(r.dbServer).padStart(10)} ${String(r.dbBrowser).padStart(11)} ${String(r.auth).padStart(5)}  ${r.twice.length ? r.twice.join(", ") : "-"}${r.clicked ? "" : "  (no link: pushed)"}`)
}
const total = (k) => first.reduce((n, r) => n + r[k], 0)
console.log(`  ${"all".padEnd(18)} ${String(total("navMs")).padStart(5)} ${String(total("ms")).padStart(5)} ${String(total("api")).padStart(5)} ${String(total("rsc")).padStart(4)} ${String(total("dbServer")).padStart(10)} ${String(total("dbBrowser")).padStart(11)} ${String(total("auth")).padStart(5)}`)
console.log(`\n  heap after each loop of ${STOPS.length} moves (MB, after GC): ${heap.join(" → ")}`)
console.log(`  DOM nodes after each loop (live and detached): ${domAfter.join(" → ")}; listeners ${jsEventListeners}`)
if (process.env.VERBOSE) for (const r of first) console.log(`\n  ${r.href}\n    api: ${r.apiList.join(", ") || "-"}\n    rsc: ${r.rscList.join(", ") || "-"}\n    db: ${r.dbList.join(", ") || "-"}`)

const out = { measuredAt: new Date().toISOString(), moves: first, heapMb: heap, domNodes: domAfter, listeners: jsEventListeners }
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2))

let failed = 0
if (BUDGET) {
  const budgets = JSON.parse(readFileSync("perf-budgets.json", "utf8")).dashboard
  if (!budgets) { console.error("perf-budgets.json has no \"dashboard\" section"); process.exit(1) }
  for (const r of first) {
    const b = budgets.pages?.[r.href]
    if (!b) continue
    for (const k of ["api", "dbServer", "dbBrowser"]) {
      if (r[k] > b[k]) { console.log(`  FAIL  ${r.href}: ${k} ${r[k]} over its budget of ${b[k]}`); failed++ }
    }
    if (r.twice.length) { console.log(`  FAIL  ${r.href}: asked twice: ${r.twice.join(", ")}`); failed++ }
  }
  const growth = heap[heap.length - 1] - heap[1]
  if (growth > budgets.heapGrowthMb) { console.log(`  FAIL  the heap grew ${growth.toFixed(1)} MB over ${LOOPS - 1} loops (budget ${budgets.heapGrowthMb})`); failed++ }
  /* Detached nodes that are never collected: a page that keeps the tree it left (Home did, ~500 nodes a visit, until round 12). */
  const domGrowth = domAfter[domAfter.length - 1] - domAfter[1]
  if (domGrowth > budgets.domGrowthNodes) { console.log(`  FAIL  ${domGrowth} more DOM nodes after ${LOOPS - 1} more loops (budget ${budgets.domGrowthNodes}): something keeps a page it left`); failed++ }
  console.log(failed ? `\n${failed} over budget` : "\n  every page within its budget")
}
await browser.close()
process.exit(failed ? 1 : 0)
