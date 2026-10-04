/**
 * ===========================================================================
 *  ARCHIVE AND DELETE, SEEN FROM EVERY PAGE A VISITOR OR A BUYER OPENS
 * ===========================================================================
 * "Their products are deleted but still showing, or still showing in their
 * creator page, profile, or things like this."
 *
 * This checkout's production build, served by `next start`, reading a
 * Supabase that answers from a fixture (scripts/supabase-stub-server.mjs).
 * One creator with three products:
 *
 *   Tech House Master Bundle   bought by the buyer; gets ARCHIVED
 *   Loop Pack                  nobody has it; gets DELETED
 *   Drum Kit                   stays live the whole time (the control)
 *
 * Each phase changes the fixture as the database would change, then asks
 * app/api/products/forget as the creator, as the Products list does after
 * an archive or a delete, so every cache the app keeps is purged by the
 * app's own route. Then every surface is opened, in headless Chromium for
 * the pages and by fetch for the JSON:
 *
 *   visitor   the creator page, the OnePage, the product page at both of
 *             its addresses (a 404 once it is gone), checkout by an old
 *             link (a 404), Explore, search, the sitemap, the wishlist
 *   buyer     My Library, the product in the library, the buyer dashboard
 *
 * The fixture has no row level security, so a public read that forgot to
 * filter on the status would show the archived product here even where the
 * real database would have hidden it: stricter than production, on purpose.
 * The buyer's entitlement comes back with no product once it is archived,
 * which is what row level security answers a buyer; the library has to
 * find it anyway.
 *
 * Build it pointed at the stub first:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (and the other
 *   placeholders from CLAUDE.md) pnpm build
 *   PROBE_CSS=source node scripts/check-archive-lifecycle.mjs
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE || "http://127.0.0.1:3971").replace(/\/$/, "")
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The fixture ───────────────────────────────────────────────────────── */
const HANDLE = "satori"
const at = "2026-08-01T10:00:00.000Z"
const CREATOR_USER = "11111111-1111-4111-8111-111111111111"
const C = "22222222-2222-4222-8222-222222222222"
const BUYER = "55555555-5555-4555-8555-555555555555"
const SOLD = "33333333-3333-4333-8333-000000000001"
const UNSOLD = "33333333-3333-4333-8333-000000000002"
const OTHER = "33333333-3333-4333-8333-000000000003"
const GUEST = "guest_probe-archive"
const person = (id, email, name) => ({ id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: { full_name: name }, created_at: at, updated_at: at })
const creatorUser = person(CREATOR_USER, "hi@satori.studio", "Satori Studio")
const buyerUser = person(BUYER, "ana@example.com", "Ana Buyer")

const product = (id, title, slug, n) => ({
  id, creator_id: C, seller_id: C, title, slug, description: `${title}, made in Cluj.`, price_cents: 2900, currency: "usd",
  status: "published", archived: false, type: "digital", product_type: "digital", thumbnail_url: null, gallery_urls: [], images: [],
  created_at: `2026-08-0${n}T10:00:00.000Z`, updated_at: at, product_categories: [], creators: { user_id: CREATOR_USER }, reviews_count: 0, reviews_average: 0, sales_count: 1, category: "music",
  pay_what_you_want: false, pwyw_min_price_cents: null, compare_at_cents: null, whats_included: [], faqs: [],
})
const products = [product(SOLD, "Tech House Master Bundle", "tech-house-master-bundle", 1), product(UNSOLD, "Loop Pack Nineteen", "loop-pack-nineteen", 2), product(OTHER, "Drum Kit Control", "drum-kit-control", 3)]
const byId = (id) => products.find((p) => p.id === id)
const creatorRow = { id: C, user_id: CREATOR_USER, slug: HANDLE, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: at }
const block = (id, p) => ({ id: `blk-${id}`, type: "product", enabled: true, sort_order: 1, data: { product_id: p.id, product_title: p.title, product_slug: p.slug, product_price_cents: 2900, cta_text: "Get it", show_price: true, show_description: false, style: "preview" } })
const blocks = products.map((p, i) => block(i, p))

