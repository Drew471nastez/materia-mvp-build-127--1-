/**
 * ===========================================================================
 *  THE ONEPAGE AS storelib.me SERVES IT, TAPPED (round 11)
 * ===========================================================================
 * The owner: "completely broken". A tap on a product showed a blank white page
 * with a spinner (owner's screenshot 24), then took them back; Instant
 * checkout said "Not found" (25). Round 10's probes all passed, because they
 * ran on storelib.com. So this one runs the REAL app, as storelib.me serves it:
 *
 *   THE APP       this checkout's production build (`next start`), proxy.ts
 *                 and all, reading a Supabase that answers from a fixture
 *                 (scripts/supabase-stub-server.mjs). Build it pointed there:
 *
 *                   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 \
 *                   NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder \
 *                   STRIPE_SECRET_KEY=sk_test_placeholder RESEND_API_KEY=re_placeholder pnpm build
 *
 *   THE HOSTS     the browser asks for https://storelib.me/... and
 *                 https://storelib.com/...; every such request is answered by
 *                 that server with that Host header (redirects not followed,
 *                 so a 308 is a 308 the browser follows itself, as it would).
 *                 Nothing else leaves the machine (Stripe's script included,
 *                 so the card field stays a shimmer).
 *
 * At 390x844 (touch, the CPU four times slower) and 1440x900, for a product
 * block set to each thing a tap can do, and Instant checkout:
 *
 *   404           no request on storelib.me answers 404, from load to the last tap
 *   CHECKOUT      Go to checkout: ONE navigation, straight to storelib.com/checkout
 *                 (no 308 from storelib.me), carrying cancel=<the OnePage>; no
 *                 white cover with a spinner on the OnePage, no blank frame
 *                 while it is still on screen; the checkout's Back lands on
 *                 the OnePage; and the browser's Back too
 *   PAGE          Open product page: the same, back=<the OnePage>, and the
 *                 product page's own Back lands on the OnePage
 *   SHEET         Open in a sheet: opens within a frame budget, follows the
 *                 finger (phone), a pull closes it, a centred window on a
 *                 computer, every part drawn; no cover, no navigation
 *   INSTANT       the window opens within a frame budget, no "Not found",
 *                 closes at once (no navigation, no reload)
 *   SHARE         the paper plane's card: the photo, never the letter over it
 *   PREVIEW       the editor's phone preview (signed in, with an Instagram
 *                 in-app browser's user agent): no tap moves the editor or the
 *                 frame, a note says it opens on the live page, the sheet and
 *                 the window open inside the frame and Pay says it is a
 *                 preview; no Open in Storelib card anywhere
 *
 *   node scripts/check-onepage-live-r11.mjs
 *   SHOTS=/some/dir   pictures (default: a temp folder, printed)
 *   ONLY=phone|desktop
 */
import { spawn } from "node:child_process"
import http from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const PORT = Number(process.env.PORT || 3991)
const SUPA_PORT = Number(process.env.SUPA_PORT || 54391)
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), "onepage-live-r11-"))
const ONLY = process.env.ONLY || ""
mkdirSync(SHOTS, { recursive: true })
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (!existsSync(join(root, ".next/BUILD_ID"))) fail("No production build here. Build it pointed at the fixture Supabase (see the top of this file).")

let known418 = 0
let passed = 0
let failed = 0
const numbers = []
const expect = (ok, name, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 400)}`}`)
}

