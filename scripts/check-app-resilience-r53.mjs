/**
 * ===========================================================================
 *  ROUND 53: WHAT A SELLER SEES WHEN THE DATABASE IS SLOW OR FLAKY, COUNTED
 * ===========================================================================
 * The owner: "I still sometimes get things not responding across the whole
 * app, and 'Storelib is not answering right now'. Make sure this never
 * happens anywhere."
 *
 * `next dev` of this checkout against a stand in Supabase
 * (scripts/supabase-stub-server.mjs) behind a front that does, to every
 * database request (PostgREST, /rest/v1), one of:
 *
 *   ok        answers after DELAY ms
 *   slow      answers after a random 2 to 10 s (SLOW_MIN_MS..SLOW_MAX_MS)
 *   flaky10   10% of requests fail, the rest on time
 *   flaky30   30% fail
 *
 * A failure is one of the four production showed, in turn: a 503 with
 * PostgREST's JSON, a 500 statement timeout (57014), a 504 "timed out
 * acquiring connection from connection pool" (PGRST003), and a connection
 * reset. Auth answers on time in every mode: this is about the database.
 *
 * Every page is loaded whole in Chromium TRIES times per mode, and counted:
 *
 *   screen    the whole page "Storelib is not answering right now"
 *             (components/app/service-unavailable, data-service-unavailable
 *             ="screen") was on screen at any moment
 *   error     the page's own error screen at the end (the shell kept)
 *   page      the page, drawn
 *   timeout   nothing settled within LIMIT_MS
 *
 * and, for each page drawn, the SECTIONS that went missing: every heading
 * and labelled region the page has with the database on time, missing from
 * the same page drawn in a failing mode, while no Try again, retry or
 * spinner stands where it was ("silently").
 *
 *   node scripts/check-app-resilience-r53.mjs
 *   MODES=flaky30 PAGES=/app,/app/orders TRIES=6 node scripts/check-app-resilience-r53.mjs
 *   R53_JSON=file.json ...   every number written to a file
 */
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createServer, request as httpRequest } from "node:http"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const STUB_PORT = Number(process.env.STUB_PORT || 54731)
const INNER_PORT = STUB_PORT + 1
const PORT = Number(process.env.PORT || 3953)
const BASE = `http://localhost:${PORT}`
/* Started under a name of its own, so a `pkill -f "next dev"` meant for another server leaves this one running. */
const NEXT_BIN = (() => {
  const dir = join(tmpdir(), `storelib-r53-${process.pid}`)
  const bin = join(dir, "storelib-r53-dev.js")
  if (!existsSync(bin)) {
    mkdirSync(dir, { recursive: true })
    symlinkSync(resolve("node_modules/next/dist/bin/next"), bin)
  }
  return bin
})()
const DELAY = Number(process.env.DELAY || 60)
const SLOW_MIN_MS = Number(process.env.SLOW_MIN_MS || 2_000)
const SLOW_MAX_MS = Number(process.env.SLOW_MAX_MS || 10_000)
const TRIES = Number(process.env.TRIES || 3)
const LIMIT_MS = Number(process.env.LIMIT_MS || 75_000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (...a) => console.log(...a)

/* A seeded random, so a before and an after run see the same sequence of failures. */
let seed = Number(process.env.SEED || 53)
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

/* ── The stand in ─────────────────────────────────────────────────────── */
const AT = "2026-10-01T10:00:00.000Z"
const USER = { id: "11111111-1111-4111-8111-000000000053", aud: "authenticated", role: "authenticated", email: "res@example.com", email_confirmed_at: AT, app_metadata: { provider: "email" }, user_metadata: { full_name: "Ana Res" }, created_at: AT, updated_at: AT }
const CREATOR = "22222222-2222-4222-8222-000000000053"
const PRODUCT = "33333333-3333-4333-8333-000000000053"
const tables = {
  profiles: [{ id: USER.id, display_name: "Ana Res", username: "anares", email: USER.email, email_verified: true, is_creator: true, welcome_completed: true, avatar_url: null, created_at: AT }],
  creators: [{ id: CREATOR, user_id: USER.id, slug: "anares", username: "anares", display_name: "Ana Res", bio: "Film presets and prints.", onboarding_completed: true, store_published: true, payouts_enabled: false, charges_enabled: false, stripe_onboarding_status: "not_connected", stripe_account_id: null, subscription_plan_id: "free", created_at: AT }],
  products: [{ id: PRODUCT, creator_id: CREATOR, title: "Film presets", slug: "film-presets", type: "digital", price: 1200, price_cents: 1200, currency: "USD", status: "published", is_published: true, archived: false, created_at: AT, updated_at: AT }],
  orders: [{ id: "44444444-4444-4444-8444-000000000053", creator_id: CREATOR, product_id: PRODUCT, amount_cents: 1200, currency: "usd", status: "completed", buyer_email: "buyer@example.com", created_at: AT }],
  onepages: [{ id: "55555555-5555-4555-8555-000000000053", owner_id: USER.id, creator_id: CREATOR, slug: "anares", title: "Ana Res", status: "published", created_at: AT, updated_at: AT }],
  coupons: [{ id: "66666666-6666-4666-8666-000000000053", creator_id: CREATOR, code: "HELLO10", discount_type: "percent", discount_value: 10, is_active: true, usage_count: 2, created_at: AT }],
  subscribers: [{ id: "77777777-7777-4777-8777-000000000053", creator_id: CREATOR, email: "fan@example.com", status: "subscribed", created_at: AT }],
}

const MODES = (process.env.MODES || "ok,slow,flaky10,flaky30").split(",")
const mode = { now: "ok" }
const FAILS = ["503", "500", "504", "reset"]
let failIndex = 0
const counts = { db: 0, failed: 0 }

async function serveFront() {
  const inner = await serveSupabaseStub({ port: INNER_PORT, tables, users: [USER] })
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`)
    const isDb = url.pathname.startsWith("/rest/v1/")
    const forward = () => {
      const fwd = httpRequest({ host: "127.0.0.1", port: INNER_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode || 502, r.headers)
        r.pipe(res)
      })
      fwd.on("error", () => { res.writeHead(502); res.end() })
      req.pipe(fwd)
    }
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" })
      res.end(JSON.stringify(body))
    }
    const fail = () => {
      counts.failed++
      const kind = FAILS[failIndex++ % FAILS.length]
      if (kind === "503") return json(503, { message: "upstream unavailable" })
      if (kind === "500") return json(500, { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null })
      if (kind === "504") return json(504, { code: "PGRST003", message: "Timed out acquiring connection from connection pool.", details: null, hint: null })
      req.socket.destroy()
    }
    if (!isDb) return setTimeout(forward, DELAY)
    counts.db++
    if (mode.now === "slow") return setTimeout(forward, SLOW_MIN_MS + Math.round(rand() * (SLOW_MAX_MS - SLOW_MIN_MS)))
    if (mode.now.startsWith("flaky")) {
      const p = Number(mode.now.slice(5)) / 100
      if (rand() < p) return setTimeout(fail, DELAY)
    }
    setTimeout(forward, DELAY)
  })
  await new Promise((r) => server.listen(STUB_PORT, "127.0.0.1", r))
  return { inner, close: () => { server.close(); inner.server.close() } }
}

const front = await serveFront()
const env = {
  ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "probe-anon-key", SUPABASE_SERVICE_ROLE_KEY: "probe-service-role-key-long-enough",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: BASE,
}
let next = null
let log = ""
if (process.env.NO_SERVER !== "1") {
  next = spawn(process.execPath, ["--max-old-space-size=4096", NEXT_BIN, "dev", "--turbopack", "-p", String(PORT), "-H", "localhost"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
  const LOG = process.env.NEXT_LOG || null
  next.on("exit", (code, sig) => {
    console.log(`  next dev exited ${code ?? ""} ${sig ?? ""}: the numbers after this are not the app's\n${log.slice(-1500)}`)
    process.exit(2)
  })
  next.stdout.on("data", (d) => { log = (log + d).slice(-20_000); if (LOG) appendFileSync(LOG, d) })
  next.stderr.on("data", (d) => { log = (log + d).slice(-20_000); if (LOG) appendFileSync(LOG, d) })
}
process.on("exit", () => { next?.kill("SIGKILL"); front.close() })
let up = false
for (let i = 0; i < 300 && !up; i++) {
  await sleep(1500)
  up = await fetch(`${BASE}/robots.txt`).then((r) => r.status > 0).catch(() => false)
}
if (!up) { console.error(`next dev did not come up\n${log.slice(-3000)}`); process.exit(1) }

