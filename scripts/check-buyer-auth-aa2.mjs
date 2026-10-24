/**
 * ===========================================================================
 *  SIGNED IN EVERYWHERE, AT ONCE: RECEIPT, HEADER, TAB BAR, LIBRARY
 * ===========================================================================
 * The owner: "from the receipt page ... if I click create an account or
 * login ... I come back, it doesn't fully log me into the account in all
 * places ... It still shows me to sign in, even though I signed in", "the
 * header takes me back to sign in even if I'm already signed up and logged
 * in", "when logged out it should not have on mobile the mobile bottom
 * navigation bar".
 *
 * `next dev` of this checkout against a stand in Supabase that keeps its
 * writes and its people (an account made by Google during the run can sign
 * in, is read back, and owns what was attached to it), at 390x844 and
 * 1440x900:
 *
 *   SIGNED OUT   home, Explore, a creator page, a product, a receipt, login:
 *                no tab bar and no room kept for it on a phone; the header
 *                offers Log in, and that Log in comes back to the page
 *   GOOGLE NEW   a guest receipt, Create account, Continue with Google, a new
 *                account: the welcome step, then the receipt says In your
 *                library (the guest order joined the account at the
 *                callback), "Account created", header and tab bar signed in
 *   GOOGLE BACK  an account's receipt, Sign in, Continue with Google: back on
 *                the receipt, "Welcome back", no welcome step
 *   OTHER TAB    a signed out page left open while another tab signs in: its
 *                header, its tab bar and its page change without a reload,
 *                and the bar arriving moves nothing on screen
 *   BACK         back to a page from before the sign in (the browser's
 *                back/forward cache when it keeps it): signed in there too
 *   EXISTS       Create account for an address that has an account, where
 *                the look up could not answer and Supabase (with email
 *                confirmation on) answers a user with no identities: moves to
 *                sign in with the address, no code screen for a ghost
 *   LIBRARY      the library's header, signed in: the person, never Log in
 *
 *   node scripts/check-buyer-auth-aa2.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-buyer-auth-aa2.mjs
 */
import { spawn } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { fakeJwt, serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const STUB_PORT = Number(process.env.STUB_PORT || 54449)
const INNER_PORT = STUB_PORT + 1
const PORT = Number(process.env.PORT || 3949)
const BASE = (process.env.BASE || `http://localhost:${PORT}`).replace(/\/$/, "")
const NEXT_BIN = process.env.NEXT_BIN || "node_modules/next/dist/bin/next"
const shots = process.env.SHOTS_DIR || null
if (shots) mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
let passed = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (ok) passed++
  else broken++
}

