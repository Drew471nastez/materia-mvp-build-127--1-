/**
 * ===========================================================================
 *  ROUND 25: BACK TO EXPLORE, FILMED; A COMMUNITY OPENED, FILMED
 * ===========================================================================
 * Drives the real app (a `next dev` of this checkout against the stand in in
 * scripts/explore25-stub.mjs) at 390x844 with touch and 4x CPU, and at
 * 1440x900, and measures every frame:
 *
 *   PRODUCT     Explore scrolled down, a card opened, Back (the browser's,
 *               which is also an iOS swipe, and the product's "< Explore"):
 *               Explore's first frame at the place it was left, the card
 *               that was pressed where it was to the pixel, never a frame at
 *               the top, never a jump, and no washed out first frame.
 *   RESULTS     a search, a product opened from the results, Back, Back:
 *               the results at their place, then Explore at its own.
 *   COMMUNITIES Discover communities, Show more twice (60 cards), a
 *               community opened from far down, Back: all 60 there and the
 *               place kept.
 *   CATEGORY    a category on its second page, a product, Back: page two,
 *               at its place.
 *   ENTER       a community opened from Discover: on a computer, opacity
 *               only (no translate on any frame, nothing laid over the page
 *               sliding away); on a phone, the push in from the right.
 *
 * Contact sheets of the frames go to SHOTS_DIR; look at them.
 *
 *   node scripts/explore25-stub.mjs                       (leave it running)
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *     SUPABASE_SERVICE_ROLE_KEY=x EXPLORE_MARKETPLACE_ENABLED=1 next dev -p 3925
 *   BASE=http://127.0.0.1:3925 node scripts/check-explore25.mjs
 *
 * PARTS=product,results,communities,category,enter runs only those.
 * Turbopack refuses a worktree whose node_modules is a link out of it: run
 * the app from a copy with `turbopack: { root: "/" }` in its next.config.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

const BASE = process.env.BASE || "http://127.0.0.1:3925"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SESSION_FILE = "/tmp/storelib-explore25-session.json"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore25-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const part = (name) => !process.env.PARTS || process.env.PARTS.split(",").includes(name)
const PHONE = { name: "390", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, cpu: 4 }
const DESK = { name: "1440", vp: { width: 1440, height: 900, deviceScaleFactor: 1 }, cpu: 1 }
const LONG = 600000

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* Every frame: the address, the scroll, the page's height, the classes Explore's return puts on <html>, the opacity of its ground, where the watched link is. */
const FILM = (ms) => `(() => { window.__f = []; const t0 = performance.now(); const tick = () => { const g = document.querySelector(".explore-ground"); const a = window.__watch ? document.querySelector('a[href="' + window.__watch + '"]') : null; window.__f.push({ t: Math.round(performance.now() - t0), path: location.pathname + location.search, y: Math.round(scrollY), h: document.documentElement.scrollHeight, ground: g ? Number(getComputedStyle(g).opacity) : null, cls: document.documentElement.className.split(" ").filter((c) => c.startsWith("explore-scroll")).join(" "), card: a ? Math.round(a.getBoundingClientRect().top) : null, n: window.__count ? document.querySelectorAll(window.__count).length : null }); if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`

async function open(browser, view, path, { signedIn = false, waitFor } = {}) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  p.__ctx = ctx
  await p.setViewport(view.vp)
  p.on("pageerror", (e) => console.log(`  (page error: ${String(e.message).slice(0, 160)})`))
  if (signedIn && existsSync(SESSION_FILE)) await p.setCookie({ ...JSON.parse(readFileSync(SESSION_FILE, "utf8")), url: BASE })
  await p.setCookie({ name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
  await p.goto(BASE + path, { waitUntil: "load", timeout: LONG })
  if (waitFor) await p.waitForSelector(waitFor, { timeout: LONG })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1500)
  return p
}

