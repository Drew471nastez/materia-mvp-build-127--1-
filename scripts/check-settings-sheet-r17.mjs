/**
 * ===========================================================================
 *  SETTINGS OVER A PAGE: THE PAGE STAYS PUT (round 17)
 * ===========================================================================
 * The owner: "when I switch between tabs in the settings sheet it bugs the
 * things behind the settings sheet, it becomes white ... and when I close the
 * sheet and then open settings again, it reloads the page I opened settings
 * from."
 *
 * A production build (`next start`) reading the Supabase stub
 * (scripts/supabase-stub-server.mjs), signed in as one creator, in a real
 * Chromium, so the real App Router (app/app/@sheet/(.)settings over the page
 * it was opened from) does what it does for the owner. On a computer
 * (1440x900): Products opened, the page under it marked, Settings opened from
 * the sidebar, every section pressed in the column in turn, the sheet closed,
 * and Settings opened and closed once more. At every step:
 *
 *   UNDER        the page under the sheet is the same page, still mounted
 *                (the marked element is the one in the document), and still
 *                drawn (its text is there, its box is not empty)
 *   NO RELOAD    the document is the one the run started on (a mark on window)
 *   ROUND TRIPS  the router's requests for a server render (RSC) a step made:
 *                a section pressed should make none for the page under it
 *   BLANK        the page under the sheet never shows as white: a screenshot
 *                of a strip the sheet does not cover, every 50ms while it
 *                moves
 *
 * Build pointed at the stub first (as scripts/check-dashboard-roundtrips.mjs):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
 *   SUPABASE_SERVICE_ROLE_KEY=placeholder STRIPE_SECRET_KEY=sk_test_placeholder
 *   RESEND_API_KEY=re_placeholder pnpm build
 *   node scripts/check-settings-sheet-r17.mjs          BUDGET=0 to report only, SHOTS=<dir>
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE || "http://127.0.0.1:3982").replace(/\/$/, "")
const BUDGET = process.env.BUDGET !== "0"
/* VIEW=desktop|tablet|phone, FROM=/app/products (the page Settings is opened over). */
const VIEW = { desktop: [1440, 900], laptop: [1280, 800], wide: [2560, 1440], tablet: [900, 1100], phone: [390, 844] }[process.env.VIEW ?? "desktop"]
const FROM = process.env.FROM ?? "/app/products"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
if (!existsSync(".next/BUILD_ID")) { console.error("No production build. Build pointed at the stub first (see the top of this file)."); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok && BUDGET) broken++
}