/* ── The stand in database ─────────────────────────────────────────────── */
const AT = "2026-10-01T10:00:00.000Z"
const SELLER_USER = "11111111-1111-4111-8111-0000000000a2"
const CREATOR = "22222222-2222-4222-8222-0000000000a2"
const PRODUCT = "33333333-3333-4333-8333-0000000000a2"
const COURSE = "33333333-3333-4333-8333-0000000000c2"
const ASSET = "44444444-4444-4444-8444-0000000000a2"
const BUYER = { id: "99999999-9999-4999-8999-0000000000a2", aud: "authenticated", role: "authenticated", email: "ghita@example.com", email_confirmed_at: AT, app_metadata: { provider: "email", providers: ["email", "google"] }, user_metadata: { full_name: "Ghita Nastase" }, identities: [{ provider: "email" }, { provider: "google" }], created_at: AT, updated_at: AT }
const ACCOUNT_TOKEN = "acctAA2acctAA2acctAA2acctAA2acct"
const newToken = (view) => `newg${view}newg${view}newg${view}newg${view}`.slice(0, 32)
const courseToken = (view) => `crse${view}crse${view}crse${view}crse${view}`.slice(0, 32)
const freshEmail = (view) => `fresh${view}@example.com`
const order = (id, token, extra) => ({
  id, receipt_token: token, product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 1200, tip_cents: 0, currency: "usd",
  buyer_email: "guest@example.com", buyer_first_name: "Ana", buyer_id: null, stripe_session_id: null, stripe_payment_intent_id: null, created_at: AT, updated_at: AT, ...extra,
})
const product = (id, slug, title, type) => ({
  id, creator_id: CREATOR, seller_id: CREATOR, title, slug, description: "<p>Twelve presets for Lightroom.</p>", price: 12, price_cents: 1200, currency: "usd", status: "published", archived: false,
  type, product_type: type, thumbnail_url: null, cover_image_url: null, images: [], gallery_urls: [], created_at: AT, updated_at: AT, product_categories: [], category: "design", subcategory: null, reviews_count: 0, reviews_average: 0, sales_count: 3, view_count: 9, is_featured: false,
})
const tables = {
  profiles: [
    { id: SELLER_USER, username: "maria", display_name: "Maria Lens", avatar_url: null, email: "maria@example.com", email_verified: true, is_creator: true, welcome_completed: true, created_at: AT },
    { id: BUYER.id, username: "ghita", display_name: "Ghita Nastase", avatar_url: null, email: BUYER.email, email_verified: true, is_creator: false, welcome_completed: true, created_at: AT },
  ],
  creators: [{ id: CREATOR, user_id: SELLER_USER, slug: "maria", username: "maria", display_name: "Maria Lens", avatar_url: null, bio: "Presets", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: AT, niche_tags: [] }],
  products: [product(PRODUCT, "film-presets", "Film Preset Pack", "digital"), product(COURSE, "editing-course", "Editing Course", "course")],
  digital_assets: [{ id: ASSET, product_id: PRODUCT, file_name: "film-presets.zip", file_path: "maria/film-presets.zip", storage_bucket: "digital-assets", file_size: 4_200_000, mime_type: "application/zip", upload_status: "completed", scan_status: "clean", created_at: AT }],
  orders: [
    order("55555555-5555-4555-8555-0000000000a1", ACCOUNT_TOKEN, { buyer_email: BUYER.email, buyer_first_name: "Ghita", buyer_id: BUYER.id }),
    order("55555555-5555-4555-8555-0000000000b1", newToken("390"), { buyer_email: freshEmail("390"), buyer_first_name: "Ioana" }),
    order("55555555-5555-4555-8555-0000000000b2", newToken("1440"), { buyer_email: freshEmail("1440"), buyer_first_name: "Ioana" }),
    order("55555555-5555-4555-8555-0000000000c1", courseToken("390"), { product_id: COURSE, buyer_email: freshEmail("390"), buyer_first_name: "Ioana" }),
    order("55555555-5555-4555-8555-0000000000c2", courseToken("1440"), { product_id: COURSE, buyer_email: freshEmail("1440"), buyer_first_name: "Ioana" }),
  ],
  entitlements: [{ id: "66666666-6666-4666-8666-0000000000a2", buyer_id: BUYER.id, creator_id: CREATOR, product_id: PRODUCT, variant_id: null, community_access: false, created_at: AT }],
  rate_limit_hits: [], platform_settings: [{ key: "buyer_header_light", value: true }], platform_flags: [], store_builder_configs: [], follows: [], custom_domains: [], seo_overrides: [], username_history: [], reviews: [], wishlist_items: [],
}

/* ── Auth, kept: people can be made during the run and sign in again ──── */
const people = []
const addPerson = (user) => {
  const p = { user, token: fakeJwt({ sub: user.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400, email: user.email }), refresh: `probe-refresh-${user.id}` }
  people.push(p)
  return p
}
addPerson(BUYER)
const sessionOf = (p) => ({ access_token: p.token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: p.refresh, user: p.user })
/** What the next Google or Apple round trip signs in as: "new:<email>" makes an account, "back:<email>" is an existing one. */
let oauthAs = null
/** The admin user reads fail (the look up could not answer). */
let adminDown = false