const tables = {
  profiles: [
    { id: CREATOR_USER, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", email_verified: true, is_creator: true, welcome_completed: true, created_at: at },
    { id: BUYER, username: "ana", display_name: "Ana Buyer", avatar_url: null, email_verified: true, is_creator: false, welcome_completed: true, created_at: at },
  ],
  creators: [creatorRow],
  products,
  onepages: [{ id: "66666666-6666-4666-8666-000000000001", slug: HANDLE, status: "published", seller_id: C, creator_id: C, owner_id: CREATOR_USER, title: "Satori Studio", bio: "Loops and kits", theme: {}, settings: {}, social_links: {}, draft_blocks: blocks, published_blocks: blocks, created_at: at, updated_at: at, published_at: at }],
  /* The buyer's purchase: an order the server reads with the product in it, and the entitlement the buyer's session reads. */
  orders: [{ id: "77777777-7777-4777-8777-000000000001", product_id: SOLD, buyer_id: BUYER, creator_id: C, status: "completed", amount_cents: 2900, created_at: at, receipt_token: "rt-probe", product: byId(SOLD) }],
  entitlements: [{ id: "88888888-8888-4888-8888-000000000001", product_id: SOLD, buyer_id: BUYER, creator_id: C, created_at: at, community_access: false, product: byId(SOLD), creator: null }],
  digital_assets: [{ id: "99999999-9999-4999-8999-000000000001", product_id: SOLD, file_name: "tech-house.zip", created_at: at, upload_status: "completed" }],
  wishlist_items: products.map((p, i) => ({ id: `w${i}`, guest_id: GUEST, user_id: null, product_id: p.id, created_at: at, products: { ...p, creators: { id: C, user_id: CREATOR_USER, slug: HANDLE } } })),
  store_builder_configs: [], follows: [], reviews: [], custom_domains: [], seo_overrides: [], username_history: [], store_theme_installs: [], product_variants: [], product_slug_history: [],
}

/* ── The stub and the built app ────────────────────────────────────────── */
const stub = await serveSupabaseStub({ port: 54321, tables, users: [creatorUser, buyerUser] })
const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
}
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", new URL(BASE).port, "-H", "127.0.0.1"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
let serverOut = ""
next.stdout.on("data", (d) => { serverOut += d })
next.stderr.on("data", (d) => { serverOut += d })
let up = false
for (let i = 0; i < 150 && !up; i++) {
  try { up = (await fetch(`${BASE}/robots.txt`)).status < 500 } catch { await sleep(200) }
}
if (!up) { console.error(`next start did not come up\n${serverOut.slice(-2000)}`); process.exit(1) }
const stop = () => { next.kill(); stub.server.close() }
process.on("exit", stop)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
let problems = 0
const say = (ok, what, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail ? `   ${detail}` : ""}`)
  if (!ok) problems++
}

const cookieHeader = (userId) => {
  const c = stub.sessionCookie(userId)
  return `${c.name}=${c.value}`
}

/** A page as a browser draws it: its status and its visible text. */
async function open(path, userId = null) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  if (userId) {
    const c = stub.sessionCookie(userId)
    await page.setCookie({ name: c.name, value: c.value, url: BASE })
  }
  await page.setCookie({ name: "materia_guest_id", value: GUEST, url: BASE })
  let status = 0
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45000 })
    status = res?.status() ?? 0
  } catch (e) {
    status = -1
  }
  await sleep(300)
  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")
  const html = await page.content().catch(() => "")
  await context.close()
  return { status, text, html }
}

async function get(path, userId = null) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: [userId ? cookieHeader(userId) : "", `materia_guest_id=${GUEST}`].filter(Boolean).join("; ") }, redirect: "manual" })
  return { status: res.status, body: await res.text() }
}

/** Tell the app, as the creator, that a product changed: the same call the Products list makes (lib/products/forget-client). */
async function forget(p) {
  const res = await fetch(`${BASE}/api/products/forget`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(CREATOR_USER), origin: BASE },
    body: JSON.stringify({ productId: p.id, productSlug: p.slug }),
  })
  return res.status
}

/** Every surface, for one product: is it shown to a visitor, and does the buyer still have it. */
async function surfaces(p, { expectShown, buyerOwns }) {
  const shownWord = expectShown ? "shows" : "does not show"
  const has = (s) => s.includes(p.title)
  const creatorPage = await open(`/${HANDLE}`)
  say(creatorPage.status === 200 && has(creatorPage.text) === expectShown, `the creator page ${shownWord} ${p.title}`, `status ${creatorPage.status}`)
  const onePage = await open(`/${HANDLE}/links`)
  say(onePage.status === 200 && has(onePage.text) === expectShown, `the OnePage ${shownWord} it`, `status ${onePage.status}${process.env.DEBUG ? ` ${JSON.stringify(onePage.text.slice(0, 300))}` : ""}`)
  for (const path of [`/p/${p.slug}`, `/${HANDLE}/${p.slug}`]) {
    const r = await get(path)
    say(expectShown ? r.status === 200 : r.status === 404, `${path} answers ${expectShown ? "200" : "404"}`, `status ${r.status}`)
  }
  /* Streamed behind a Suspense boundary, so a product that is not for sale draws the not found page with a 200: what matters is that nothing is sold. */
  const checkout = await open(`/checkout?productId=${p.id}`)
  say(has(checkout.text) === expectShown, `checkout by an old link ${expectShown ? "sells it" : "sells nothing: the not found page"}`, `status ${checkout.status}${expectShown ? "" : ` ${JSON.stringify(checkout.text.slice(0, 80))}`}`)
  const explore = await open(`/explore`)
  say(has(explore.text) === expectShown, `Explore ${shownWord} it`, `status ${explore.status}`)
  const search = await get(`/api/v2/search?q=${encodeURIComponent(p.title.split(" ")[0])}`)
  say(search.body.includes(p.id) === expectShown, `search ${shownWord} it`, `status ${search.status}`)
  const sitemap = await get(`/sitemap/products-0.xml`)
  say(sitemap.body.includes(p.slug) === expectShown, `the products sitemap ${expectShown ? "lists" : "does not list"} it`, `status ${sitemap.status}`)
  const wishlist = await get(`/api/wishlist`)
  say(wishlist.body.includes(p.id) === expectShown, `a wishlist ${shownWord} it`, `status ${wishlist.status}`)
  if (buyerOwns !== undefined) {
    const library = await open(`/account/library`, BUYER)
    say(has(library.text) === buyerOwns, `My Library ${buyerOwns ? "still has" : "does not have"} it`, `status ${library.status}`)
    if (buyerOwns) {
      const item = await open(`/account/library/products/${p.id}`, BUYER)
      say(item.status === 200 && has(item.text) && item.text.includes("tech-house.zip"), "its page in the library opens, with its file", `status ${item.status}`)
      const dash = await open(`/dashboard/products`, BUYER)
      say(has(dash.text), "and the buyer dashboard lists it", `status ${dash.status}`)
    }
  }
}

const control = byId(OTHER)

console.log("\n  1. everything live (the fixture works)")
await surfaces(byId(SOLD), { expectShown: true, buyerOwns: true })
await surfaces(byId(UNSOLD), { expectShown: true })

console.log("\n  2. the bought product is archived")
Object.assign(byId(SOLD), { status: "archived", archived: true })
/* The buyer's session reads the entitlement with no product: row level security hides one that is not published. */
tables.entitlements[0].product = null
for (const w of tables.wishlist_items) if (w.product_id === SOLD) w.products.status = "archived"
say((await forget(byId(SOLD))) === 202, "the app is told, as the Products list tells it")
await surfaces(byId(SOLD), { expectShown: false, buyerOwns: true })

console.log("\n  3. the product nobody had is deleted")
const gone = byId(UNSOLD)
tables.products.splice(tables.products.indexOf(gone), 1)
tables.wishlist_items = tables.wishlist_items.filter((w) => w.product_id !== UNSOLD)
say((await forget(gone)) === 202, "the app is told")
await surfaces(gone, { expectShown: false })

console.log("\n  4. and the creator's other product was never touched")
await surfaces(control, { expectShown: true })

await browser.close()
stop()
console.log(problems === 0 ? "\nevery surface agrees" : `\n${problems} problem(s)`)
if (problems && process.env.DEBUG) console.log(serverOut.slice(-4000))
process.exit(problems ? 1 : 0)
