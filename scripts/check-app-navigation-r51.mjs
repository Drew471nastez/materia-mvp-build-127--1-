/**
 * ===========================================================================
 *  ROUND 51: /app NAVIGATION WHEN SUPABASE IS SLOW OR DOWN, MEASURED
 * ===========================================================================
 * The owner: "the database, I think, is not responding, which breaks
 * navigation in the web app, sometimes really bad. It feels like the
 * internet drops."
 *
 * `next dev` of this checkout against a stand in Supabase
 * (scripts/supabase-stub-server.mjs) behind a front that can hold or fail
 * what it is asked, and logs when each request started and ended:
 *
 *   TRIPS     every page below, loaded whole: the database requests its
 *             server render made, and how many of them were in series
 *             (waves: a request that starts after an earlier one ended is
 *             the next wave). Every answer is DELAY ms late, so a wave
 *             costs DELAY.
 *   MOVES     a signed in browser on /app moving between the same pages by
 *             the sidebar, with every database answer on time, then held
 *             SLOW_MS, then failed (503): time from the press to the new
 *             page's address and its content, the error screen, /login.
 *
 *   node scripts/check-app-navigation-r51.mjs
 *   ONLY=trips|moves node scripts/check-app-navigation-r51.mjs
 *   R51_JSON=1 ...   one JSON line with every number at the end
 */