function parseFilters(url) {
  const out = []
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue
    out.push([k, v])
  }
  return out
}
function rowMatches(row, [key, raw]) {
  const [op, ...rest] = raw.split(".")
  const arg = rest.join(".")
  const v = row[key] == null ? null : String(row[key])
  if (op === "eq") return v === arg
  if (op === "is") return arg === "null" ? v === null : v === arg
  if (op === "in") return arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(v)
  return true
}
const authLog = []
async function serveFront() {
  const inner = await serveSupabaseStub({ port: INNER_PORT, tables, users: [] })
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`)
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers })
      res.end(body === undefined ? "" : JSON.stringify(body))
    }
    if (req.method === "OPTIONS") return send(204)
    const readBody = () => new Promise((resolve) => {
      let body = ""
      req.on("data", (d) => { body += d })
      req.on("end", () => {
        try { resolve(JSON.parse(body || "null")) } catch { resolve(null) }
      })
    })
    const bearer = req.headers.authorization || ""
    const who = () => people.find((p) => bearer === `Bearer ${p.token}`)

    if (url.pathname.startsWith("/auth/v1/")) {
      authLog.push(`${req.method} ${url.pathname}${url.search.replace(/code_challenge=[^&]+/, "code_challenge=…")}`)
      const admin = url.pathname.match(/^\/auth\/v1\/admin\/users(?:\/([^/]+))?$/)
      if (admin && req.method === "GET") {
        if (adminDown) return send(500, { msg: "down" })
        if (admin[1]) {
          const p = people.find((x) => x.user.id === admin[1])
          return p ? send(200, p.user) : send(404, { msg: "User not found" })
        }
        return send(200, { users: people.map((p) => p.user), aud: "authenticated" })
      }
      if (url.pathname === "/auth/v1/authorize") {
        /* The provider's consent screen, answered at once: straight back to the callback with a code. */
        const back = url.searchParams.get("redirect_to")
        res.writeHead(302, { location: `${back}${back.includes("?") ? "&" : "?"}code=${encodeURIComponent(oauthAs || "none")}` })
        return res.end()
      }
      if (url.pathname === "/auth/v1/user" && req.method === "GET") {
        const p = who()
        return p ? send(200, p.user) : send(401, { code: 401, error_code: "no_authorization", msg: "no user" })
      }
      if (url.pathname === "/auth/v1/user" && req.method === "PUT") {
        readBody().then((body) => {
          const p = who()
          if (!p) return send(401, { msg: "no user" })
          if (body?.data) p.user.user_metadata = { ...p.user.user_metadata, ...body.data }
          send(200, p.user)
        })
        return
      }
      if (url.pathname === "/auth/v1/logout") return send(204)
      if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
        readBody().then((body) => {
          const email = String(body?.email || "").toLowerCase()
          const existing = people.find((p) => p.user.email === email)
          /* Email confirmation on: an address that has an account gets a user with no identities, and no session. */
          if (existing) return send(200, { id: "00000000-0000-4000-8000-00000000dead", aud: "authenticated", role: "", email, identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() })
          const made = addPerson({ id: `77777777-7777-4777-8777-${String(people.length).padStart(12, "0")}`, aud: "authenticated", role: "authenticated", email, email_confirmed_at: null, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: body?.data ?? {}, identities: [{ provider: "email" }], created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          send(200, sessionOf(made))
        })
        return
      }
      if (url.pathname === "/auth/v1/token") {
        readBody().then((body) => {
          const grant = url.searchParams.get("grant_type")
          if (grant === "refresh_token") {
            const p = people.find((x) => x.refresh === body?.refresh_token)
            return p ? send(200, sessionOf(p)) : send(400, { error: "invalid_grant", error_description: "Invalid Refresh Token" })
          }
          if (grant === "password") {
            const p = people.find((x) => x.user.email === String(body?.email || "").toLowerCase())
            return p ? send(200, sessionOf(p)) : send(400, { error: "invalid_grant", error_description: "Invalid login credentials" })
          }
          if (grant === "pkce") {
            const [kind, email] = String(body?.auth_code || "").split(":")
            if (!body?.code_verifier) return send(400, { error: "invalid_request", error_description: "code verifier missing" })
            let p = people.find((x) => x.user.email === email)
            if (kind === "new" && !p) {
              const now = new Date().toISOString()
              p = addPerson({ id: `88888888-8888-4888-8888-${String(people.length).padStart(12, "0")}`, aud: "authenticated", role: "authenticated", email, email_confirmed_at: now, app_metadata: { provider: "google", providers: ["google"] }, user_metadata: { full_name: "Ioana Pop", email_verified: true }, identities: [{ provider: "google" }], created_at: now, updated_at: now, last_sign_in_at: now })
            }
            return p ? send(200, sessionOf(p)) : send(400, { error: "invalid_grant", error_description: "bad code" })
          }
          send(400, { error: "unsupported_grant_type" })
        })
        return
      }
      return send(200, {})
    }

    const m = url.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/)
    if (m && (req.method === "PATCH" || req.method === "POST")) {
      readBody().then((payload) => {
        const list = (tables[m[1]] ??= [])
        if (req.method === "POST") {
          const rows = (Array.isArray(payload) ? payload : [payload]).filter(Boolean).map((r) => ({ id: r.id ?? `w-${Math.random().toString(36).slice(2, 10)}`, created_at: new Date().toISOString(), ...r }))
          for (const r of rows) {
            const same = r.id ? list.find((x) => x.id === r.id) : null
            if (same) Object.assign(same, r)
            else list.push(r)
          }
          return send(201, rows)
        }
        const hit = list.filter((r) => parseFilters(url).every((f) => rowMatches(r, f)))
        for (const r of hit) Object.assign(r, payload)
        return send(200, hit)
      })
      return
    }
    const fwd = httpRequest({ host: "127.0.0.1", port: INNER_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers)
      r.pipe(res)
    })
    fwd.on("error", () => send(502, { message: "inner stand in" }))
    req.pipe(fwd)
  })
  await new Promise((r) => server.listen(STUB_PORT, "127.0.0.1", r))
  return { close: () => { server.close(); inner.server.close() } }
}

const front = await serveFront()
let next = null
if (process.env.NO_SERVER !== "1") {
  const env = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "probe-anon-key", SUPABASE_SERVICE_ROLE_KEY: "probe-service-role-key-long-enough",
    STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: BASE,
  }
  next = spawn(process.execPath, ["--max-old-space-size=6144", NEXT_BIN, "dev", "--turbopack", "-p", String(PORT), "-H", "localhost"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  const log = process.env.NEXT_LOG || null
  next.stdout.on("data", (d) => { out += d; if (log) appendFileSync(log, d) })
  next.stderr.on("data", (d) => { out += d; if (log) appendFileSync(log, d) })
  let up = false
  for (let i = 0; i < 400 && !up; i++) {
    await sleep(1500)
    up = await fetch(`${BASE}/robots.txt`).then((r) => r.status > 0).catch(() => false)
  }
  if (!up) { console.error(`next dev did not come up\n${out.slice(-3000)}`); process.exit(1) }
  process.on("exit", () => next?.kill())
}
process.on("exit", () => front.close())

const SIGNED_OUT_PAGES = ["/", "/explore", "/maria", "/maria/film-presets", `/receipt/${ACCOUNT_TOKEN}`, "/login", "/signup"]
for (const path of [...SIGNED_OUT_PAGES, "/account/library", "/onboarding/start", `/receipt/${courseToken("390")}`]) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" }).catch((e) => ({ status: String(e) }))
  console.log(`  warm ${path} ${r.status} ${Date.now() - t0}ms`)
}
for (const [method, path, body] of [["POST", "/api/auth/account-origin", { email: "warm@example.com" }], ["GET", "/auth/continue"], ["GET", "/auth/callback?code=none"], ["GET", "/auth/start?provider=google"], ["POST", "/api/receipt/remember", { receiptToken: "warmwarmwarmwarmwarm" }]]) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}${path}`, { method, redirect: "manual", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }).catch((e) => ({ status: String(e) }))
  console.log(`  warm ${method} ${path} ${r.status} ${Date.now() - t0}ms`)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, timeout: 180_000, protocolTimeout: 240_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const DESK = { name: "1440", vp: { width: 1440, height: 900, deviceScaleFactor: 1 } }