/* ── The fixture ────────────────────────────────────────────────────────── */
const U = "11111111-1111-4111-8111-1111111111aa"
const C = "22222222-2222-4222-8222-2222222222aa"
const O = "55555555-5555-4555-8555-5555555555aa"
const P = (n) => `33333333-3333-4333-8333-0000000000a${n}`
const at = "2026-08-01T10:00:00.000Z"
const PHOTO = "https://img.probe.test/mara.png"
const user = { id: U, aud: "authenticated", role: "authenticated", email: "mara@example.com", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: { full_name: "Mara Sounds" }, created_at: at, updated_at: at }
const product = (n, title, cents, extra = {}) => ({
  id: P(n), creator_id: C, seller_id: C, title, slug: title.toLowerCase().replace(/\W+/g, "-"), description: `<p>${title}: kicks, loops and presets for late nights.</p>`,
  price: cents / 100, price_cents: cents, currency: "usd", status: "published", archived: false, type: "digital", product_type: "digital",
  thumbnail_url: PHOTO, gallery_urls: [PHOTO], images: [PHOTO], created_at: at, updated_at: at, pay_what_you_want: false, ...extra,
})
const products = [product(1, "Tech House Pack", 2000), product(2, "Drum Kit", 1500), product(3, "Mixing Course", 4900), product(4, "Bass Presets", 900)]
let order = 0
const block = (id, data) => ({ id, type: "product", enabled: true, sort_order: order++, data: { show_price: true, show_description: true, product_thumbnail: PHOTO, product_type: "digital", style: "callout", ...data } })
const fromProduct = (p) => ({ product_id: p.id, product_title: p.title, product_slug: p.slug, product_price_cents: p.price_cents, product_description: "Kicks, loops and presets" })
const blocks = [
  { id: "header", type: "header", enabled: true, sort_order: order++, data: { show_avatar: true, show_name: true, show_bio: true } },
  block("b_checkout", { ...fromProduct(products[0]), cta_text: "Go to checkout", tap_action: "checkout", instant_checkout: false }),
  block("b_page", { ...fromProduct(products[1]), cta_text: "See the page", tap_action: "page", style: "row" }),
  block("b_sheet", { ...fromProduct(products[2]), cta_text: "Look inside", tap_action: "sheet", instant_checkout: true, style: "preview" }),
  block("b_instant", { ...fromProduct(products[3]), cta_text: "Buy now", tap_action: "checkout", instant_checkout: true, style: "row" }),
]
/* lib/onepage/public-shape FALLBACK_PUBLIC_THEME: the plain white page every new OnePage starts as. */
const THEME = { background_type: "solid", background_color: "#ffffff", background_gradient: "", background_image_url: "", text_color: "#000000", secondary_text_color: "#666666", button_color: "#000000", button_text_color: "#ffffff", button_style: "filled", button_border_radius: 8, button_border_width: 0, button_border_color: "#000000", font_family: "Inter", spacing: "normal", card_width: "standard" }
const onepage = {
  id: O, slug: "mara", status: "published", owner_id: U, seller_id: C, creator_id: C, title: "Mara Sounds", bio: "Sounds for late nights", avatar_url: PHOTO,
  theme: THEME, published_theme: THEME, draft_blocks: blocks, published_blocks: blocks, blocks, social_links: {}, published_social_links: {},
  settings: { show_branding: true, analytics_enabled: true, subscribe_enabled: true }, onboarding_completed: true, created_at: at, updated_at: at, published_at: at,
}
const stub = await serveSupabaseStub({
  port: SUPA_PORT,
  user,
  tables: {
    profiles: [{ id: U, username: "mara", display_name: "Mara Sounds", avatar_url: PHOTO, bio: "Sounds", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
    creators: [{ id: C, user_id: U, slug: "mara", username: "mara", name: "Mara Sounds", display_name: "Mara Sounds", avatar_url: PHOTO, onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: "acct_probe", stripe_onboarding_status: "complete", payouts_enabled: true, charges_enabled: true, subscription_plan_id: "free", created_at: at }],
    onepages: [onepage],
    products,
    product_variants: [], store_builder_configs: [], follows: [], entitlements: [], custom_domains: [], seo_overrides: [], username_history: [], onepage_slug_history: [], orders: [], store_theme_installs: [], courses: [], course_modules: [], course_lessons: [], product_channels: [], sales_channels: [],
  },
})

/* ── The app ────────────────────────────────────────────────────────────── */
const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
}
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })
let serverLog = ""
next.stdout.on("data", (d) => { serverLog += d })
next.stderr.on("data", (d) => { serverLog += d })
process.on("exit", () => { next.kill(); stub.server.close() })
let up = false
for (let i = 0; i < 200 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/robots.txt`)).status < 500 } catch { await sleep(250) }
}
if (!up) fail(`next start did not come up\n${serverLog.slice(-3000)}`)
console.log(`app on ${PORT}, Supabase fixture on ${SUPA_PORT}, pictures in ${SHOTS}`)

/* ── The two hosts, answered by that server with their own Host header ─── */
const PNG = readFileSync(join(root, "app/(storelib)/icon.png"))
const HOSTS = new Set(["storelib.me", "storelib.com"])
const jar = new Map() /* host -> Map(name, value) */
const inflight = new Set()
if (process.env.DEBUG) setInterval(() => { if (inflight.size) console.log("    in flight:", [...inflight].join(" | ")) }, 5000).unref()
const ledger = [] /* every answer on the two hosts: { host, path, status, location } */
function ask(u, method, headers, body) {
  return new Promise((resolve, reject) => {
    const cookies = jar.get(u.host)
    const h = { ...headers, host: u.host }
    delete h["accept-encoding"]
    if (cookies?.size) h.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ")
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: `${u.pathname}${u.search}`, method, headers: h }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}
function setCookies(host, setCookie) {
  for (const line of [].concat(setCookie || [])) {
    const [pair] = String(line).split(";")
    const i = pair.indexOf("=")
    if (i < 1) continue
    if (!jar.has(host)) jar.set(host, new Map())
    jar.get(host).set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}
async function route(r) {
  let u
  try { u = new URL(r.url()) } catch { return r.abort() }
  if (u.protocol === "data:" || u.protocol === "blob:") return r.continue()
  if (u.host === "img.probe.test") return r.respond({ status: 200, contentType: "image/png", body: PNG, headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } })
  if (!HOSTS.has(u.host)) return r.abort()
  const key = `${r.method()} ${u.host}${u.pathname}`
  inflight.add(key)
  try {
    const res = await ask(u, r.method(), r.headers(), r.postData())
    inflight.delete(key)
    setCookies(u.host, res.headers["set-cookie"])
    ledger.push({ host: u.host, path: `${u.pathname}${u.search}`.slice(0, 160), status: res.status, location: res.headers.location || null, kind: r.resourceType(), at: Date.now() })
    const headers = {}
    for (const [k, v] of Object.entries(res.headers)) {
      if (["content-length", "transfer-encoding", "connection", "content-encoding"].includes(k)) continue
      headers[k] = Array.isArray(v) ? v : String(v)
    }
    return r.respond({ status: res.status, headers, body: res.body })
  } catch (e) {
    inflight.delete(key)
    return r.abort()
  }
}

const browser = await puppeteer.launch({ protocolTimeout: 60000, executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", ...(process.env.BFCACHE ? [] : ["--disable-features=BackForwardCache"])] })
const VIEWS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,5; iOS 17_5; en_US)"

/* Every document: a note of any white loading cover (components/navigation/route-loading-bar SlowPage) the moment it appears, kept in this origin's storage. */
const WATCH = `(() => {
  const note = (what) => { try { const k = "probe:covers"; const a = JSON.parse(localStorage.getItem(k) || "[]"); a.push({ what, at: Date.now(), url: location.href }); localStorage.setItem(k, JSON.stringify(a)) } catch {} }
  const look = () => { if (document.querySelector("[data-route-slow-page]")) note("slow-page") ; if (document.querySelector("[data-open-app-card]")) note("open-app-card") }
  new MutationObserver(look).observe(document, { subtree: true, childList: true })
})()`

async function open(view, url, { ua } = {}) {
  const p = await browser.newPage()
  await p.setViewport(VIEWS[view])
  if (ua) await p.setUserAgent(ua)
  const cdp = await p.target().createCDPSession()
  const slow = async () => { if (view === "phone") await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }).catch(() => {}) }
  await slow()
  await p.evaluateOnNewDocument(WATCH)
  await p.setRequestInterception(true)
  p.on("request", route)
  const errors = []
  /* Stripe's own script is not fetched here (nothing leaves the machine), so its card field saying so is expected. */
  /*
    And React's #418 on the OnePage is this harness's, not this round's: main before round 11 raises it here too, with
    no product block and no photo on the page, while production storelib.me does not (measured, round 11). Counted apart.
  */
  p.on("pageerror", (e) => { if (/#418/.test(String(e))) { known418++; return } if (!/Failed to load Stripe\.js/.test(String(e))) errors.push(`${p.url().slice(0, 60)}: ${String(e).slice(0, 160)}`) })
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) void slow() })
  await p.goto(url, { waitUntil: "load", timeout: 90000 })
  await sleep(1200)
  return { p, cdp, errors }
}

/** A finger (phone) or a mouse (computer) on the middle of an element, never waiting on what it starts. */
async function press(p, view, el) {
  const box = await el.boundingBox()
  if (!box) return false
  const x = box.x + box.width / 2
  const y = box.y + Math.min(box.height / 2, 20)
  const go = view === "phone" ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)
  await Promise.race([go.catch(() => {}), sleep(1500)])
  return true
}

/** Wait, from here, until the window's address passes `ok` (polled: a navigation may be under way). */
async function waitUrl(p, ok, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (ok(p.url())) return true
    await sleep(150)
  }
  return ok(p.url())
}
/** A page drawn and hydrated (its scripts have run), the CPU slowed or not. */
async function settled(p) {
  await p.waitForFunction(() => document.readyState === "complete", { timeout: 30000 }).catch(() => {})
  await sleep(2500)
}
/** Start a scenario on the OnePage itself, freshly loaded. */
async function home(p) {
  await p.goto(ONEPAGE, { waitUntil: "load", timeout: 60000 }).catch(() => {})
  await settled(p)
  await consent(p)
}
/* The cookie card sits over the foot of the page, as it does for a first visitor: answered once, as a visitor would. */
async function consent(p) {
  const ok = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => /^\s*Reject all\s*$/.test(b.textContent || "") && b.getBoundingClientRect().width > 0) || null)
  if (ok.asElement()) { await ok.asElement().evaluate((b) => b.click()); await sleep(600) }
}

/** The first element for a selector that is really drawn. */
async function shown(p, sel) {
  const h = await p.evaluateHandle((s) => [...document.querySelectorAll(s)].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }) || null, sel)
  return h.asElement()
}

/** Start counting frames; `stop` gives the gaps and when `sel` was first drawn, from the press. */
async function frameClock(p, sel) {
  await p.evaluate((s) => {
    window.__clock = { gaps: [], seen: null, pressed: null, last: performance.now() }
    addEventListener("pointerdown", () => { window.__clock.pressed ??= performance.now() }, { capture: true, once: true })
    addEventListener("click", () => { window.__clock.pressed ??= performance.now() }, { capture: true, once: true })
    const tick = (t) => {
      const c = window.__clock
      c.gaps.push(t - c.last)
      c.last = t
      if (c.seen === null && c.pressed !== null) {
        const el = s ? [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight }) : null
        if (el) c.seen = t
      }
      if (c.gaps.length < 600) window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
  }, sel)
  return async () =>
    p.evaluate(() => {
      cancelAnimationFrame(window.__raf)
      const c = window.__clock
      const g = c.gaps.slice(2)
      const sorted = [...g].sort((a, b) => a - b)
      return { toSeenMs: c.seen && c.pressed ? Math.round(c.seen - c.pressed) : null, frames: g.length, worstMs: Math.round(Math.max(0, ...g)), p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0), over34: g.filter((x) => x > 34).length }
    })
}

/** Film the window while `act` runs; each frame's share of near-white pixels, decoded in a page of its own. */
async function film(p, cdp, act, ms) {
  const frames = []
  const t0 = Date.now()
  const on = (f) => { frames.push({ at: Date.now() - t0, data: f.data, url: p.url() }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) }
  cdp.on("Page.screencastFrame", on)
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 50, everyNthFrame: 1 })
  await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast").catch(() => {})
  cdp.off("Page.screencastFrame", on)
  return frames
}
let reader = null
async function whiteness(frames, back) {
  reader ??= await browser.newPage()
  /* A page in a background tab draws no frames: the one under test goes back in front afterwards. */
  const out = await reader.evaluate(async (list) => {
    const out = []
    for (const f of list) {
      const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${f}`)).blob())
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext("2d")
      g.drawImage(bmp, 0, 0)
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data
      let white = 0
      let n = 0
      for (let i = 0; i < d.length; i += 4 * 7) { n++; if (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244) white++ }
      out.push(white / n)
    }
    return out
  }, frames.map((f) => f.data))
  await back.bringToFront()
  return out
}