import { spawn } from "node:child_process"
import { appendFileSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const STUB_PORT = Number(process.env.STUB_PORT || 54451)
const INNER_PORT = STUB_PORT + 1
const PORT = Number(process.env.PORT || 3951)
const BASE = `http://localhost:${PORT}`
const NEXT_BIN = "node_modules/next/dist/bin/next"
const DELAY = Number(process.env.DELAY || 250)
const SLOW_MS = Number(process.env.SLOW_MS || 12_000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (...a) => console.log(...a)
const results = {}

/* ── The stand in ─────────────────────────────────────────────────────── */
const AT = "2026-10-01T10:00:00.000Z"
const USER = { id: "11111111-1111-4111-8111-000000000051", aud: "authenticated", role: "authenticated", email: "nav@example.com", email_confirmed_at: AT, app_metadata: { provider: "email" }, user_metadata: { full_name: "Ana Nav" }, created_at: AT, updated_at: AT }
const CREATOR = "22222222-2222-4222-8222-000000000051"
const tables = {
  profiles: [{ id: USER.id, display_name: "Ana Nav", username: "ananav", email_verified: true, is_creator: true, welcome_completed: true, avatar_url: null }],
  creators: [{ id: CREATOR, user_id: USER.id, slug: "ananav", username: "ananav", display_name: "Ana Nav", onboarding_completed: true, store_published: true, payouts_enabled: false, charges_enabled: false, stripe_onboarding_status: "not_connected", stripe_account_id: null, subscription_plan_id: "free", created_at: AT }],
  products: [{ id: "33333333-3333-4333-8333-000000000051", creator_id: CREATOR, title: "Film presets", slug: "film-presets", price: 1200, currency: "USD", status: "published", is_published: true, created_at: AT, updated_at: AT }],
}

/** "ok", "slow" (held SLOW_MS), "fail" (503): what the front does with a database request. */
const mode = { now: "ok", delay: DELAY }
const trips = []
/** The browser's RSC requests, for telling a move the router answered from its cache from one it had to ask for. */
const rscLog = []
async function serveFront() {
  const inner = await serveSupabaseStub({ port: INNER_PORT, tables, users: [USER] })
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`)
    const isDb = url.pathname.startsWith("/rest/v1/")
    const isAuth = url.pathname.startsWith("/auth/v1/")
    const trip = { path: `${req.method} ${url.pathname.replace("/rest/v1/", "")}${process.env.TRIP_DETAIL === "2" ? decodeURIComponent(url.search).slice(0, 160) : ""}`, start: Date.now(), end: 0, db: isDb, auth: isAuth, ua: req.headers["user-agent"] || "" }
    trips.push(trip)
    const forward = () => {
      const fwd = httpRequest({ host: "127.0.0.1", port: INNER_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode || 502, r.headers)
        r.pipe(res)
        r.on("end", () => { trip.end = Date.now() })
      })
      fwd.on("error", () => { res.writeHead(502); res.end() })
      req.pipe(fwd)
    }
    const fail = () => {
      trip.end = Date.now()
      res.writeHead(503, { "content-type": "application/json", "access-control-allow-origin": "*" })
      res.end(JSON.stringify({ message: "upstream unavailable" }))
    }
    /* Auth answers on time in every mode: this is about the database. */
    if (isDb && mode.now === "fail") return setTimeout(fail, 50)
    if (isDb && mode.now === "slow") return setTimeout(forward, SLOW_MS)
    setTimeout(forward, mode.delay)
  })
  await new Promise((r) => server.listen(STUB_PORT, "127.0.0.1", r))
  return { inner, close: () => { server.close(); inner.server.close() } }
}

/** How many of these requests were in series: a request that starts after an earlier one ended opens the next wave. */
function waves(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  let depth = 0
  const levelOf = new Map()
  for (const t of sorted) {
    let level = 1
    for (const p of sorted) {
      if (p === t || !p.end || p.end > t.start) continue
      level = Math.max(level, (levelOf.get(p) ?? 1) + 1)
    }
    levelOf.set(t, level)
    depth = Math.max(depth, level)
  }
  return depth
}

const front = await serveFront()
const env = {
  ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "probe-anon-key", SUPABASE_SERVICE_ROLE_KEY: "probe-service-role-key-long-enough",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: BASE,
}
/* NO_SERVER=1: a `next dev` started by hand on this stand in (SERVE_ONLY=1 prints the command), kept between runs. */
let next = null
let log = ""
if (process.env.NO_SERVER !== "1") {
  next = spawn(process.execPath, ["--max-old-space-size=4096", NEXT_BIN, "dev", "--turbopack", "-p", String(PORT), "-H", "localhost"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
  const LOG = process.env.NEXT_LOG || null
  next.on("exit", (code, sig) => console.log(`  next dev exited ${code ?? ""} ${sig ?? ""}\n${log.slice(-1500)}`))
  next.stdout.on("data", (d) => { log += d; if (LOG) appendFileSync(LOG, d) })
  next.stderr.on("data", (d) => { log += d; if (LOG) appendFileSync(LOG, d) })
}
process.on("exit", () => { next?.kill("SIGKILL"); front.close() })
let up = false
for (let i = 0; i < 300 && !up; i++) {
  await sleep(1500)
  up = await fetch(`${BASE}/robots.txt`).then((r) => r.status > 0).catch(() => false)
}
if (!up) { console.error(`next dev did not come up\n${log.slice(-3000)}`); process.exit(1) }

const cookie = front.inner.sessionCookie(USER.id)
const cookieHeader = `${cookie.name}=${cookie.value}; storelib_consent=2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`
const PAGES = (process.env.PAGES || "/app,/app/products,/app/orders,/app/coupons,/app/analytics,/app/customers,/app/website-builder,/app/settings,/app/payouts,/app/emails").split(",")

async function load(path) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: cookieHeader } }).catch((e) => ({ status: String(e), text: async () => "" }))
  const html = await r.text()
  return { status: r.status, ms: Date.now() - t0, location: r.headers?.get?.("location") ?? null, html }
}

/* A development server compiles each page on its first visit: every page is asked twice before anything is measured. */
for (const p of PAGES) {
  for (let i = 0; i < 2; i++) {
    const r = await load(p)
    if (i === 1) out(`  warm ${p} ${r.status}${r.location ? ` -> ${r.location}` : ""} ${r.ms}ms`)
  }
}

if (!process.env.ONLY || process.env.ONLY === "trips") {
  out(`\nTRIPS: database requests per full page load, every answer ${DELAY}ms late`)
  out("  page                      status  db  auth  in series  server ms")
  results.trips = {}
  for (const p of PAGES) {
    await sleep(300)
    const from = trips.length
    const r = await load(p)
    await sleep(200)
    const mine = trips.slice(from).filter((t) => t.ua.includes("node") || !t.ua.includes("Mozilla"))
    const db = mine.filter((t) => t.db)
    const series = waves(mine)
    results.trips[p] = { status: r.status, db: db.length, auth: mine.filter((t) => t.auth).length, series, ms: r.ms }
    out(`  ${p.padEnd(26)}${String(r.status).padEnd(8)}${String(db.length).padEnd(4)}${String(mine.length - db.length).padEnd(6)}${String(series).padEnd(11)}${r.ms}`)
    if (process.env.TRIP_DETAIL) for (const t of mine.sort((a, b) => a.start - b.start)) out(`      ${t.start - mine[0].start}..${t.end - mine[0].start}  ${t.path}`)
  }
}

if (!process.env.ONLY || process.env.ONLY === "moves") {
  const { default: puppeteer } = await import("puppeteer-core")
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, protocolTimeout: 180_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  results.moves = {}
  for (const run of (process.env.MODES || "ok,slow,fail,slow-warm,fail-warm").split(",")) {
    const how = run.replace("-warm", "")
    const warm = run.endsWith("-warm")
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    /* The router's own requests: a move answered from its cache sends none for the page. */
    page.on("request", (req) => {
      const h = req.headers()
      if (!h.rsc) return
      rscLog.push({ at: Date.now(), path: new URL(req.url()).pathname, prefetch: !!h["next-router-prefetch"] })
    })
    await page.setCookie({ name: cookie.name, value: cookie.value, url: BASE }, { name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
    mode.now = "ok"
    await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle2", timeout: 120_000 })
    /* "-warm": every page visited once on time first, which is what the router holds (staleTimes) when the database then goes slow or away. */
    if (warm) {
      for (const p of PAGES) await moveTo(page, p, 30_000)
      await moveTo(page, "/app/products", 30_000)
    }
    mode.now = how
    out(`\nMOVES with the database ${how === "ok" ? "on time" : how === "slow" ? `held ${SLOW_MS}ms` : "failing (503)"}, ${warm ? "every page visited before" : "first visits"}`)
    out("  to                        address ms  content ms  db  in series  rsc  outcome")
    const rows = []
    for (const p of [...PAGES.filter((x) => x !== "/app/products"), "/app/products"]) {
      await sleep(400)
      const from = trips.length
      const rscFrom = rscLog.length
      const r = await moveTo(page, p, SLOW_MS + 8_000)
      const asked = rscLog.slice(rscFrom)
      r.asked = asked.filter((x) => !x.prefetch && x.path === p).length
      r.refetched = asked.filter((x) => !x.prefetch && x.path !== p).map((x) => x.path)
      await sleep(300)
      const mine = trips.slice(from).filter((t) => !t.ua.includes("Mozilla"))
      r.db = mine.filter((t) => t.db).length
      r.series = waves(mine)
      rows.push({ to: p, ...r })
      out(`  ${p.padEnd(26)}${String(r.addressMs ?? "-").padEnd(12)}${String(r.contentMs ?? "-").padEnd(12)}${String(r.db).padEnd(4)}${String(r.series).padEnd(11)}${String(r.asked).padEnd(5)}${r.outcome}${r.refetched.length ? `  (also asked: ${r.refetched.join(" ")})` : ""}`)
      if (process.env.TRIP_DETAIL) for (const t of mine.sort((a, b) => a.start - b.start)) out(`      ${t.start - mine[0].start}..${t.end - mine[0].start}  ${t.path}`)
    }
    const usable = rows.filter((r) => r.outcome === "page")
    results.moves[run] = { rows, failures: rows.length - usable.length, worstMs: Math.max(0, ...rows.map((r) => r.contentMs ?? SLOW_MS + 8_000)) }
    out(`  failures ${rows.length - usable.length} of ${rows.length}, worst ${results.moves[run].worstMs}ms`)
    mode.now = "ok"
    await ctx.close()
  }
  await browser.close()
}

/** A press on the sidebar's link to `path` (or a router push when there is none), and what happened. */
async function moveTo(page, path, limit) {
  const t0 = Date.now()
  const pressed = await page.evaluate((p) => {
    const a = [...document.querySelectorAll(`a[href="${p}"]`)].find((el) => el.offsetParent !== null && !el.target)
    if (a) { a.click(); return "link" }
    return null
  }, path)
  if (!pressed) {
    await page.evaluate((p) => { window.next?.router?.push(p) }, path)
  }
  let addressMs = null
  let contentMs = null
  let outcome = "timeout"
  let last = null
  while (Date.now() - t0 < limit) {
    const s = await page.evaluate(() => ({
      path: location.pathname,
      error: !!document.querySelector("[data-service-unavailable]") || /Something went wrong on this page|This page is out of date/.test(document.body.innerText),
      spinner: !!document.querySelector("[data-app-slow-page], [aria-busy='true']"),
      text: (document.querySelector("main")?.innerText || "").length,
    })).catch(() => null)
    if (s) {
      last = s
      if (s.path === "/login" || s.path.startsWith("/login")) { outcome = "login"; break }
      if (s.path === path && addressMs === null) addressMs = Date.now() - t0
      if (s.error) { outcome = "error screen"; contentMs = Date.now() - t0; break }
      if (s.path === path && !s.spinner && s.text > 0) { contentMs = Date.now() - t0; outcome = "page"; break }
    }
    await sleep(50)
  }
  if (outcome === "timeout" && last) outcome = `timeout on ${last.path}${last.spinner ? ", spinner" : ""}${last.text ? "" : ", empty"}`
  await sleep(150)
  return { addressMs, contentMs, outcome, pressed: pressed ?? "router" }
}

if (process.env.R51_JSON) out(JSON.stringify(results))
process.exit(0)