const PHONE = { name: "390", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
const consent = { name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE }

async function newPage(ctx, view) {
  const page = await ctx.newPage()
  await page.setViewport(view.vp)
  page.__errors = []
  page.on("pageerror", (e) => page.__errors.push(String(e.message || e).slice(0, 200)))
  page.setDefaultTimeout(120_000)
  /* The note is on screen for a few seconds: what it said is kept from the moment it appears. */
  await page.evaluateOnNewDocument(() => {
    window.__arrival = null
    new MutationObserver(() => {
      const n = document.querySelector("[data-auth-arrival]")
      if (n && !window.__arrival) window.__arrival = n.textContent.trim()
    }).observe(document, { childList: true, subtree: true })
  })
  return page
}
async function fresh(view) {
  const ctx = await browser.createBrowserContext()
  const page = await newPage(ctx, view)
  await page.setCookie(consent)
  return { ctx, page }
}
async function shot(page, name) {
  if (!shots) return
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
}
async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 240_000 })
  await sleep(2500)
}
const path = (page) => page.url().replace(BASE, "")

/** What the page shows about who is signed in, measured on screen: only what has a box and is not hidden. */
function readState(page) {
  return page.evaluate(() => {
    const seen = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      for (let n = el; n; n = n.parentElement) {
        const s = getComputedStyle(n)
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false
        if (n.getAttribute && n.getAttribute("aria-hidden") === "true" && n !== el) return false
      }
      return r.bottom > 0 && r.top < innerHeight
    }
    const header = document.querySelector("header")
    const words = [...(header ? header.querySelectorAll("a, button") : [])].filter(seen).map((a) => (a.getAttribute("aria-label") || a.textContent || "").trim()).filter(Boolean)
    const bar = document.querySelector("[data-buyer-tab-bar]")
    const room = document.querySelector("[data-buyer-tabs-room]")
    const tabs = bar ? [...bar.querySelectorAll("a, button")].map((a) => a.getAttribute("aria-label") || a.textContent?.trim()).filter(Boolean) : []
    return {
      headerLogIn: words.some((w) => /^(Log in|Sign in)$/i.test(w)),
      headerSignUp: words.some((w) => /^Sign up$/i.test(w)),
      headerWords: words.slice(0, 12),
      bar: seen(bar),
      barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
      room: room ? Math.round(room.getBoundingClientRect().height) : 0,
      tabs,
      snapshot: (() => { try { return JSON.parse(localStorage.getItem("_sl_auth_v1") || "null")?.signedIn ?? null } catch { return null } })(),
      note: window.__arrival ?? null,
      receiptDoor: document.querySelector("[data-receipt-account]")?.getAttribute("data-receipt-account") ?? null,
      inLibrary: /In your library/.test(document.body?.innerText ?? ""),
    }
  })
}
/** Asked until it holds or the time is up; the last reading and how long it took. */
async function until(page, test, ms = 6000) {
  const t0 = Date.now()
  const read = () => readState(page).catch(() => null)
  let s = await read()
  while ((!s || !test(s)) && Date.now() - t0 < ms) {
    await sleep(150)
    s = await read()
  }
  s ??= { headerWords: [], tabs: [], bar: false, headerLogIn: true }
  return { s, ms: Date.now() - t0, ok: test(s) }
}
async function clickText(page, re) {
  const handle = await page.evaluateHandle((src) => {
    const re = new RegExp(src, "i")
    return [...document.querySelectorAll("button, a")].find((b) => re.test(b.textContent || "") && b.getBoundingClientRect().width > 0) || null
  }, re.source)
  const el = handle.asElement()
  if (!el) return false
  await el.click()
  return true
}
async function waitPath(page, test, ms = 60_000) {
  const t0 = Date.now()
  while (!test(path(page)) && Date.now() - t0 < ms) await sleep(250)
  return test(path(page))
}