async function covers(p) {
  return p.evaluate(() => { try { const a = JSON.parse(localStorage.getItem("probe:covers") || "[]"); localStorage.removeItem("probe:covers"); return a } catch { return [] } }).catch(() => [])
}
/* /favicon.ico is a 404 on storelib.com and storelib.me alike in production (no such file; the page names its own icon): not this probe's subject. */
const meNotFound = (from) => ledger.filter((l) => l.at >= from && l.host === "storelib.me" && l.status === 404 && l.path !== "/favicon.ico")
const ONEPAGE = "https://storelib.me/mara"

async function tapBlock(p, view, id) {
  const el = await shown(p, `[data-product-tap] , a[href]`)
  void el
  const target = await p.evaluateHandle((bid) => {
    const all = [...document.querySelectorAll("[data-product-tap]")]
    /* Each block by the words on its button (the fixture's cta_text). */
    const words = { b_checkout: "Go to checkout", b_page: "See the page", b_sheet: "Look inside", b_instant: "Buy now" }[bid]
    return all.filter((e) => e.getBoundingClientRect().width > 0).find((e) => (e.textContent || "").includes(words)) || null
  }, id)
  const a = target.asElement()
  if (!a) return false
  await a.evaluate((e) => e.scrollIntoView({ block: "center" }))
  await sleep(400)
  return press(p, view, a)
}

