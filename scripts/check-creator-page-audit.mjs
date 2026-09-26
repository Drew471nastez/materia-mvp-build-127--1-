/**
 * ===========================================================================
 *  A CREATOR PAGE, OPENED AND USED, AND EVERYTHING IT SAYS ABOUT ITSELF
 * ===========================================================================
 * "Make sure it doesn't have any issues and errors: no glitches, no reloads,
 * no bad loading, no getting stuck."
 *
 * Opens a creator page (by default storelib.com/lucadragoste, read only) at
 * 390 as a phone and at 1280 with a mouse, and records:
 *
 *   ERRORS     every console error and warning, every uncaught exception,
 *              React's hydration and key warnings among them
 *   REQUESTS   every request that failed or answered 4xx/5xx, and every
 *              address fetched more than once while the page settled
 *   SHIFT      the layout shift score (CLS) from load to settled, with the
 *              elements that moved
 *   RELOADS    whether pressing each of the page's tabs loads a new document
 *              (it should not) or waits on a slow answer
 *   PAINT      first contentful paint and when the page stopped changing
 *
 *   node scripts/check-creator-page-audit.mjs
 *   BASE=http://127.0.0.1:3000 HANDLE=someone node scripts/check-creator-page-audit.mjs
 *   SHOTS=/some/dir   pictures of each state
 *
 *   LOCAL=1: this checkout's production build instead, served by `next
 *   start`, reading a Supabase that answers from a fixture (scripts/
 *   supabase-stub-server.mjs). Build it pointed there first:
 *
 *     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (and the other
 *     placeholders from CLAUDE.md) pnpm build
 *
 *   It then also opens the page signed in as its owner, and the creator
 *   page's editor (/creator-page), which frames that page.
 *
 * Through the session's proxy when HTTPS_PROXY is set, so it can read the
 * live site; it never signs in and never writes anything.
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const LOCAL = process.env.LOCAL === "1"
const BASE = (process.env.BASE || (LOCAL ? "http://127.0.0.1:3999" : "https://storelib.com")).replace(/\/$/, "")
const HANDLE = process.env.HANDLE || (LOCAL ? "satori" : "lucadragoste")
const SHOTS = process.env.SHOTS
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── LOCAL: the fixture Supabase and the built app ─────────────────────── */
let stub = null
let next = null
if (LOCAL) {
  const U = "11111111-1111-4111-8111-111111111111"
  const C = "22222222-2222-4222-8222-222222222222"
  const at = "2026-08-01T10:00:00.000Z"
  const user = { id: U, aud: "authenticated", role: "authenticated", email: "hi@satori.studio", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: { full_name: "Satori Studio" }, created_at: at, updated_at: at }
  const product = (n, title, price) => ({
    id: `33333333-3333-4333-8333-00000000000${n}`, creator_id: C, seller_id: C, title, slug: title.toLowerCase().replace(/\W+/g, "-"),
    description: `${title}, printed in Cluj.`, price, price_cents: Math.round(price * 100), currency: "usd", status: "published", archived: false,
    type: "digital", product_type: "digital", thumbnail_url: null, cover_image_url: null, images: [], created_at: `2026-08-0${n}T10:00:00.000Z`, updated_at: at,
    product_categories: [], reviews_count: n === 2 ? 0 : 1, reviews_average: n === 1 ? 5 : 4,
  })
  stub = await serveSupabaseStub({
    port: 54321,
    user,
    tables: {
      profiles: [{ id: U, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Prints, posters and a letter every other Sunday.", email_verified: true, is_creator: true, welcome_completed: true, created_at: at }],
      creators: [{ id: C, user_id: U, slug: HANDLE, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Prints and posters", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: at }],
      products: [product(1, "A3 print", 24), product(2, "Poster pack", 48), product(3, "Brush set", 0)],
      /* Written late on the last day of a month, UTC: east of UTC it is already the next. */
      reviews: [
        { id: "44444444-4444-4444-8444-000000000001", creator_id: C, rating: 5, content: "Lovely print, arrived rolled.", created_at: "2026-08-31T23:30:00.000Z", product: { title: "A3 print", slug: "a3-print" }, buyer: { display_name: "Ana", avatar_url: null } },
        { id: "44444444-4444-4444-8444-000000000002", creator_id: C, rating: 4, content: "Good brushes.", created_at: "2026-07-12T10:00:00.000Z", product: { title: "Brush set", slug: "brush-set" }, buyer: { display_name: "Radu", avatar_url: null } },
      ],
      store_builder_configs: [], onepages: [], follows: [], entitlements: [], custom_domains: [], seo_overrides: [], username_history: [], orders: [], store_theme_installs: [],
    },
  })
  const env = {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
    STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
  }
  next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", new URL(BASE).port, "-H", "127.0.0.1"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  next.stdout.on("data", (d) => { out += d })
  next.stderr.on("data", (d) => { out += d })
  let up = false
  for (let i = 0; i < 150 && !up; i++) {
    try { up = (await fetch(`${BASE}/robots.txt`)).status < 500 } catch { await sleep(200) }
  }
  if (!up) { console.error(`next start did not come up\n${out.slice(-2000)}`); process.exit(1) }
  process.on("exit", () => { next?.kill(); stub?.server.close() })
}

/* A reader in Romania: another language and time zone than the server's, which is where a page that formats in the reader's own shows it (a hydration error). */
const LANG = process.env.READER_LANG || "ro-RO"
const TZ = process.env.READER_TZ || "Europe/Bucharest"
const args = ["--no-sandbox", "--disable-gpu", `--lang=${LANG}`]
const remote = !/^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE)
if (remote && process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args })

const report = {}
let problems = 0
const say = (ok, what, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail ? `   ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  if (!ok) problems++
}

/* What is opened: the public page, and locally also as its owner, and its editor. */
const TARGETS = [
  { name: "visitor", path: `/${HANDLE}`, signedIn: false },
  ...(LOCAL ? [
    { name: "owner", path: `/${HANDLE}`, signedIn: true },
    { name: "editor", path: "/creator-page", signedIn: true },
    /* A page under the platform's own header (the creator page's footer links to it): the header reads who is signed in. */
    { name: "header", path: "/privacy", signedIn: true },
  ] : []),
]
const VIEWPORTS = [
  ["phone-390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["desktop-1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]
for (const target of TARGETS) for (const [size, viewport] of VIEWPORTS) {
  const label = `${target.name}-${size}`
  console.log(`\n${BASE}${target.path} as ${target.name} at ${size}`)
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport(viewport)
  await page.emulateTimezone(TZ)
  await page.setExtraHTTPHeaders({ "Accept-Language": `${LANG},${LANG.split("-")[0]};q=0.9` })
  if (target.signedIn && stub) {
    const c = stub.sessionCookie()
    await page.setCookie({ name: c.name, value: c.value, url: BASE })
  }
  const consoleLines = []
  const exceptions = []
  const failed = []
  const fetched = new Map()
  let documents = 0
  page.on("console", (m) => {
    if (LOCAL && /ERR_BLOCKED_BY_CLIENT/.test(m.text())) return
    if (m.type() === "error" || m.type() === "warn" || m.type() === "warning") consoleLines.push(`${m.type()}: ${m.text().slice(0, 300)}`)
  })
  page.on("pageerror", (e) => exceptions.push(String(e).slice(0, 300)))
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText || ""
    /* A request the page itself dropped (a prefetch replaced, a video cut short) is not a failure of the page, nor one refused on purpose here. */
    if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(why)) return
    failed.push(`${why} ${r.url().slice(0, 160)}`)
  })
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 160)}`)
  })
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++
  })
  /* What went over the network: a copy from the browser's cache is not a second fetch. */
  page.on("response", (r) => {
    const u = r.url()
    if (/^data:|^blob:/.test(u) || r.fromCache() || r.fromServiceWorker()) return
    const k = `${r.request().method()} ${u}`
    fetched.set(k, (fetched.get(k) || 0) + 1)
  })
  if (LOCAL) {
    /* Locally nothing leaves the machine: a font or a picture from elsewhere is refused, and not counted against the page. */
    await page.setRequestInterception(true)
    page.on("request", (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(r.url()) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort("blockedbyclient")))
  }
  await page.evaluateOnNewDocument(() => {
    window.__shifts = []
    window.__cls = 0
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue
          window.__cls += e.value
          window.__shifts.push({ value: Math.round(e.value * 10000) / 10000, at: Math.round(e.startTime), who: (e.sources || []).map((s) => {
            const n = s.node
            if (!n || n.nodeType !== 1) return "?"
            return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${n.className && typeof n.className === "string" ? `.${n.className.split(/\s+/).slice(0, 3).join(".")}` : ""}`
          }) })
        }
      }).observe({ type: "layout-shift", buffered: true })
    } catch {}
  })
  const t0 = Date.now()
  const res = await page.goto(`${BASE}${target.path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => ({ error: String(e) }))
  const status = res?.status?.() ?? res?.error
  await sleep(2500)
  /* The editor frames the page: it has arrived when its loader has gone and the frame is on screen. */
  if (target.name === "editor") {
    const t = Date.now()
    await page.waitForFunction(() => !document.querySelector(".wb-canvas-loader") && !!document.querySelector("iframe"), { timeout: 15000 }).catch(() => {})
    report[`${label}-arrival`] = { loaderGoneAfterMs: Date.now() - t }
  }
  /* In the editor, the page is the one in its frame: that is what is pressed and measured. */
  const framed = target.name === "editor" ? await (await page.$("iframe"))?.contentFrame() : null
  const doc = framed || page
  const paint = await doc.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]
    const nav = performance.getEntriesByType("navigation")[0]
    return { fcp: fcp ? Math.round(fcp.startTime) : null, domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav ? Math.round(nav.loadEventEnd) : null, cls: Math.round(window.__cls * 10000) / 10000, shifts: window.__shifts.slice(0, 12) }
  })
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `creator-${label}.png`) })

  /* The page's own tabs (inside the editor's frame, the page's own): pressed in turn, each should change the page in place. */
  const tabs = await doc.evaluate(() => [...document.querySelectorAll("[role=tab]")]
    .filter((e) => e.getClientRects().length && e.textContent.trim().length < 24)
    .map((e) => e.textContent.trim()).filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 6))
  const pressed = []
  for (const name of tabs) {
    const before = documents
    const clicked = await doc.evaluate((name) => {
      const el = [...document.querySelectorAll("[role=tab]")].find((e) => e.getClientRects().length && e.textContent.trim() === name)
      if (!el) return false
      el.click()
      return true
    }, name)
    if (!clicked) continue
    const t = Date.now()
    await sleep(1500)
    pressed.push({ tab: name, newDocument: documents > before, url: page.url().replace(BASE, ""), waitedMs: Date.now() - t })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `creator-${label}-${name.replace(/\W+/g, "_")}.png`) })
  }

  const hydration = [...consoleLines, ...exceptions].filter((l) => /hydrat|did not match|418|423|425/i.test(l))
  const keys = consoleLines.filter((l) => /unique "key"|same key/i.test(l))
  /* The tab's icon is the browser's own fetch, asked again each time a page sets it (DynamicFavicon); not the page's. */
  const twice = [...fetched].filter(([k, n]) => n > 1 && !/\/_next\/static\//.test(k) && !/_rsc=/.test(k) && !/\/icon\.png\?/.test(k)).map(([k, n]) => `${n}x ${k.slice(0, 150)}`)
  report[label] = { status, ms: Date.now() - t0, paint, console: consoleLines, exceptions, failed, twice, tabs: pressed }

  say(status === 200, "the page answers 200", String(status))
  say(exceptions.length === 0, "no uncaught exception", exceptions.slice(0, 3))
  say(hydration.length === 0, "no hydration error", hydration.slice(0, 3))
  say(keys.length === 0, "no React key warning", keys.slice(0, 3))
  say(consoleLines.length === 0, "nothing else in the console", consoleLines.slice(0, 5))
  say(failed.length === 0, "no request failed", failed.slice(0, 6))
  say(twice.length === 0, "nothing fetched twice", twice.slice(0, 6))
  say(paint.cls < 0.05, `layout shift ${paint.cls} (under 0.05)`, paint.shifts.slice(0, 4))
  say(pressed.every((p) => !p.newDocument), "no tab loads a new document", pressed)
  console.log(`  paint: first ${paint.fcp}ms, dom ${paint.domContentLoaded}ms, load ${paint.load}ms`)
  await context.close()
}

await browser.close()
if (SHOTS) writeFileSync(join(SHOTS, "creator-audit.json"), JSON.stringify(report, null, 2))
console.log(problems ? `\n${problems} problems\n` : "\nclean\n")
process.exit(problems ? 1 : 0)