const cookie = front.inner.sessionCookie(USER.id)
const consent = `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`
const APP_PAGES = "/app,/app/products,/app/orders,/app/customers,/app/coupons,/app/analytics,/app/emails,/app/payouts,/app/settings,/app/website-builder,/app/onepage,/app/creator-page,/app/community,/app/courses,/app/memberships,/app/offers,/app/reviews,/app/files,/app/integrations,/app/inventory,/app/collections,/app/sites,/app/help"
const PUBLIC_PAGES = "/,/anares,/explore,/pricing"
const PAGES = (process.env.PAGES || `${APP_PAGES},${PUBLIC_PAGES}`).split(",")
const signedIn = (p) => p.startsWith("/app")

const { default: puppeteer } = await import("puppeteer-core")
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, protocolTimeout: 240_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

/* Marks the moment the whole page screen is up, even when a retry takes it down again before the end. */
const WATCH = () => {
  window.__screenSeen = 0
  const look = () => {
    if (document.querySelector('[data-service-unavailable="screen"]')) window.__screenSeen++
  }
  new MutationObserver(look).observe(document, { childList: true, subtree: true })
  document.addEventListener("DOMContentLoaded", look)
}

/** The page's headings and labelled regions, as words: what "a section" is here. */
const SECTIONS = () => {
  const norm = (s) => s.replace(/\s+/g, " ").replace(/\d[\d.,:%$€£]*/g, "#").trim().slice(0, 60)
  const root = document.querySelector("main") || document.body
  const seen = new Set()
  for (const el of root.querySelectorAll("h1,h2,h3,[role=heading],section[aria-label],[aria-labelledby]")) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const label = el.getAttribute("aria-label") || el.textContent || ""
    const n = norm(label)
    if (n) seen.add(n)
  }
  return [...seen]
}