/* ── SIGNED OUT ─────────────────────────────────────────────────────────── */
for (const view of [PHONE, DESK]) {
  console.log(`\n${view.name}: SIGNED OUT`)
  const { ctx, page } = await fresh(view)
  for (const p of SIGNED_OUT_PAGES) {
    await go(page, p)
    const s = await readState(page)
    if (view === PHONE) expect(!s.bar && s.room === 0, `${p}: no tab bar, no room kept for it`, { bar: s.bar, room: s.room })
    else if (!/^\/(login|signup)/.test(p) && p !== "/maria/film-presets") expect(s.headerLogIn || s.headerSignUp, `${p}: the header offers Log in or Sign up`, s.headerWords)
  }
  {
    for (const p of ["/maria", `/receipt/${ACCOUNT_TOKEN}`]) {
      await go(page, p)
      const href = await page.evaluate(() => [...document.querySelectorAll("header a")].find((a) => /^(Log in|Sign in|Sign up)$/.test(a.textContent.trim()) && a.getBoundingClientRect().width > 0 && getComputedStyle(a).visibility === "visible" && !a.closest("[aria-hidden=true], [inert]"))?.getAttribute("href") ?? null)
      expect(!!href && href.endsWith(`next=${encodeURIComponent(p)}`), `${p}: the header's way in comes back to it`, href)
    }
    if (view === DESK) {
      await go(page, "/")
      const home = await page.evaluate(() => [...document.querySelectorAll("header a")].find((a) => /^Log in$/.test(a.textContent.trim()) && a.getBoundingClientRect().width > 0 && getComputedStyle(a).visibility === "visible")?.getAttribute("href") ?? null)
      expect(home === "/login", "  the home's Log in stays plain (a seller still lands on the dashboard)", home)
    }
  }
  await shot(page, `${view.name}-1-signed-out`)
  await ctx.close()
}

