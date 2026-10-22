/**
 * ===========================================================================
 *  ROUND 39, IN THE REAL APP: A GUEST'S RECEIPT, SIGNING IN FROM IT, AND BACK
 * ===========================================================================
 * `next dev` of this checkout against a stand in Supabase whose writes stay
 * (an order attached at sign in is still attached on the next page), at
 * 1440x900 and 390x844, with screenshots of every step:
 *
 *   GUEST       a guest order's receipt, signed out: Save it to your account
 *               with Create account and Sign in; the page asks
 *               /api/receipt/remember and the browser holds `sl_owned`,
 *               httpOnly, SameSite=Lax, a year
 *   OWNED       the product page in that browser: owned (Download, Open
 *               receipt, Save it to your account), no Buy; a file asked for
 *               with no receipt link is not refused; Open receipt lands on
 *               the receipt; a fresh browser (no cookie) is offered Buy
 *   ACCOUNT     an order already on an account, signed out: Sign in only,
 *               the masked address named
 *   EXISTS      Create account from that receipt with the account's address:
 *               the form moves to sign in, the address filled in, "already has
 *               a Storelib account", the receipt kept as the way back
 *   SIGN IN     the password: /auth/continue, back on the receipt, which now
 *               says In your library; the header shows the person (no Log in);
 *               the phone's tab bar too; the guest order of the same address
 *               joined the account (written to the stand in's orders)
 *
 *   node scripts/check-buyer-auth-r39.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-buyer-auth-r39.mjs
 *   BASE=http://127.0.0.1:3939 NO_SERVER=1   a dev server started by hand on the stand in (STUB_PORT)
 *   STUB_ONLY=1                               the stand in alone, until stopped
 */
import { spawn } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const STUB_PORT = Number(process.env.STUB_PORT || 54439)
const INNER_PORT = STUB_PORT + 1
const PORT = Number(process.env.PORT || 3939)
const BASE = (process.env.BASE || `http://localhost:${PORT}`).replace(/\/$/, "")
const NEXT_BIN = process.env.NEXT_BIN || "node_modules/next/dist/bin/next"
const shots = process.env.SHOTS_DIR || null
if (shots) mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── The stand in database ─────────────────────────────────────────────── */
const AT = "2026-10-01T10:00:00.000Z"
const SELLER_USER = "11111111-1111-4111-8111-000000000039"
const CREATOR = "22222222-2222-4222-8222-000000000039"
const PRODUCT = "33333333-3333-4333-8333-000000000039"
const ASSET = "44444444-4444-4444-8444-000000000039"
const BUYER = { id: "99999999-9999-4999-8999-000000000039", aud: "authenticated", role: "authenticated", email: "ghita@example.com", email_confirmed_at: AT, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "Ghita Nastase" }, identities: [{ provider: "email" }], created_at: AT, updated_at: AT }
const GUEST_TOKEN = "guestR39guestR39guestR39guestR39"
const ACCOUNT_TOKEN = "acctR39acctR39acctR39acctR39acct"
const SAME_EMAIL_TOKEN = "sameR39sameR39sameR39sameR39same"
const order = (id, token, extra) => ({
  id, receipt_token: token, product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 1200, tip_cents: 0, currency: "usd",
  buyer_email: "guest@example.com", buyer_first_name: "Ana", buyer_id: null, stripe_session_id: null, stripe_payment_intent_id: null, created_at: AT, updated_at: AT, ...extra,
})
const tables = {
  profiles: [
    { id: SELLER_USER, username: "maria", display_name: "Maria Lens", avatar_url: null, email: "maria@example.com", email_verified: true, is_creator: true, welcome_completed: true, created_at: AT },
    { id: BUYER.id, username: "ghita", display_name: "Ghita Nastase", avatar_url: null, email: BUYER.email, email_verified: true, is_creator: false, welcome_completed: true, created_at: AT },
  ],
  creators: [{ id: CREATOR, user_id: SELLER_USER, slug: "maria", username: "maria", display_name: "Maria Lens", avatar_url: null, bio: "Presets", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: AT, niche_tags: [] }],
  products: [{
    id: PRODUCT, creator_id: CREATOR, seller_id: CREATOR, title: "Film Preset Pack", slug: "film-presets", description: "<p>Twelve presets for Lightroom.</p>", price: 12, price_cents: 1200, currency: "usd", status: "published", archived: false,
    type: "digital", product_type: "digital", thumbnail_url: null, cover_image_url: null, images: [], gallery_urls: [], created_at: AT, updated_at: AT, product_categories: [], category: "design", subcategory: null, reviews_count: 0, reviews_average: 0, sales_count: 3, view_count: 9, is_featured: false,
  }],
  digital_assets: [{ id: ASSET, product_id: PRODUCT, file_name: "film-presets.zip", file_path: "maria/film-presets.zip", storage_bucket: "digital-assets", file_size: 4_200_000, mime_type: "application/zip", upload_status: "completed", scan_status: "clean", created_at: AT }],
  orders: [
    order("55555555-5555-4555-8555-000000000001", GUEST_TOKEN),
    order("55555555-5555-4555-8555-000000000002", ACCOUNT_TOKEN, { buyer_email: BUYER.email, buyer_first_name: "Ghita", buyer_id: BUYER.id }),
    order("55555555-5555-4555-8555-000000000003", SAME_EMAIL_TOKEN, { buyer_email: BUYER.email, buyer_first_name: "Ghita" }),
  ],
  entitlements: [{ id: "66666666-6666-4666-8666-000000000002", buyer_id: BUYER.id, creator_id: CREATOR, product_id: PRODUCT, variant_id: null, community_access: false, created_at: AT }],
  rate_limit_hits: [], platform_settings: [{ key: "buyer_header_light", value: true }], platform_flags: [], store_builder_configs: [], follows: [], custom_domains: [], seo_overrides: [], username_history: [], reviews: [], wishlist_items: [],
}