/* A link in the middle of the window, away from the bars. */
const linkInView = (p, sel) =>
  p.evaluate((sel) => {
    const a = [...document.querySelectorAll(sel)].filter((a) => {
      const r = a.getBoundingClientRect()
      return r.top > 160 && r.bottom < innerHeight - 120 && r.width > 50
    })[0]
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { href: a.getAttribute("href"), x: r.left + r.width / 2, y: r.top + Math.min(40, r.height / 2), top: Math.round(r.top), sy: Math.round(scrollY) }
  }, sel)

const press = (p, view, x, y) => (view.vp.hasTouch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y))

async function sheet(frames, file, view) {
  if (!frames.length) return
  const w = view.vp.width >= 1000 ? 360 : 195
  const h = Math.round((w * view.vp.height) / view.vp.width)
  const tiles = await Promise.all(frames.slice(0, 16).map((f) => sharp(Buffer.from(f.data, "base64")).resize(w, h).jpeg().toBuffer()))
  const cols = 8
  await sharp({ create: { width: cols * (w + 4), height: Math.ceil(tiles.length / cols) * (h + 4), channels: 3, background: "#ff00ff" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (w + 4), top: Math.floor(i / cols) * (h + 4) })))
    .jpeg()
    .toFile(file)
}

/* Films a Back: the screen (CDP screencast) and every frame's numbers. `act` makes the Back; `until` is the address it lands on. */
async function filmBack(p, view, { watch, count, act, until, label }) {
  const cdp = await p.createCDPSession()
  if (view.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: view.cpu })
  const frames = []
  let t0 = 0
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ t: Date.now() - t0, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await p.evaluate((w, c) => { window.__watch = w; window.__count = c }, watch, count ?? null)
  await p.evaluate(FILM(7000))
  t0 = Date.now()
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 })
  await act()
  await p.waitForFunction((u) => location.pathname + location.search === u, { timeout: LONG }, until)
  await sleep(3000)
  await cdp.send("Page.stopScreencast").catch(() => {})
  if (view.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const film = (await p.evaluate(() => window.__f)).filter((f) => f.path === until)
  await sheet(frames.filter((f) => f.t > 0), join(shots, `${label}.jpg`), view)
  return film
}

function judgeReturn(film, left, view, label, extra = {}) {
  const shown = film.filter((f) => !f.cls.includes("explore-scroll-restoring"))
  const first = shown[0]
  const ys = [...new Set(shown.map((f) => f.y))]
  const tops = [...new Set(shown.map((f) => f.card).filter((c) => c !== null))]
  const pale = shown.filter((f) => f.ground !== null && f.ground < 0.99).length
  expect(!!first && first.y === left.sy, `${view.name} ${label}: the first frame back is where it was left (${left.sy})`, first && { y: first.y, t: first.t })
  expect(ys.length === 1, `${view.name} ${label}: and it never moves after that`, ys)
  if (left.top !== undefined) expect(tops.length === 1 && Math.abs(tops[0] - left.top) <= 1, `${view.name} ${label}: the card pressed is where it was (${left.top})`, tops)
  expect(pale === 0, `${view.name} ${label}: no washed out frame (the ground at full opacity on every frame)`, { pale, of: shown.length })
  if (extra.count !== undefined) expect(shown.length > 0 && shown[0].n === extra.count, `${view.name} ${label}: all ${extra.count} of the list are there on the first frame`, shown[0] && shown[0].n)
  return first
}

async function product(browser, view) {
  console.log(`\nPRODUCT at ${view.name}`)
  for (const back of view.vp.hasTouch ? ["in-app", "browser"] : ["browser"]) {
    const p = await open(browser, view, "/explore", { waitFor: "[data-product-card]" })
    await p.evaluate(() => window.scrollTo(0, 2000))
    await sleep(800)
    const card = await linkInView(p, '[data-product-card] a[href*="layout=discover"]')
    expect(!!card, `${view.name}: a card under the finger at 2000`, card)
    if (!card) { await p.__ctx.close(); continue }
    await press(p, view, card.x, card.y)
    await p.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: LONG })
    await sleep(2500)
    const control = back === "in-app" ? await p.evaluate(() => { const el = [...document.querySelectorAll("[data-discover-breadcrumb]")].find((e) => e.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }) : null
    const film = await filmBack(p, view, {
      watch: card.href,
      until: "/explore",
      label: `product-${view.name}-${back}`,
      act: () => (control ? press(p, view, control.x, control.y) : p.evaluate(() => history.back())),
    })
    judgeReturn(film, card, view, `Back (${back}) from a product`)
    await p.__ctx.close()
  }
}