/* ── GOOGLE NEW, from a guest receipt ───────────────────────────────────── */
for (const view of [PHONE, DESK]) {
  console.log(`\n${view.name}: GOOGLE NEW, from a guest receipt`)
  const { ctx, page } = await fresh(view)
  const token = newToken(view.name)
  await go(page, `/receipt/${token}`)
  expect((await readState(page)).receiptDoor === "create", "signed out, an address with no account: Create account")
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-receipt-create]")]).catch(() => null)
  await sleep(1500)
  expect(path(page).startsWith("/signup"), "Create account opens sign up", path(page))
  oauthAs = `new:${freshEmail(view.name)}`
  const t0 = Date.now()
  await clickText(page, /Google/)
  const landed = await waitPath(page, (p) => p.startsWith("/onboarding/start") || p.startsWith("/receipt/"))
  expect(landed && path(page).startsWith("/onboarding/start") && path(page).includes(encodeURIComponent(`/receipt/${token}`)), "a new account goes through the welcome step, carrying the receipt", path(page))
  const attached = tables.orders.find((o) => o.receipt_token === token)
  expect(!!attached.buyer_id, "  the guest order joined the new account at the Google callback", attached.buyer_id)
  expect(!!tables.orders.find((o) => o.receipt_token === courseToken(view.name)).buyer_id, "  and the course bought with the same address too")
  /* The welcome step's end goes to where they were going (lib/account/welcome welcomeDone): the receipt. */
  await go(page, `/receipt/${token}`)
  const r = await until(page, (s) => s.inLibrary && !s.headerLogIn && (view === DESK || s.bar))
  console.log(`  receipt signed in ${Date.now() - t0}ms after the Google button`)
  expect(r.s.inLibrary, "back on the receipt: In your library", r.s.receiptDoor)
  expect(!r.s.headerLogIn && !r.s.headerSignUp, "  the header shows the person, no Log in", r.s.headerWords)
  if (view === PHONE) expect(r.s.bar && !r.s.tabs.includes("Log in"), "  the tab bar is there, signed in", r.s.tabs)
  const n = await until(page, (s) => !!s.note, 5000)
  expect(n.s.note === "Account created", "  it says Account created", n.s.note)
  await shot(page, `${view.name}-2-google-new-receipt`)
  await go(page, `/receipt/${courseToken(view.name)}`)
  const c = await readState(page)
  expect(c.inLibrary && !c.headerLogIn, "the course receipt is in the library too, signed in", { inLibrary: c.inLibrary, door: c.receiptDoor })
  expect(c.note === null, "  the note is said once, not on every page", c.note)
  await go(page, "/account/library")
  const lib = await readState(page)
  expect(path(page).startsWith("/account/library") && !lib.headerLogIn, "the library opens, its header signed in", { at: path(page), words: lib.headerWords })
  const libText = await page.evaluate(() => document.body.innerText)
  await go(page, "/account/library/courses")
  const courseText = await page.evaluate(() => document.body?.innerText ?? "")
  expect(/Film Preset Pack/.test(libText) && /Editing Course/.test(courseText), "  the guest purchases are in it (the course under Courses)", { library: libText.match(/Film Preset Pack|Editing Course/g), courses: courseText.match(/Editing Course/g) })
  await shot(page, `${view.name}-3-library`)
  expect(page.__errors.length === 0, "no page errors", page.__errors)
  await ctx.close()
}