/* ═════════════════════════════════════════════════════════════════════════ */

for (const view of ["phone", "desktop"]) {
  if (ONLY && ONLY !== view) continue
  console.log(`\n━━━ ${view} (${VIEWS[view].width}x${VIEWS[view].height}${view === "phone" ? ", touch, CPU 4x" : ""}) ━━━`)
  const t0 = Date.now()
  const { p, cdp, errors } = await open(view, ONEPAGE)
  await p.screenshot({ path: join(SHOTS, `${view}-0-onepage.png`) })
  await consent(p)
  const drawn = (await p.$$("[data-product-tap]")).length >= 4
  expect(drawn, "the OnePage is drawn on storelib.me with its four product blocks", await p.evaluate(() => document.title))
  if (!drawn) fail(`The OnePage did not draw. The server said:\n${serverLog.slice(-4000)}`)
  const taps = await p.$$eval("[data-product-tap]", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ tap: e.getAttribute("data-product-tap"), href: e.getAttribute("href"), stays: e.hasAttribute("data-stays-here") })))
  expect(taps.some((t) => t.tap === "navigate" && /^https:\/\/storelib\.com\/checkout\?productId=.*&cancel=https%3A%2F%2Fstorelib\.me%2Fmara/.test(t.href)), "Go to checkout links straight to storelib.com/checkout, with cancel=<this OnePage>", taps[0]?.href)
  expect(taps.some((t) => t.tap === "navigate" && /^https:\/\/storelib\.com\/p\/drum-kit\?back=https%3A%2F%2Fstorelib\.me%2Fmara/.test(t.href)), "Open product page links straight to storelib.com/p/..., with back=<this OnePage>", taps[1]?.href)
  expect(taps.filter((t) => t.tap !== "navigate").every((t) => t.stays), "the sheet and the window's links say they stay here (no loading cover starts)")

  /* ── Go to checkout ── */
  {
    const from = Date.now()
    await covers(p)
    let firstNav = null
    const onReq = (r) => { if (r.isNavigationRequest() && r.frame() === p.mainFrame() && !firstNav) firstNav = { url: r.url(), chain: r.redirectChain().length } }
    p.on("request", onReq)
    let leftAt = null
    const onNav = (f) => { if (f === p.mainFrame() && !p.url().startsWith(ONEPAGE) && leftAt === null) leftAt = Date.now() }
    p.on("framenavigated", onNav)
    const frames = await film(p, cdp, () => tapBlock(p, view, "b_checkout"), 6000)
    p.off("request", onReq)
    p.off("framenavigated", onNav)
    const url = p.url()
    expect(/^https:\/\/storelib\.com\/checkout\?/.test(url), "lands on storelib.com/checkout", url.slice(0, 160))
    expect(firstNav && /^https:\/\/storelib\.com\/checkout/.test(firstNav.url), "in ONE navigation: the first request is storelib.com's (no 308 from storelib.me)", firstNav)
    const hops = ledger.filter((l) => l.at >= from && l.kind === "document")
    expect(!hops.some((l) => l.status >= 300 && l.status < 400), "no redirect on the way", hops.map((h) => `${h.status} ${h.host}${h.path.slice(0, 60)}`))
    const white = await whiteness(frames, p)
    const before = frames.map((f, i) => ({ ...f, white: white[i] })).filter((f) => leftAt === null || f.at < leftAt - from - 40)
    const blankBefore = before.filter((f) => f.white > 0.985)
    expect(blankBefore.length === 0, "no blank frame while the OnePage is still on screen", { frames: before.length, blank: blankBefore.map((f) => f.at) })
    frames.forEach((f, i) => { if (i % 6 === 0 || white[i] > 0.985) writeFileSync(join(SHOTS, `${view}-1-checkout-${String(f.at).padStart(5, "0")}.jpg`), Buffer.from(f.data, "base64")) })
    await p.screenshot({ path: join(SHOTS, `${view}-1-checkout.png`) })
    await settled(p)
    const backLink = await shown(p, "[data-back]")
    expect(!!backLink, "the checkout has its Back")
    const backHref = backLink ? await backLink.evaluate((e) => e.getAttribute("href")) : null
    expect(backHref === ONEPAGE, "and it points at the OnePage, not the product or the creator page", backHref)
    if (backLink) {
      await settled(p)
      await press(p, view, backLink)
      await waitUrl(p, (u) => u.startsWith(ONEPAGE))
      await sleep(1500)
    }
    expect(p.url().startsWith(ONEPAGE), "the checkout's Back lands on the OnePage", p.url())
    const seen = await covers(p)
    expect(!seen.some((c) => c.what === "slow-page"), "no white loading cover on the OnePage at any point", seen)
  }

  /* ── The browser's own Back ── */
  {
    await home(p)
    await tapBlock(p, view, "b_checkout")
    await waitUrl(p, (u) => u.startsWith("https://storelib.com/"))
    await settled(p)
    await covers(p)
    const frames = await film(p, cdp, async () => { void p.goBack({ timeout: 30000 }).catch(() => null); await waitUrl(p, (u) => u.startsWith(ONEPAGE)) }, 2500)
    expect(p.url().startsWith(ONEPAGE), "the browser's Back lands on the OnePage", p.url())
    const seen = await covers(p)
    expect(!seen.some((c) => c.what === "slow-page"), "with no spinner page in between", seen)
    const white = await whiteness(frames, p)
    const afterCommit = frames.map((f, i) => ({ at: f.at, url: f.url, white: white[i] })).filter((f) => f.url.startsWith(ONEPAGE))
    numbers.push({ view, what: "browser Back: frames on the OnePage, near-white share max", value: Math.max(0, ...afterCommit.slice(2).map((f) => f.white)).toFixed(3) })
  }

  /* ── Open product page ── */
  {
    await home(p)
    const from = Date.now()
    await tapBlock(p, view, "b_page")
    await waitUrl(p, (u) => u.startsWith("https://storelib.com/p/"))
    await settled(p)
    expect(/^https:\/\/storelib\.com\/p\/drum-kit\?back=/.test(p.url()), "Open product page lands on storelib.com/p/drum-kit, carrying the way back", p.url().slice(0, 120))
    const docs = ledger.filter((l) => l.at >= from && l.kind === "document")
    expect(!docs.some((l) => l.host === "storelib.me"), "never through storelib.me's 308", docs.map((d) => `${d.status} ${d.host}${d.path.slice(0, 50)}`))
    await p.screenshot({ path: join(SHOTS, `${view}-2-product-page.png`) })
    const back = await shown(p, "[data-back-control]")
    const href = back ? await back.evaluate((e) => e.getAttribute("href")) : null
    expect(href === ONEPAGE, "its Back is the OnePage, not the creator page", href)
    if (back) {
      await press(p, view, back)
      await waitUrl(p, (u) => u.startsWith(ONEPAGE))
      await sleep(1500)
    }
    expect(p.url().startsWith(ONEPAGE), "the product page's Back lands on the OnePage", p.url())
    const seen = await covers(p)
    expect(!seen.some((c) => c.what === "slow-page"), "no white loading cover on the way", seen)
  }

  /* ── Open in a sheet ── */
  {
    await home(p)
    await covers(p)
    const stop = await frameClock(p, view === "phone" ? "[data-app-sheet] [data-sheet-panel]" : "[role=dialog] [data-product-sheet]")
    await tapBlock(p, view, "b_sheet")
    await sleep(900)
    const t = await stop()
    numbers.push({ view, what: "sheet open: press to drawn (ms), worst frame (ms), frames over 34ms", value: [t.toSeenMs, t.worstMs, t.over34] })
    expect(t.toSeenMs !== null && t.toSeenMs <= (view === "phone" ? 250 : 120), `the sheet is up within the frame budget (${view === "phone" ? 250 : 120}ms)`, t)
    expect(p.url() === `${ONEPAGE}#product-mixing-course`, "no navigation: the address only gains #product-<slug>", p.url())
    const parts = await p.evaluate(() => {
      const root = [...document.querySelectorAll("[data-product-sheet]")].find((e) => e.getBoundingClientRect().height > 0)
      if (!root) return null
      const has = (s) => !!root.querySelector(s)
      return { gallery: has("[data-product-sheet-gallery] img"), price: root.querySelector("[data-product-sheet-price]")?.textContent ?? "", description: has("[data-product-sheet-description]"), buy: has("[data-product-sheet-buy]"), page: root.querySelector("[data-product-sheet-page]")?.getAttribute("href") ?? null }
    })
    expect(!!parts && parts.gallery && /49/.test(parts.price) && parts.description && parts.buy, "every part is drawn: picture, price, description, buy", parts)
    expect(!!parts && /^https:\/\/storelib\.com\/p\/mixing-course\?back=/.test(parts.page || ""), "See full page goes straight to storelib.com, with the way back", parts?.page)
    await p.screenshot({ path: join(SHOTS, `${view}-3-sheet.png`) })
    if (view === "phone") {
      const panel = await p.evaluate(() => { const el = document.querySelector("[data-app-sheet] [data-sheet-panel]"); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 14, top: r.top } })
      expect(!!panel, "a phone gets the app's own bottom sheet (components/ui/bottom-sheet)")
      if (panel) {
        const follow = []
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: panel.x, y: panel.y }] })
        for (let i = 1; i <= 12; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: panel.x, y: panel.y + i * 16 }] })
          await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
          const top = await p.evaluate(() => document.querySelector("[data-app-sheet] [data-sheet-panel]")?.getBoundingClientRect().top ?? null)
          follow.push(top === null ? null : Math.round(top - panel.top))
        }
        const lag = follow.slice(3).map((d, i) => Math.abs((i + 4) * 16 - d))
        numbers.push({ view, what: "sheet drag: panel offset per 16px finger step", value: follow })
        expect(follow.slice(3).every((d) => d !== null) && Math.max(...lag) <= 24, "the sheet follows the finger, in real time", { follow, lag })
        /* And the flick a thumb ends a pull with: four quick moves, then the lift. */
        for (let i = 1; i <= 4; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: panel.x, y: panel.y + 192 + i * 50 }] })
        const closeClock = await frameClock(p, null)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(700)
        const c = await closeClock()
        const still = await p.evaluate(() => !!document.querySelector("[data-app-sheet='open']"))
        expect(!still, "a pull down closes it", c)
        numbers.push({ view, what: "sheet close after the pull: worst frame (ms), frames over 34ms", value: [c.worstMs, c.over34] })
      }
    } else {
      const box = await p.evaluate(() => { const el = [...document.querySelectorAll("[data-product-sheet]")].find((e) => e.getBoundingClientRect().height > 0)?.closest("[role=dialog]"); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: innerWidth - r.right, width: r.width } })
      expect(!!box && Math.abs(box.left - box.right) < 4 && box.width <= 600, "a computer gets a centred window", box)
      const closeClock = await frameClock(p, null)
      await p.keyboard.press("Escape")
      await sleep(500)
      const c = await closeClock()
      const still = await p.evaluate(() => [...document.querySelectorAll("[data-product-sheet]")].some((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e.closest("[role=dialog]") || e).opacity !== "0"))
      expect(!still, "Escape closes it", c)
    }
    await sleep(400)
    expect(p.url() === ONEPAGE, "closed, the address is the OnePage's again", p.url())
    const seen = await covers(p)
    expect(!seen.some((c) => c.what === "slow-page"), "no white loading cover while it was up or after (the owner's screenshot 24)", seen)
  }

  /* ── Instant checkout ── */
  {
    await home(p)
    const from = Date.now()
    await covers(p)
    const stop = await frameClock(p, "[data-instant-checkout] [role=dialog]")
    await tapBlock(p, view, "b_instant")
    await sleep(1500)
    const t = await stop()
    numbers.push({ view, what: "instant checkout open: press to drawn (ms), worst frame (ms), frames over 34ms", value: [t.toSeenMs, t.worstMs, t.over34] })
    expect(t.toSeenMs !== null && t.toSeenMs <= (view === "phone" ? 250 : 120), `the window is up within the frame budget (${view === "phone" ? 250 : 120}ms)`, t)
    const body = await p.evaluate(() => document.querySelector("[data-instant-checkout]")?.textContent || "")
    expect(!/Not found/i.test(body) && /Bass Presets/.test(body) && /Pay \$9\.00|Pay/.test(body), "the window has the product, the fields and Pay; never \"Not found\" (screenshot 25)", body.slice(0, 160))
    const box = await p.evaluate(() => { const r = document.querySelector("[data-instant-checkout] [role=dialog]")?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) } : null })
    expect(view === "phone" ? box?.w === 390 : !!box && box.w <= 520 && Math.abs(box.left - (1440 - box.w) / 2) < 3, view === "phone" ? "full width on a phone" : "a centred window on a computer", box)
    await p.screenshot({ path: join(SHOTS, `${view}-4-instant.png`) })
    const closeAt = Date.now()
    const x = await shown(p, "[data-instant-checkout] [data-join-close]")
    if (x) await press(p, view, x)
    await p.waitForFunction(() => !document.querySelector("[data-instant-checkout]"), { timeout: 3000 }).catch(() => {})
    const gone = Date.now() - closeAt
    numbers.push({ view, what: "instant checkout close: press to gone (ms, includes the 140ms fade and the probe's round trip)", value: gone })
    expect(gone < 600 && p.url() === ONEPAGE, "it closes at once, in place: no navigation, no reload", { gone, url: p.url() })
    const notFound = meNotFound(from)
    expect(notFound.length === 0, "none of its calls is a 404 on storelib.me", notFound)
    const seen = await covers(p)
    expect(!seen.some((c) => c.what === "slow-page"), "no white loading cover", seen)
  }

  /* ── The share card ── */
  {
    await home(p)
    const btn = await shown(p, "[data-onepage-share-button]")
    if (btn) {
      await press(p, view, btn)
      await sleep(900)
      const avatar = await p.evaluate(() => {
        const a = [...document.querySelectorAll("[data-app-avatar]")].find((e) => e.getBoundingClientRect().width >= 70)
        if (!a) return null
        const img = a.querySelector("img")
        const letters = [...a.querySelectorAll("span")].filter((s) => s.textContent?.trim()).map((s) => s.textContent)
        return { state: a.getAttribute("data-state"), imgOpacity: img ? getComputedStyle(img).opacity : null, letters }
      })
      expect(!!avatar && avatar.state === "photo" && avatar.imgOpacity === "1" && avatar.letters.length === 0, "the share card shows the photo, and no letter over it", avatar)
      await p.screenshot({ path: join(SHOTS, `${view}-5-share.png`) })
      await p.keyboard.press("Escape").catch(() => {})
      await p.evaluate(() => document.querySelector("[data-onepage-share-button]")?.click?.()).catch(() => {})
    } else expect(false, "the share button is there")
  }

  const nf = meNotFound(t0)
  expect(nf.length === 0, "no request on storelib.me answered 404, from the first load to the last tap", nf.map((n) => n.path))
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