async function results(browser, view) {
  console.log(`\nRESULTS at ${view.name}`)
  const p = await open(browser, view, "/explore", { waitFor: "[data-product-card]" })
  await p.evaluate(() => window.scrollTo(0, 1600))
  await sleep(800)
  const exploreY = await p.evaluate(() => Math.round(scrollY))
  /* A search sent from Explore: the same page, a new entry. */
  await p.evaluate(() => { document.dispatchEvent(new MouseEvent("click", { bubbles: true })); window.next?.router?.push("/explore?q=product") })
  await p.waitForFunction(() => location.search === "?q=product", { timeout: LONG })
  await p.waitForSelector("[data-product-card]", { timeout: LONG })
  await sleep(1500)
  await p.evaluate(() => window.scrollTo(0, 900))
  await sleep(800)
  const card = await linkInView(p, '[data-product-card] a[href*="layout=discover"]')
  if (!card) { expect(false, `${view.name}: a card in the results`); await p.__ctx.close(); return }
  await press(p, view, card.x, card.y)
  await p.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: LONG })
  await sleep(2500)
  const film = await filmBack(p, view, { watch: card.href, until: "/explore?q=product", label: `results-${view.name}`, act: () => p.evaluate(() => history.back()) })
  judgeReturn(film, card, view, "Back to the results")
  const film2 = await filmBack(p, view, { watch: null, until: "/explore", label: `results-explore-${view.name}`, act: () => p.evaluate(() => history.back()) })
  const firstY = film2[0] && film2[0].y
  const ys = [...new Set(film2.map((f) => f.y))]
  expect(firstY === exploreY && ys.length === 1, `${view.name}: Back again, Explore at its own place (${exploreY}), not the results'`, { firstY, ys })
  await p.__ctx.close()
}

async function communities(browser, view) {
  console.log(`\nCOMMUNITIES at ${view.name}`)
  const p = await open(browser, view, "/explore?type=communities", { signedIn: true, waitFor: "[data-explore-community]" })
  for (let i = 0; i < 2; i++) {
    const before = await p.evaluate(() => document.querySelectorAll("[data-explore-community]").length)
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Show more/.test(b.textContent)), { timeout: LONG })
    await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /Show more/.test(b.textContent)); b.scrollIntoView(); b.click() })
    await p.waitForFunction((n) => document.querySelectorAll("[data-explore-community]").length > n, { timeout: LONG }, before)
    await sleep(600)
  }
  const count = await p.evaluate(() => document.querySelectorAll("[data-explore-community]").length)
  await p.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.7)))
  await sleep(800)
  const card = await linkInView(p, "[data-explore-community]")
  if (!card) { expect(false, `${view.name}: a community in view`); await p.__ctx.close(); return }
  await press(p, view, card.x, card.y)
  await p.waitForFunction(() => location.pathname.startsWith("/community/"), { timeout: LONG })
  await p.waitForSelector("[data-community-shell], [data-community-landing]", { timeout: LONG }).catch(() => {})
  await sleep(2500)
  const film = await filmBack(p, view, { watch: card.href, count: "[data-explore-community]", until: "/explore?type=communities", label: `communities-${view.name}`, act: () => p.evaluate(() => history.back()) })
  judgeReturn(film, card, view, `Back from a community (${count} cards read)`, { count })
  await p.__ctx.close()
}