/* ── GOOGLE BACK, an existing account ───────────────────────────────────── */
for (const view of [PHONE, DESK]) {
  console.log(`\n${view.name}: GOOGLE BACK, an existing account`)
  const { ctx, page } = await fresh(view)
  await go(page, `/receipt/${ACCOUNT_TOKEN}`)
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-receipt-sign-in]")]).catch(() => null)
  await sleep(1500)
  oauthAs = `back:${BUYER.email}`
  await clickText(page, /Google/)
  const landed = await waitPath(page, (p) => p.startsWith("/receipt/") || p.startsWith("/onboarding"))
  expect(landed && path(page) === `/receipt/${ACCOUNT_TOKEN}`, "straight back on the receipt, no welcome step", path(page))
  const r = await until(page, (s) => s.inLibrary && !s.headerLogIn && (view === DESK || s.bar))
  expect(r.ok, "  In your library, the header and the tab bar signed in", { ms: r.ms, words: r.s.headerWords, bar: r.s.bar })
  const n = await until(page, (s) => !!s.note, 5000)
  expect(n.s.note === "Welcome back", "  it says Welcome back", n.s.note)
  await shot(page, `${view.name}-4-google-back-receipt`)
  await ctx.close()
}

/* ── OTHER TAB, and BACK ────────────────────────────────────────────────── */
for (const view of [PHONE, DESK]) {
  console.log(`\n${view.name}: OTHER TAB`)
  const { ctx, page } = await fresh(view)
  await go(page, "/maria")
  await page.evaluate(() => {
    window.__stay = 1
    window.__shift = 0
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: false })
  })
  const before = await readState(page)
  expect(view === PHONE ? !before.bar : before.headerLogIn || before.headerSignUp, "signed out on a creator's page", view === PHONE ? { bar: before.bar } : before.headerWords)
  const firstTop = await page.evaluate(() => Math.round(document.querySelector("main, h1")?.getBoundingClientRect().top ?? -1))
  const other = await newPage(ctx, view)
  await go(other, "/login")
  await other.type("#email", BUYER.email)
  await other.click("button[type=submit]")
  await other.waitForSelector("#password", { timeout: 20_000 }).catch(() => null)
  await other.type("#password", "correct horse battery")
  await Promise.all([other.waitForNavigation({ waitUntil: "load" }).catch(() => null), other.click("button[type=submit]")])
  await waitPath(other, (p) => !p.startsWith("/login") && !p.startsWith("/auth"))
  await page.bringToFront()
  const t0 = Date.now()
  const r = await until(page, (s) => !s.headerLogIn && (view === DESK || s.bar), 8000)
  expect(r.ok, `the open tab turned signed in by itself in ${Date.now() - t0}ms`, { words: r.s.headerWords, bar: r.s.bar, tabs: r.s.tabs })
  expect((await page.evaluate(() => window.__stay)) === 1, "  without a reload")
  const shift = await page.evaluate(() => Math.round(window.__shift * 1000) / 1000)
  const lastTop = await page.evaluate(() => Math.round(document.querySelector("main, h1")?.getBoundingClientRect().top ?? -1))
  expect(shift < 0.01 && lastTop === firstTop, "  and nothing on screen moved when the bar came", { cls: shift, topBefore: firstTop, topAfter: lastTop })
  await shot(page, `${view.name}-5-other-tab`)

  await other.close()
  await ctx.close()
}