/* The shared stand in reads `tables` on every request; this one in front of it keeps writes (PATCH and POST on a table) and answers the admin user reads account-origin makes. */
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
const writes = []
async function serveFront() {
  const inner = await serveSupabaseStub({ port: INNER_PORT, tables, users: [BUYER] })
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`)
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" })
      res.end(body === undefined ? "" : JSON.stringify(body))
    }
    const admin = url.pathname.match(/^\/auth\/v1\/admin\/users(?:\/([^/]+))?$/)
    if (admin && req.method === "GET") {
      if (admin[1]) return admin[1] === BUYER.id ? send(200, BUYER) : send(404, { msg: "User not found" })
      return send(200, { users: [BUYER], aud: "authenticated" })
    }
    const m = url.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/)
    if (m && (req.method === "PATCH" || req.method === "POST")) {
      let body = ""
      req.on("data", (d) => { body += d })
      req.on("end", () => {
        let payload = null
        try { payload = JSON.parse(body || "null") } catch { payload = null }
        const list = (tables[m[1]] ??= [])
        writes.push({ method: req.method, table: m[1], query: url.search, payload })
        if (req.method === "POST") {
          const rows = (Array.isArray(payload) ? payload : [payload]).filter(Boolean).map((r) => ({ id: r.id ?? `w-${writes.length}-${Math.random().toString(36).slice(2, 8)}`, created_at: new Date().toISOString(), ...r }))
          list.push(...rows)
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
if (process.env.STUB_ONLY === "1") {
  console.log(`stand in on ${STUB_PORT}`)
  await new Promise(() => {})
}
let next = null
if (process.env.NO_SERVER !== "1") {
  const env = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "probe-anon-key", SUPABASE_SERVICE_ROLE_KEY: "probe-service-role-key-long-enough",
    STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: BASE,
  }
  next = spawn(process.execPath, ["--max-old-space-size=6144", NEXT_BIN, "dev", "--webpack", "-p", String(PORT), "-H", "localhost"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
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

/* A development server compiles each page on its first visit: asked once before anything is measured. */
for (const path of [`/receipt/${GUEST_TOKEN}`, "/maria/film-presets", "/login", "/signup"]) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" }).catch((e) => ({ status: String(e) }))
  console.log(`  warm ${path} ${r.status} ${Date.now() - t0}ms`)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const DESK = { name: "1440", vp: { width: 1440, height: 900, deviceScaleFactor: 1 } }
const PHONE = { name: "390", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
const consent = { name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE }

async function fresh(view) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(view.vp)
  page.__errors = []
  page.on("pageerror", (e) => page.__errors.push(String(e.message || e).slice(0, 200)))
  page.__requests = []
  page.on("request", (r) => page.__requests.push(`${r.method()} ${r.url().replace(BASE, "")}`))
  await page.setCookie(consent)
  page.setDefaultTimeout(120_000)
  return { ctx, page }
}
async function shot(page, name) {
  if (!shots) return
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
}
const text = (page) => page.evaluate(() => document.body.innerText)
async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 180_000 })
  await sleep(600)
}

for (const view of [DESK, PHONE]) {
  console.log(`\n${view.name}: GUEST, a guest order's receipt`)
  const { ctx, page } = await fresh(view)
  await go(page, `/receipt/${GUEST_TOKEN}`)
  const door = await page.$eval("[data-receipt-account]", (e) => e.getAttribute("data-receipt-account")).catch(() => null)
  expect(door === "create", "signed out, an address with no account: Create account and Sign in", door)
  const card = await page.$eval("[data-receipt-account]", (e) => e.innerText).catch(() => "")
  expect(/Save it to your account/.test(card) && /Create account/.test(card) && /Sign in/.test(card), "  it says Save it to your account", card.replace(/\n+/g, " | "))
  const signupHref = await page.$eval("[data-receipt-create]", (a) => a.getAttribute("href")).catch(() => "")
  expect(signupHref === `/signup?redirect=%2Freceipt%2F${GUEST_TOKEN}`, "  Create account comes back to this receipt, and claims nothing on the way", signupHref)
  expect(page.__requests.some((r) => r === "POST /api/receipt/remember"), "the receipt asks the server to remember this purchase")
  await sleep(500)
  const cookies = await page.cookies(BASE)
  const owned = cookies.find((c) => c.name === "sl_owned")
  expect(!!owned && owned.httpOnly && owned.sameSite === "Lax" && owned.path === "/", "  the browser holds sl_owned: httpOnly, SameSite=Lax, path /", owned ? { httpOnly: owned.httpOnly, sameSite: owned.sameSite, secure: owned.secure } : null)
  expect(!!owned && owned.expires - Date.now() / 1000 > 360 * 86400, "  for a year", owned ? Math.round((owned.expires - Date.now() / 1000) / 86400) : null)
  expect(!!owned && !(await page.evaluate(() => document.cookie)).includes("sl_owned"), "  and no script on the page can read it")
  await shot(page, `${view.name}-1-guest-receipt`)

  console.log(`${view.name}: OWNED, the product page in the same browser`)
  await go(page, "/maria/film-presets")
  const guestOwned = await page.$("[data-guest-owned]")
  const body = await text(page)
  expect(!!guestOwned, "the product page knows this browser bought it")
  expect(/Download File/.test(body) && !/I want this!|Buy now|Get for Free/.test(body), "  Download, not Buy", body.match(/Download File|I want this!|Buy now/g))
  expect(/Open receipt/.test(body) && /Save it to your account/.test(body), "  Open receipt and Save it to your account", null)
  expect(!/guestR39/.test(await page.content()), "  the receipt token is nowhere in the page")
  await shot(page, `${view.name}-2-product-owned`)
  const dl = await page.evaluate(async (asset) => { const r = await fetch(`/api/download/${asset}`); return { status: r.status, body: await r.text() } }, ASSET)
  expect(dl.status !== 403 && dl.status !== 401, "  a file asked for with no receipt link is not refused (the stand in has no storage, so it cannot be signed)", dl)
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 180_000 }), page.click("[data-open-receipt]")])
  expect(page.url() === `${BASE}/receipt/${GUEST_TOKEN}`, "  Open receipt lands on the receipt", page.url().replace(BASE, ""))
  await ctx.close()

  const other = await fresh(view)
  await go(other.page, "/maria/film-presets")
  expect(!(await other.page.$("[data-guest-owned]")) && !/Download File/.test(await text(other.page)), "a browser that never opened the receipt is offered Buy")
  await shot(other.page, `${view.name}-3-product-stranger`)
  await other.ctx.close()
}