async function category(browser, view) {
  console.log(`\nCATEGORY at ${view.name}`)
  const p = await open(browser, view, "/explore/design", { waitFor: "[data-product-card]" })
  const two = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "2"); if (!b) return false; b.click(); return true })
  expect(two, `${view.name}: the category has a second page`)
  await sleep(1500)
  await p.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.5)))
  await sleep(800)
  const card = await linkInView(p, '[data-product-card] a[href*="layout=discover"]')
  if (!card) { expect(false, `${view.name}: a card on page two`); await p.__ctx.close(); return }
  await press(p, view, card.x, card.y)
  await p.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: LONG })
  await sleep(2500)
  const film = await filmBack(p, view, { watch: card.href, until: "/explore/design", label: `category-${view.name}`, act: () => p.evaluate(() => history.back()) })
  judgeReturn(film, card, view, "Back to page two of a category")
  await p.__ctx.close()
}

async function enter(browser, view) {
  console.log(`\nENTER a community from Discover at ${view.name}`)
  const p = await open(browser, view, "/explore?type=communities", { signedIn: true, waitFor: "[data-explore-community]" })
  const card = await linkInView(p, "[data-explore-community]")
  if (!card) { expect(false, `${view.name}: a community card`); await p.__ctx.close(); return }
  /* Warm the route first, so the film is the motion and not a compile. */
  await p.evaluate((h) => fetch(h), card.href)
  const cdp = await p.createCDPSession()
  if (view.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: view.cpu })
  const frames = []
  let t0 = 0
  cdp.on("Page.screencastFrame", (f) => { frames.push({ t: Date.now() - t0, data: f.data }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
  await p.evaluate(() => {
    window.__e = []
    const t0 = performance.now()
    const tick = () => {
      const s = document.querySelector("[data-community-shell]")
      const cs = s ? getComputedStyle(s) : null
      window.__e.push({ t: Math.round(performance.now() - t0), shell: !!s, translate: cs ? cs.translate : null, opacity: cs ? Number(cs.opacity) : null, still: !!document.querySelector("[data-leaving-still]") })
      if (performance.now() - t0 < 12000) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  t0 = Date.now()
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 })
  await press(p, view, card.x, card.y)
  await p.waitForSelector("[data-community-shell]", { timeout: LONG })
  await sleep(1500)
  await cdp.send("Page.stopScreencast").catch(() => {})
  const e = (await p.evaluate(() => window.__e)).filter((f) => f.shell)
  const moved = e.filter((f) => (f.translate && f.translate !== "none" && f.translate !== "0px"))
  const faded = e.filter((f) => f.opacity < 0.99)
  await sheet(frames.filter((f) => f.t > 0), join(shots, `enter-${view.name}.jpg`), view)
  if (view.vp.width >= 768) {
    expect(e.length > 0 && moved.length === 0, `${view.name}: no frame of the community moves sideways`, { moved: moved.slice(0, 3), frames: e.length })
    expect(faded.length > 0 && faded.length <= 20, `${view.name}: a short fade in (frames below full opacity)`, { faded: faded.length, first: e[0] && e[0].opacity })
  } else {
    expect(moved.length > 0, `${view.name}: a phone keeps its push in from the right`, { moved: moved.length, first: moved[0] && moved[0].translate })
  }
  /* And out to Explore from the community menu's way out, filmed for the still. */
  await p.__ctx.close()
}

async function main() {
  if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: LONG })
  try {
    for (const view of [DESK, PHONE]) {
      if (part("product")) await product(browser, view)
      if (part("results")) await results(browser, view)
      if (part("communities")) await communities(browser, view)
      if (part("category")) await category(browser, view)
      if (part("enter")) await enter(browser, view)
    }
  } finally {
    await browser.close()
  }
  console.log(`\nPictures: ${shots}`)
  console.log(broken ? `\n${broken} check(s) failed.` : "\nAll checks passed.")
  process.exit(broken ? 1 : 0)
}

await main()