for (const view of [PHONE, DESK]) {
  console.log(`\n${view.name}: BACK`)
  const { ctx, page } = await fresh(view)
  await go(page, "/maria")
  await page.evaluate(() => { window.__stay = 1 })
  const was = await readState(page)
  await go(page, "/login")
  await page.type("#email", BUYER.email)
  await page.click("button[type=submit]")
  await page.waitForSelector("#password", { timeout: 20_000 }).catch(() => null)
  await page.type("#password", "correct horse battery")
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }).catch(() => null), page.click("button[type=submit]")])
  await waitPath(page, (p) => !p.startsWith("/login") && !p.startsWith("/auth"))
  await sleep(1500)
  await page.goBack({ waitUntil: "load" }).catch(() => null)
  await sleep(300)
  const restored = (await page.evaluate(() => window.__stay).catch(() => undefined)) === 1
  const r = await until(page, (s) => !s.headerLogIn && (view === DESK || s.bar), 6000)
  console.log(`  back to ${path(page)}, ${restored ? "restored from the back/forward cache" : "loaded again"}; signed out before: ${was.headerLogIn || !was.bar}`)
  expect(r.ok, `back to the page from before the sign in: signed in there in ${r.ms}ms`, { words: r.s.headerWords, bar: r.s.bar })
  await shot(page, `${view.name}-6-back`)
  await ctx.close()
}

/* ── EXISTS, when the look up could not answer ──────────────────────────── */
for (const view of [DESK]) {
  console.log(`\n${view.name}: EXISTS, with the look up down and email confirmation on`)
  const { ctx, page } = await fresh(view)
  adminDown = true
  await go(page, `/signup?redirect=%2Freceipt%2F${ACCOUNT_TOKEN}`)
  await page.type("#email", BUYER.email)
  await page.click("button[type=submit]")
  await page.waitForSelector("#password", { timeout: 20_000 }).catch(() => null)
  await page.type("#password", "another password")
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }).catch(() => null), page.click("button[type=submit]")])
  await waitPath(page, (p) => p.startsWith("/login") || p.startsWith("/signup/verify"), 20_000)
  const at = new URL(page.url())
  expect(at.pathname === "/login" && at.searchParams.get("exists") === "1" && at.searchParams.get("next") === `/receipt/${ACCOUNT_TOKEN}`, "Supabase's user with no identities moves to sign in, the receipt kept", `${at.pathname}${at.search}`)
  const filled = await page.waitForFunction((want) => document.querySelector("#email")?.value === want, { timeout: 10_000 }, BUYER.email).then(() => true).catch(() => false)
  expect(filled, "  the address filled in")
  adminDown = false
  await shot(page, `${view.name}-7-exists`)
  await ctx.close()
}

await browser.close()
console.log(`\n${passed} passed, ${broken} failed`)
process.exit(broken === 0 ? 0 : 1)