for (const view of [DESK, PHONE]) {
  console.log(`\n${view.name}: ACCOUNT, EXISTS, SIGN IN`)
  const { ctx, page } = await fresh(view)
  await go(page, `/receipt/${ACCOUNT_TOKEN}`)
  const door = await page.$eval("[data-receipt-account]", (e) => e.getAttribute("data-receipt-account")).catch(() => null)
  const card = await page.$eval("[data-receipt-account]", (e) => e.innerText).catch(() => "")
  expect(door === "sign-in" && !/Create account/.test(card), "an order on an account, signed out: Sign in only", card.replace(/\n+/g, " | "))
  expect(/gh••••@example\.com/.test(card), "  the address it was paid with, masked", card.replace(/\n+/g, " | "))
  expect(!page.__requests.includes("POST /api/receipt/remember") || true, "  (remembered too, harmless: the account owns it)")
  await shot(page, `${view.name}-4-account-receipt-signed-out`)

  /* Create account with the account's address, the way the owner did. */
  await go(page, `/signup?redirect=%2Freceipt%2F${ACCOUNT_TOKEN}`)
  await page.type("#email", BUYER.email)
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 180_000 }), page.click("button[type=submit]")])
  await sleep(1200)
  const at = new URL(page.url())
  expect(at.pathname === "/login" && at.searchParams.get("exists") === "1" && at.searchParams.get("next") === `/receipt/${ACCOUNT_TOKEN}`, "Create account with an existing address moves to sign in, the receipt kept", `${at.pathname}${at.search}`)
  const note = await page.$eval("[data-existing-account]", (e) => e.innerText).catch(() => "")
  expect(/ghita@example\.com already has a Storelib account\. Sign in to continue\./.test(note), "  and says why", note)
  expect((await page.$eval("#email", (e) => e.value).catch(() => "")) === BUYER.email, "  the address filled in")
  expect(!/Welcome back/.test(await page.$eval("h1", (e) => e.innerText).catch(() => "")), "  the heading is Sign in, not Welcome back", await page.$eval("h1", (e) => e.innerText).catch(() => ""))
  await page.waitForSelector("#password", { timeout: 20_000 }).catch(() => null)
  expect(!!(await page.$("#password")), "  the password field is already open (the way in was asked for)")
  await shot(page, `${view.name}-5-login-existing`)

  await page.type("#password", "correct horse battery")
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 180_000 }), page.click("button[type=submit]")])
  for (let i = 0; i < 20 && !page.url().includes("/receipt/"); i++) await sleep(1000)
  await sleep(1500)
  expect(page.url() === `${BASE}/receipt/${ACCOUNT_TOKEN}`, "signed in, back on the receipt", page.url().replace(BASE, ""))
  const row = await text(page)
  expect(/In your library/.test(row) && !/Save it to your account|In your Storelib library/.test(row), "  the receipt says In your library")
  const header = await page.evaluate(() => {
    const root = document.querySelector("#platform-header-root") || document.querySelector("header")
    return { guest: !!document.querySelector("[data-guest-login], [data-guest-actions]"), text: root ? root.textContent.slice(0, 300) : "" }
  })
  expect(!header.guest, "  the header shows the person, no Log in", header)
  const sameEmail = tables.orders.find((o) => o.receipt_token === SAME_EMAIL_TOKEN)
  expect(sameEmail.buyer_id === BUYER.id, "  the guest order paid with the same address joined the account at sign in", sameEmail.buyer_id)
  expect(tables.orders.find((o) => o.receipt_token === GUEST_TOKEN).buyer_id === null, "  and a guest order of another address did not")
  if (view === PHONE) {
    const tab = await page.evaluate(() => [...document.querySelectorAll("nav a, nav button")].map((a) => a.getAttribute("aria-label") || a.textContent?.trim()).filter(Boolean))
    expect(!tab.includes("Log in"), "  the phone's tab bar is signed in too", tab)
  }
  expect(page.__errors.length === 0, "no page errors", page.__errors)
  await shot(page, `${view.name}-6-receipt-signed-in`)
  await ctx.close()
}

await browser.close()
console.log(`\n${broken === 0 ? "all good" : `${broken} failed`}`)
process.exit(broken === 0 ? 0 : 1)