/* ── The fixture: one creator with a few products (scripts/check-dashboard-roundtrips.mjs) ── */
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
const tables = {
  profiles: [{ id: USER, username: HANDLE, display_name: "Satori Studio", avatar_url: null, email: person.email, email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
  creators: [{ id: C, user_id: USER, slug: HANDLE, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", currency: "usd", created_at: at }],
  products: [1, 2, 3, 4].map(product),
}

/* STUB_DELAY_MS: each database answer that late (a real database is 10 to 50ms away). */
const stub = await serveSupabaseStub({ port: 54321, tables, users: [person], delayMs: Number(process.env.STUB_DELAY_MS || 0) })
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
await page.setViewport({ width: VIEW[0], height: VIEW[1], ...(VIEW[0] < 1024 ? { isMobile: true, hasTouch: true } : {}) })
const ck = stub.sessionCookie()
await page.setCookie({ name: ck.name, value: ck.value, url: BASE })
const errors = []
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
let rsc = []
let api = []
page.on("request", (r) => { const h = r.headers(); if (h["rsc"] && !h["next-router-prefetch"]) rsc.push(r.url().replace(BASE, "")); if (r.url().startsWith(`${BASE}/api/`)) api.push(r.url().replace(BASE, "")) })
let documents = 0
page.on("framenavigated", (f) => { if (f === page.mainFrame()) documents++ })

/* Settings opened as a person opens it: the visible link (the rail, the gear), or on a phone the account menu's Settings row. */
async function openSettings() {
  /* On screen: inside the window, not a link kept mounted in a sheet below it. */
  const onScreen = () => page.evaluate(() => { const a = [...document.querySelectorAll("a[href='/app/settings']")].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  let at = await onScreen()
  const touch = VIEW[0] < 1024
  if (!at) {
    const t = await page.evaluate(() => { const b = document.getElementById("account-trigger"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    if (!t) throw new Error("no Settings link and no account menu")
    if (touch) await page.touchscreen.tap(t.x, t.y)
    else await page.mouse.click(t.x, t.y)
    for (let i = 0; i < 40 && !at; i++) { await sleep(100); at = await onScreen() }
    await sleep(400)
    at = await onScreen()
  }
  if (!at) throw new Error("the account menu showed no Settings row")
  if (touch) await page.touchscreen.tap(at.x, at.y)
  else await page.mouse.click(at.x, at.y)
  if (process.env.VERBOSE) { await sleep(800); console.log(`  pressed Settings at ${JSON.stringify(at)}; now at ${page.url().replace(BASE, "")}, sheet ${await page.evaluate(() => !!document.querySelector("[data-settings-sheet]"))}`) }
}

/* The sections: the column on a computer, the list of rows below 1024px. */
const TAB_ATTR = VIEW[0] >= 1024 ? "data-settings-side-tab" : "data-settings-tab"
const TAB_SEL = `[${TAB_ATTR}]`

/* The page under the sheet, marked: its first product's row (an element of the page, not of the shell). */
const MARK = () => {
  window.__probeDoc = window.__probeDoc || Math.random()
  const el = [...document.querySelectorAll("main h1, main h2")].find((n) => n.getClientRects().length && n.getBoundingClientRect().height > 0)
  if (el) el.__probeUnder = true
  /* What the page under says, word for word, before Settings is opened over it: a page that changes under the sheet says something else. */
  window.__probeText = (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim()
  return { doc: window.__probeDoc, found: !!el }
}
const UNDER = () => {
  const el = [...document.querySelectorAll("main *")].find((n) => n.__probeUnder)
  const r = el ? el.getBoundingClientRect() : null
  const now = (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim()
  return { doc: window.__probeDoc ?? null, same: !!el && el.isConnected, drawn: !!r && r.width > 0 && r.height > 0, text: now.length > 40, unchanged: now === window.__probeText, says: now === window.__probeText ? "" : now.slice(0, 120) }
}

/* While a step runs: a strip at the very left of the screen (the sidebar's edge and the page beside it, under the dim), every 50ms, and how white it is. */
async function whiteWhile(act, ms = 1200) {
  const shots = []
  let on = !process.env.NOWHITE
  /* The press first: a screenshot being taken as it lands can swallow it. The strip is read from 60ms on. */
  const acting = act()
  await sleep(60)
  const loop = (async () => {
    while (on) {
      /* The strip of the page the sheet leaves in view on a computer: under the top bar, above the sheet's edge. */
      const b = await page.screenshot({ clip: VIEW[0] >= 1024 ? { x: 260, y: 62, width: VIEW[0] - 300, height: 40 } : { x: 0, y: 0, width: VIEW[0], height: 60 }, encoding: "binary" }).catch(() => null)
      if (b) shots.push(b)
      await sleep(50)
    }
  })()
  await acting
  await sleep(ms)
  on = false
  await loop
  /* A strip the dim covers is a mid grey at most; a page gone white under it reads near white. Measured as its mean brightness, from the PNG's raw size as a proxy is not enough, so decode the pixels. */
  const { inflateSync } = await import("node:zlib")
  const mean = (buf) => {
    let o = 8, w = 0, h = 0, type = 0
    const idat = []
    while (o < buf.length) { const len = buf.readUInt32BE(o), kind = buf.toString("ascii", o + 4, o + 8); if (kind === "IHDR") { w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12); type = buf[o + 17] } else if (kind === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len)); o += 12 + len }
    const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat))
    let prev = Buffer.alloc(stride), sum = 0, n = 0
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
      for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; if (f === 1) line[x] = (line[x] + a) & 255; else if (f === 2) line[x] = (line[x] + b) & 255; else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 } }
      for (let x = 0; x < w; x++) { sum += (line[x * bpp] + line[x * bpp + 1] + line[x * bpp + 2]) / 3; n++ }
      prev = line
    }
    return n ? sum / n : 0
  }
  return shots.map(mean)
}

console.log(`\nOpening ${FROM}, then Settings over it (${VIEW.join("x")})`)
await page.goto(`${BASE}${FROM}`, { waitUntil: "load", timeout: 60000 })
if (!page.url().startsWith(`${BASE}/app`)) { console.error(`Not signed in: landed on ${page.url()}`); process.exit(1) }
await page.waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, { timeout: 30000 })
await sleep(Number(process.env.SETTLE_MS ?? 1500))
const marked = await page.evaluate(MARK)
expect(marked.found, "the page under is marked (its first product)")
documents = 0
rsc = []
const openShots = await whiteWhile(async () => {
  await openSettings()
  await page.waitForSelector(TAB_SEL, { timeout: 30000 }).catch(async (e) => {
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "r17-no-tabs.png") })
    console.log(`  at ${page.url().replace(BASE, "")}; settings attributes: ${await page.evaluate(() => [...new Set([...document.querySelectorAll("*")].flatMap((n) => [...n.attributes].map((a) => a.name)).filter((a) => /settings/.test(a)))].join(" "))}`)
    throw e
  })
})
const settledBrightness = openShots[openShots.length - 1]
let u = await page.evaluate(UNDER)
expect(u.same && u.drawn && u.text, "opened: the page under is the same page, still drawn", u)
if (SHOTS) await page.screenshot({ path: join(SHOTS, "r17-open.png") })