/* ═════ The editor's preview ═══════════════════════════════════════════════ */
if (!ONLY || ONLY === "preview" || ONLY === "phone" || ONLY === "desktop") {
  for (const view of ["desktop", "phone"]) {
    if (ONLY && ONLY !== "preview" && ONLY !== view) continue
    console.log(`\n━━━ the editor's preview, ${view} (an Instagram in-app browser's user agent${view === "phone" ? ", full screen Preview" : ""}) ━━━`)
    const previewFrom = Date.now()
    const cookie = stub.sessionCookie()
    jar.set("storelib.com", new Map([[cookie.name, cookie.value], ["sl_cookie_consent", "1"]]))
    const { p, errors } = await open(view, "https://storelib.com/app/onepage", { ua: view === "phone" ? IG_UA : undefined })
    const editorUrl = p.url()
    if (view === "phone") {
      const btn = await p.evaluateHandle(() => [...document.querySelectorAll("button, a")].find((b) => /^\s*Preview\s*$/i.test(b.textContent || "") && b.getBoundingClientRect().width > 0) || null)
      if (btn.asElement()) { await press(p, "phone", btn.asElement()); await sleep(2500) }
    }
    const frameEl = await p.waitForSelector("[data-onepage-preview-frame]", { timeout: 30000 }).catch(() => null)
    expect(!!frameEl, "the editor draws its preview frame", editorUrl)
    if (!frameEl) { console.log("    page errors:", errors.slice(0, 4), "\n    server:", serverLog.slice(-1500)); await p.screenshot({ path: join(SHOTS, `preview-${view}-missing.png`) }); await p.close(); continue }
    expect((await frameEl.evaluate((f) => f.getAttribute("sandbox") || "")).split(" ").every((t) => !/top-navigation|popups/.test(t)), "the frame cannot move the editor or open a tab (sandbox)")
    const frame = await frameEl.contentFrame()
    await frame.waitForSelector("[data-product-tap]", { timeout: 30000 }).catch(() => null)
    await sleep(1500)
    const frameUrl = frame.url()
    const tapIn = async (i) => {
      const words = ["Go to checkout", "See the page", "Look inside", "Buy now"][i]
      const h = await frame.evaluateHandle((w) => [...document.querySelectorAll("[data-product-tap]")].filter((e) => e.getBoundingClientRect().width > 0).find((e) => (e.textContent || "").includes(w)) || null, words)
      const a = h.asElement()
      if (!a) return false
      await a.evaluate((e) => e.scrollIntoView({ block: "center" }))
      await sleep(300)
      /* A click dispatched in the frame: the editor shows the frame scaled down, and a press by coordinates there can land on the block next to it. */
      await a.evaluate((e) => e.click())
      return true
    }
    const note = () => frame.evaluate(() => document.querySelector("[data-preview-notice]")?.textContent || null)
    for (const [i, what] of [[0, "Go to checkout"], [1, "Open product page"]]) {
      await tapIn(i)
      await sleep(400)
      const said = await note()
      expect(p.url() === editorUrl && frame.url() === frameUrl && (await browser.pages()).length <= 3, `${what}: the editor and the frame stay where they are, no tab opens`, { editor: p.url(), frame: frame.url() })
      expect(/live page/i.test(said || ""), `  and a note says it opens on the live page`, said)
      await sleep(2200)
    }
    await tapIn(2)
    await sleep(1200)
    expect(await frame.evaluate(() => [...document.querySelectorAll("[data-product-sheet]")].some((e) => e.getBoundingClientRect().height > 0)), "Open in a sheet opens inside the frame")
    await p.screenshot({ path: join(SHOTS, `preview-${view}-sheet.png`) })
    const page = await frame.$("[data-product-sheet-page]")
    if (page) { await page.evaluate((e) => e.click()); await sleep(400); expect(p.url() === editorUrl && /live page/i.test((await note()) || ""), "  its See full page stays, with the note") }
    await frame.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    await frame.evaluate(() => history.back()).catch(() => {})
    await sleep(900)
    await tapIn(3)
    await sleep(1800)
    const win = await frame.evaluate(() => ({ open: !!document.querySelector("[data-instant-checkout]"), preview: document.querySelector("[data-instant-preview]")?.textContent || null }))
    expect(win.open && /preview/i.test(win.preview || ""), "Instant checkout opens inside the frame and says it is a preview", win)
    await p.screenshot({ path: join(SHOTS, `preview-${view}-instant.png`) })
    expect(!ledger.some((l) => l.at >= previewFrom && /\/api\/checkout\//.test(l.path)), "nothing is charged from the preview: no checkout call reaches the server", ledger.filter((l) => l.at >= previewFrom && /\/api\/checkout\//.test(l.path)))
    const close = await frame.$("[data-instant-checkout] [data-join-close]")
    if (close) await close.evaluate((e) => e.click())
    await sleep(500)
    const share = await frame.$("[data-onepage-share-button]")
    if (share) {
      await share.evaluate((e) => e.click())
      await sleep(700)
      const x = await frame.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "X" || b.textContent?.trim().endsWith("X")) || null)
      if (x.asElement()) { await x.asElement().evaluate((e) => e.click()); await sleep(400) }
      expect(p.url() === editorUrl && frame.url() === frameUrl && (await browser.pages()).length <= 3, "a share target stays inside the preview too", await note())
    }
    const cards = await covers(p)
    const inFrame = await frame.evaluate(() => { try { return JSON.parse(localStorage.getItem("probe:covers") || "[]") } catch { return [] } }).catch(() => [])
    expect(![...cards, ...inFrame].some((c) => c.what === "open-app-card") && !(await p.$("[data-open-app-card]")), "no Open in Storelib card in the editor or its preview", [...cards, ...inFrame])
    expect(errors.length === 0, "no page errors in the editor", errors)
    await p.close()
  }
}

console.log("\nNumbers (frame times are this machine's; it was running other builds):")
for (const n of numbers) console.log(`  ${n.view.padEnd(7)}  ${n.what}: ${JSON.stringify(n.value)}`)
writeFileSync(join(SHOTS, "numbers.json"), JSON.stringify({ numbers, ledger: ledger.filter((l) => l.status >= 300) }, null, 2))
if (known418) console.log(`\n(React #418 seen ${known418} times on the OnePage in this harness; main raises it here too)`)
console.log(`\n${passed} passed, ${failed} failed. Pictures: ${SHOTS}\n`)
await browser.close()
process.exit(failed ? 1 : 0)