async function settle(page, t0) {
  let last = null
  let quiet = 0
  while (Date.now() - t0 < LIMIT_MS) {
    const s = await page.evaluate(() => ({
      path: location.pathname,
      screen: !!document.querySelector('[data-service-unavailable="screen"]'),
      error: /Something went wrong on this page|This page is out of date/.test(document.body?.innerText || ""),
      busy: !!document.querySelector("[data-app-slow-page], [aria-busy='true'], [data-app-quiet-retry]"),
      text: (document.querySelector("main")?.innerText || document.body?.innerText || "").length,
      seen: window.__screenSeen || 0,
    })).catch(() => null)
    if (s) {
      last = s
      if (s.path.startsWith("/login")) return { outcome: "login", ...s }
      /* Settled: nothing busy for a second, and something drawn. */
      if (!s.busy && s.text > 0) quiet++
      else quiet = 0
      if (quiet >= 8) return { outcome: s.screen ? "screen" : s.error ? "error" : "page", ...s }
    }
    await sleep(150)
  }
  return { outcome: "timeout", ...(last || {}) }
}

async function visit(ctx, path) {
  const page = await ctx.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.evaluateOnNewDocument(WATCH)
  const t0 = Date.now()
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: LIMIT_MS }).catch(() => null)
  const r = await settle(page, t0)
  r.ms = Date.now() - t0
  r.sections = r.outcome === "page" || r.outcome === "error" ? await page.evaluate(SECTIONS).catch(() => []) : []
  /* What stands where a part could not be read: a Try again, a retry, a spinner. */
  r.retryShown = await page.evaluate(() => /Try again|Retry|Could not load|did not load/i.test(document.querySelector("main")?.innerText || "")).catch(() => false)
  r.screenSeen = (await page.evaluate(() => window.__screenSeen || 0).catch(() => 0)) > 0 || r.outcome === "screen"
  await page.close()
  return r
}