const tabs = await page.evaluate((sel, attr) => [...document.querySelectorAll(sel)].filter((b) => b.getClientRects().length).map((b) => b.getAttribute(attr)), TAB_SEL, TAB_ATTR)
console.log(`\nEvery section in the column (${tabs.length}: ${tabs.join(", ")})`)
const perTab = []
for (const tab of [...tabs.slice(1), tabs[0]]) {
  rsc = []
  api = []
  const docsBefore = documents
  const shots = await whiteWhile(() => page.evaluate((t, attr) => [...document.querySelectorAll(`[${attr}='${t}']`)].find((b) => b.getClientRects().length)?.click(), tab, TAB_ATTR), 700)
  const under = await page.evaluate(UNDER)
  const whitest = Math.max(...shots)
  perTab.push({ tab, api: api.filter((a) => !/\/api\/(settings|account|billing|domains|payments|stripe|me|store|team|ai-memory|markets|taxes|channels|checkout|emails\/settings|integrations|activity|physical|notifications\/preferences)/.test(a)), unchanged: under.unchanged, says: under.says, rsc: rsc.length, rscUrls: rsc.slice(0, 3), same: under.same, drawn: under.drawn, text: under.text, reload: under.doc !== marked.doc, whitest: Math.round(whitest), at: page.url().replace(BASE, "") })
  console.log(`  ${tab.padEnd(14)} rsc ${String(rsc.length).padStart(2)}  under ${under.same ? "same" : "REPLACED"}${under.text ? "" : ", NO TEXT"}${under.unchanged ? "" : `, CHANGED: "${under.says}"`}  brightest strip ${Math.round(whitest)} (settled ${Math.round(settledBrightness)})  ${page.url().replace(BASE, "")}`)
}
expect(perTab.every((t) => t.same && t.drawn && t.text), "every section: the page under stays the same page, drawn", perTab.filter((t) => !(t.same && t.drawn && t.text)).map((t) => t.tab))
expect(perTab.every((t) => !t.reload), "every section: nothing reloads", perTab.filter((t) => t.reload).map((t) => t.tab))
expect(perTab.every((t) => t.unchanged), "every section: the page under says exactly what it said before Settings opened", perTab.filter((t) => !t.unchanged).map((t) => ({ tab: t.tab, says: t.says })))
expect(perTab.every((t) => t.whitest <= settledBrightness + 25), "every section: the page under never shows white", perTab.filter((t) => t.whitest > settledBrightness + 25).map((t) => ({ tab: t.tab, whitest: t.whitest })))
expect(perTab.every((t) => t.rsc === 0), "every section: no server render of the page under (or of anything)", perTab.filter((t) => t.rsc > 0).map((t) => ({ tab: t.tab, rsc: t.rsc, urls: t.rscUrls })))

console.log("\nClose, then Settings again, then close again")
for (const round of [1, 2]) {
  rsc = []
  const docsBefore = documents
  /* Closed as a person closes it: the sheet's own close (a Back on a phone), pressed. */
  const shots = await whiteWhile(async () => {
    const at = await page.evaluate(() => { const b = [...document.querySelectorAll("[aria-label='Close settings']")].find((x) => x.getClientRects().length); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    if (!at) return page.keyboard.press("Escape")
    if (VIEW[0] < 1024) await page.touchscreen.tap(at.x, at.y)
    else await page.mouse.click(at.x, at.y)
  }, 1500)
  u = await page.evaluate(UNDER)
  const atUrl = page.url().replace(BASE, "")
  expect(atUrl.startsWith(FROM) && u.same && u.text && u.unchanged && u.doc === marked.doc, `closed (${round}): back on ${FROM}, the same page, not reloaded`, { at: atUrl, ...u, rsc: rsc.length, rscUrls: rsc.slice(0, 4) })
  expect(Math.max(...shots) <= settledBrightness + 25 || shots.length === 0, `closed (${round}): the page under never shows white while the sheet goes`, Math.round(Math.max(...shots)))
  if (round === 2) break
  rsc = []
  const before = documents
  await whiteWhile(async () => {
    await openSettings()
    await page.waitForSelector(TAB_SEL, { timeout: 30000 })
  })
  u = await page.evaluate(UNDER)
  expect(u.same && u.text && u.doc === marked.doc, "opened again: the page under is the same page, not reloaded", { ...u, rsc: rsc.length, rscUrls: rsc.slice(0, 4) })
}
expect(errors.length === 0, "nothing thrown", errors)
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
await browser.close()
process.exit(broken && BUDGET ? 1 : 0)