async function contextFor(path) {
  const ctx = await browser.createBrowserContext()
  const cookies = [{ name: "storelib_consent", value: consent, url: BASE }]
  if (signedIn(path)) cookies.push({ name: cookie.name, value: cookie.value, url: BASE })
  const p = await ctx.newPage()
  await p.setCookie(...cookies)
  await p.close()
  return ctx
}

/* A development server compiles each page on its first visit: every page once, on time, before anything is counted. */
mode.now = "ok"
for (const p of PAGES) {
  const ctx = await contextFor(p)
  const r = await visit(ctx, p)
  out(`  warm ${p} ${r.outcome} ${r.ms}ms`)
  await ctx.close()
}

const baseline = {}
const results = {}
for (const m of MODES) {
  mode.now = m
  counts.db = 0
  counts.failed = 0
  const tries = m === "ok" ? 1 : m === "slow" ? Math.max(1, Math.ceil(TRIES / 2)) : TRIES
  out(`\n${m.toUpperCase()}: ${m === "ok" ? `every answer ${DELAY}ms late` : m === "slow" ? `every database answer ${SLOW_MIN_MS / 1000} to ${SLOW_MAX_MS / 1000}s late` : `${m.slice(5)}% of database requests fail`}, ${tries} load${tries === 1 ? "" : "s"} a page`)
  out("  page                      screen  error  page  timeout  slowest   missing silently")
  results[m] = { pages: {}, screen: 0, loads: 0 }
  for (const p of PAGES) {
    const row = { screen: 0, error: 0, page: 0, timeout: 0, login: 0, slowest: 0, missing: {} }
    for (let i = 0; i < tries; i++) {
      const ctx = await contextFor(p)
      const r = await visit(ctx, p)
      await ctx.close()
      if (r.screenSeen) row.screen++
      row[r.outcome === "screen" ? "screen_end" : r.outcome] = (row[r.outcome === "screen" ? "screen_end" : r.outcome] || 0) + 1
      row.slowest = Math.max(row.slowest, r.ms)
      if (m === "ok") baseline[p] = r.sections
      else if (r.outcome === "page" && !r.retryShown) {
        for (const s of baseline[p] || []) if (!r.sections.includes(s)) row.missing[s] = (row.missing[s] || 0) + 1
      }
    }
    results[m].pages[p] = row
    results[m].screen += row.screen
    results[m].loads += tries
    const missing = Object.entries(row.missing).map(([s, n]) => `${s} (${n})`).join("; ")
    out(`  ${p.padEnd(26)}${String(row.screen).padEnd(8)}${String(row.error).padEnd(7)}${String(row.page).padEnd(6)}${String(row.timeout + row.login).padEnd(9)}${String(row.slowest).padEnd(10)}${missing}`)
  }
  results[m].dbRequests = counts.db
  results[m].dbFailed = counts.failed
  out(`  whole page screen on ${results[m].screen} of ${results[m].loads} loads; ${counts.failed} of ${counts.db} database requests failed`)
}
results.baseline = baseline
await browser.close()
if (process.env.R53_JSON) writeFileSync(process.env.R53_JSON, JSON.stringify(results, null, 1))
process.exit(0)
